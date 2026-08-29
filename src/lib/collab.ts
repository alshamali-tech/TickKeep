/* Collaboration engine — merge-based sync over a shared storage location.
 * Design goal: teammates never destroy each other's work.
 *  - adds are unioned
 *  - edits are last-write-wins, with a deterministic content-hash tiebreak so
 *    two devices merging the same concurrent edits ALWAYS converge
 *  - deletes propagate via tombstones (never resurrected by a stale snapshot)
 *  - invoice numbering takes the max (never collides) */
import {
  useStore,
  type Client, type Project, type Task, type TimeEntry, type Invoice, type Expense,
  type Estimate, type RecurringTemplate, type Tombstone, type Peer,
} from "./store";

export interface SharedFile {
  clients?: Client[];
  projects?: Project[];
  tasks?: Task[];
  entries?: TimeEntry[];
  invoices?: Invoice[];
  expenses?: Expense[];
  estimates?: Estimate[];
  recurringTemplates?: RecurringTemplate[];
  tombstones?: Tombstone[];
  peers?: Peer[];
  invDefaults?: { nextNumber?: number };
}

export interface MergeStats {
  added: number;
  updated: number;
  removed: number;
}

export class CollabError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

interface Row {
  id: string;
  createdAt: string;
  updatedAt?: string;
}

const stamp = (r: Row): number => Date.parse(r.updatedAt ?? r.createdAt) || 0;

/** Deterministic content hash — breaks timestamp ties so both merge orders
 * pick the same winner (commutativity ⇒ convergence, no divergence races). */
function tiebreak(r: Row): number {
  const str = JSON.stringify(r);
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

export function mergeCollections<T extends Row>(local: T[], remote: T[], dead: Set<string>): T[] {
  const map = new Map<string, T>();
  for (const r of remote) if (!dead.has(r.id)) map.set(r.id, r);
  for (const r of local) {
    if (dead.has(r.id)) continue;
    const existing = map.get(r.id);
    if (!existing) map.set(r.id, r);
    else if (
      stamp(r) > stamp(existing) ||
      (stamp(r) === stamp(existing) && tiebreak(r) > tiebreak(existing))
    ) {
      map.set(r.id, r);
    }
  }
  return [...map.values()];
}

export function mergePeers(local: Peer[], remote: Peer[], nowIso: string): Peer[] {
  const map = new Map<string, Peer>();
  for (const p of [...remote, ...local]) {
    const existing = map.get(p.id);
    if (!existing || Date.parse(p.at) >= Date.parse(existing.at)) map.set(p.id, p);
  }
  const cutoff = Date.now() - 5 * 60 * 1000;
  return [...map.values()]
    .filter((p) => Date.parse(p.at) > cutoff)
    .sort((a, b) => b.at.localeCompare(a.at));
}

function mergeTable<T extends Row>(
  table: string,
  local: T[],
  remote: T[],
  tombstones: Tombstone[]
): { rows: T[]; removed: number } {
  const dead = new Set(tombstones.filter((t) => t.t === table).map((t) => t.id));
  const rows = mergeCollections(local, remote, dead);
  const localIds = new Set(local.map((r) => r.id));
  const remoteIds = new Set(remote.map((r) => r.id));
  let removed = 0;
  for (const id of localIds) if (dead.has(id) && remoteIds.has(id)) removed++;
  return { rows, removed };
}

function diffStats<T extends Row>(before: T[], after: T[]): MergeStats {
  const beforeMap = new Map(before.map((r) => [r.id, r]));
  const afterMap = new Map(after.map((r) => [r.id, r]));
  let added = 0;
  let updated = 0;
  for (const [id, r] of afterMap) {
    const b = beforeMap.get(id);
    if (!b) added++;
    else if (stamp(r) > stamp(b)) updated++;
  }
  let removed = 0;
  for (const id of beforeMap.keys()) if (!afterMap.has(id)) removed++;
  return { added, updated, removed };
}

export interface MergeResult {
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  entries: TimeEntry[];
  invoices: Invoice[];
  expenses: Expense[];
  estimates: Estimate[];
  recurringTemplates: RecurringTemplate[];
  tombstones: Tombstone[];
  peers: Peer[];
  nextNumber: number;
  stats: MergeStats;
}

export function validateSharedFile(raw: unknown): SharedFile {
  if (!raw || typeof raw !== "object") {
    throw new CollabError("shape", "The shared file isn't a TickKeep snapshot.");
  }
  const r = raw as SharedFile;
  const arrays: Array<[string, unknown]> = [
    ["clients", r.clients], ["projects", r.projects], ["tasks", r.tasks],
    ["entries", r.entries], ["invoices", r.invoices], ["expenses", r.expenses],
  ];
  for (const [name, val] of arrays) {
    if (val !== undefined && !Array.isArray(val)) {
      throw new CollabError("shape", `The shared file's "${name}" collection is corrupted.`);
    }
  }
  return r;
}

export function computeMerge(remote: SharedFile, nowIso: string): MergeResult {
  const s = useStore.getState();

  // union tombstones (they only ever accumulate)
  const tombstones = (() => {
    const map = new Map<string, Tombstone>();
    for (const t of [...(remote.tombstones ?? []), ...s.tombstones]) map.set(`${t.t}:${t.id}`, t);
    return [...map.values()];
  })();

  const clients = mergeTable("clients", s.clients, remote.clients ?? [], tombstones);
  const projects = mergeTable("projects", s.projects, remote.projects ?? [], tombstones);
  const tasks = mergeTable("tasks", s.tasks, remote.tasks ?? [], tombstones);
  const entries = mergeTable("entries", s.entries, remote.entries ?? [], tombstones);
  const invoices = mergeTable("invoices", s.invoices, remote.invoices ?? [], tombstones);
  const expenses = mergeTable("expenses", s.expenses, remote.expenses ?? [], tombstones);
  const estimates = mergeTable("estimates", s.estimates, remote.estimates ?? [], tombstones);
  const recurringTemplates = mergeTable(
    "recurringTemplates",
    s.recurringTemplates,
    remote.recurringTemplates ?? [],
    tombstones
  );

  const stats: MergeStats = { added: 0, updated: 0, removed: 0 };
  for (const d of [
    diffStats(s.clients, clients.rows),
    diffStats(s.projects, projects.rows),
    diffStats(s.tasks, tasks.rows),
    diffStats(s.entries, entries.rows),
    diffStats(s.invoices, invoices.rows),
    diffStats(s.expenses, expenses.rows),
    diffStats(s.estimates, estimates.rows),
    diffStats(s.recurringTemplates, recurringTemplates.rows),
  ]) {
    stats.added += d.added;
    stats.updated += d.updated;
    stats.removed += d.removed;
  }

  const peers = mergePeers(
    [
      ...s.collab.peers.filter((p) => p.id !== s.collab.peerId),
      {
        id: s.collab.peerId,
        name: s.collab.peerName,
        color: s.collab.peerColor,
        at: nowIso,
      },
    ],
    remote.peers ?? [],
    nowIso
  );

  const nextNumber = Math.max(s.invDefaults.nextNumber, remote.invDefaults?.nextNumber ?? 0);

  return {
    clients: clients.rows,
    projects: projects.rows,
    tasks: tasks.rows,
    entries: entries.rows,
    invoices: invoices.rows,
    expenses: expenses.rows,
    estimates: estimates.rows,
    recurringTemplates: recurringTemplates.rows,
    tombstones,
    peers,
    nextNumber,
    stats,
  };
}

/* ---------------- same-browser tab sync (BroadcastChannel) ---------------- */

let channel: BroadcastChannel | null = null;

function chan(): BroadcastChannel | null {
  try {
    channel = channel ?? new BroadcastChannel("tickkeep-collab");
    return channel;
  } catch {
    return null;
  }
}

export function broadcastChange(): void {
  const c = chan();
  if (!c) return;
  try {
    const s = useStore.getState();
    c.postMessage({
      type: "ledger-changed",
      peerId: s.collab.peerId,
      file: JSON.parse(s.exportData()) as SharedFile,
    });
  } catch {
    /* non-serializable — ignore */
  }
}

export function onRemoteTabChange(handler: (file: SharedFile, peerId: string) => void): () => void {
  const c = chan();
  if (!c) return () => undefined;
  const onMsg = (ev: MessageEvent) => {
    const data = ev.data as { type?: string; peerId?: string; file?: SharedFile };
    if (data?.type === "ledger-changed" && data.file) {
      handler(data.file, data.peerId ?? "tab");
    }
  };
  c.addEventListener("message", onMsg);
  return () => c?.removeEventListener("message", onMsg);
}
