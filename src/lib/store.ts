import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { addDays, hoursAmount, parseKey, round2, todayKey, toKey, uid } from "./utils";
import { buildInvoice, computeTotals } from "./invoice";
import { pushUndo } from "./undo";

/* ---------------- types ---------------- */

export interface Client {
  id: string;
  name: string;
  email?: string;
  company?: string;
  address?: string;
  /** Purchase Order number — printed on every invoice for this client. */
  poNumber?: string;
  currency: string;
  defaultRate: number;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  clientId: string | null;
  color: string;
  rate: number;
  budgetHours: number | null;
  active: boolean;
  createdAt: string;
  archivedAt: string | null;
  updatedAt?: string;
}

export interface Task {
  id: string;
  projectId: string;
  name: string;
  billable: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface TimeEntry {
  id: string;
  projectId: string | null;
  taskId: string | null;
  description: string;
  date: string; // YYYY-MM-DD (local)
  durationMin: number;
  billable: boolean;
  rate: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Expense {
  id: string;
  projectId: string | null;
  date: string;
  category: string;
  amount: number;
  currency: string;
  billable: boolean;
  notes?: string;
  receipt?: string; // base64 data URL
  createdAt: string;
  updatedAt?: string;
}

export interface InvoiceItem {
  id: string;
  kind: "time" | "expense" | "custom";
  refId: string;
  description: string;
  date: string;
  qty: number;
  rate: number;
  amount: number;
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type PaymentMethod = "bank" | "card" | "paypal" | "cash" | "check" | "other";

export const PAYMENT_METHODS: Array<{ id: PaymentMethod; label: string }> = [
  { id: "bank", label: "Bank transfer" },
  { id: "card", label: "Card" },
  { id: "paypal", label: "PayPal" },
  { id: "cash", label: "Cash" },
  { id: "check", label: "Check" },
  { id: "other", label: "Other" },
];

export interface Payment {
  id: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
}

export type InvoiceTemplateId = "ledger" | "classic" | "bold";

export const INVOICE_TEMPLATES: Array<{ id: InvoiceTemplateId; name: string; desc: string }> = [
  { id: "ledger", name: "Ledger", desc: "Accent band, modern numerals — the TimeVault look" },
  { id: "classic", name: "Classic", desc: "Centered letterhead, formal rules — traditional" },
  { id: "bold", name: "Statement", desc: "Dark header block, oversized total — assertive" },
];

export const ACCENT_SWATCHES = [
  "#0D6E52", "#1D4ED8", "#7C3AED", "#B45309",
  "#BE123C", "#0F766E", "#334155", "#C2410C",
];

export interface Invoice {
  id: string;
  number: string;
  clientId: string | null;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  items: InvoiceItem[];
  taxRate: number;
  discount: number;
  currency: string;
  notes?: string;
  terms?: string;
  paymentDetails?: string;
  templateId?: InvoiceTemplateId;
  accent?: string;
  payments?: Payment[];
  createdAt: string;
  sentAt: string | null;
  paidAt: string | null;
}

export type EstimateStatus = "draft" | "sent" | "accepted" | "declined";

export interface Estimate {
  id: string;
  number: string;
  clientId: string | null;
  issueDate: string;
  expiryDate: string;
  status: EstimateStatus;
  items: InvoiceItem[];
  taxRate: number;
  discount: number;
  currency: string;
  notes?: string;
  createdAt: string;
  invoiceId: string | null;
}

export type RecurFrequency = "weekly" | "biweekly" | "monthly";

export interface RecurringTemplate {
  id: string;
  name: string;
  clientId: string | null;
  items: InvoiceItem[];
  taxRate: number;
  discount: number;
  currency: string;
  frequency: RecurFrequency;
  dayOfMonth: number;
  active: boolean;
  nextRun: string;
  lastRun: string | null;
  createdAt: string;
}

export interface ActiveTimer {
  startedAt: number;
  projectId: string | null;
  taskId: string | null;
  description: string;
}

export interface Business {
  name: string;
  email: string;
  phone: string;
  address: string;
  taxId: string;
  logo?: string; // base64 data URL
}

export interface InvoiceDefaults {
  prefix: string;
  nextNumber: number;
  taxRate: number;
  currency: string;
  paymentDays: number;
  terms: string;
  notes: string;
  templateId: InvoiceTemplateId;
  accent: string;
  paymentDetails: string;
  emailSubject: string;
  emailBody: string;
}

export interface Prefs {
  theme: "light" | "dark" | "system";
  weekStart: 0 | 1;
  compact: boolean;
  roundingMin: 0 | 5 | 15 | 30;
  idleWarnMin: number;
  requireProject: boolean;
  requireDescription: boolean;
  autoStopMin: number;
  lockBeforeDate: string | null;
  timerSound: boolean;
}

export interface DonationState {
  useCount: number;
  lastToastAt: string | null;
}

export interface Goals {
  dailyMin: number;
  weeklyMin: number;
}

export interface Peer {
  id: string;
  name: string;
  color: string;
  at: string;
}

export interface CollabState {
  enabled: boolean;
  teamName: string;
  peerId: string;
  peerName: string;
  peerColor: string;
  intervalSec: number;
  lastMergeAt: string | null;
  lastMerge: { added: number; updated: number; removed: number } | null;
  peers: Peer[];
}

export interface Tombstone {
  t: string;
  id: string;
  at: string;
}

export type SyncKind = "folder";

export interface FolderSyncMeta {
  provider: "device" | "gdrive" | "onedrive";
  dirName: string;
  lastSyncAt: string | null;
  lastRemoteAt: string | null;
}

export interface SyncMeta {
  folder: FolderSyncMeta | null;
  auto: { enabled: boolean; intervalMin: number };
  active: SyncKind | null;
}

export type Metric = "hours" | "amount" | "entries" | "expenseAmount";
export type Dimension = "day" | "week" | "month" | "client" | "project" | "task" | "billable" | "category";
export type RangeKey = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "last90" | "all" | "custom";
export type BlockType = "stat" | "chart" | "donut" | "hbar" | "table";

export interface ReportBlock {
  id: string;
  type: BlockType;
  metric: Metric;
  dimension: Dimension;
  range: RangeKey;
  from: string;
  to: string;
  billable: "all" | "billable" | "non";
  projectId: string | null;
  clientId: string | null;
  title: string;
  size: "full" | "half";
}

export interface SavedReport {
  id: string;
  name: string;
  blocks: ReportBlock[];
  updatedAt: string;
}

export const PROJECT_COLORS = [
  "#0D6E52", "#E8920C", "#2563EB", "#7C3AED", "#DB2777",
  "#CD3426", "#0891B2", "#65A30D", "#B45309", "#57534E",
];

export const EXPENSE_CATEGORIES = [
  "Software", "Travel", "Materials", "Meals", "Equipment", "Other",
];

export const PEER_COLORS = [
  "#0D6E52", "#E8920C", "#2563EB", "#7C3AED", "#DB2777",
  "#0891B2", "#B45309", "#65A30D",
];

/* ---------------- store shape ---------------- */

interface AppData {
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  entries: TimeEntry[];
  invoices: Invoice[];
  expenses: Expense[];
  estimates: Estimate[];
  recurringTemplates: RecurringTemplate[];
  business: Business;
  invDefaults: InvoiceDefaults;
  prefs: Prefs;
  donation: DonationState;
  activeTimer: ActiveTimer | null;
  syncMeta: SyncMeta;
  builder: { name: string; blocks: ReportBlock[] };
  savedReports: SavedReport[];
  tombstones: Tombstone[];
  collab: CollabState;
  goals: Goals;
}

interface AppActions {
  addClient: (d: Omit<Client, "id" | "createdAt">) => Client;
  updateClient: (id: string, patch: Partial<Client>) => void;
  deleteClient: (id: string) => void;
  addProject: (d: Omit<Project, "id" | "createdAt" | "archivedAt" | "active"> & { active?: boolean }) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  addTask: (d: Omit<Task, "id" | "createdAt">) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addEntry: (d: Omit<TimeEntry, "id" | "createdAt">) => TimeEntry;
  updateEntry: (id: string, patch: Partial<TimeEntry>) => void;
  deleteEntry: (id: string) => void;
  restoreEntry: (e: TimeEntry) => void;
  addExpense: (d: Omit<Expense, "id" | "createdAt">) => Expense;
  updateExpense: (id: string, patch: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  restoreExpense: (x: Expense) => void;
  startTimer: (projectId: string | null, taskId: string | null, description: string) => void;
  stopTimer: () => TimeEntry | null;
  discardTimer: () => void;
  createInvoice: (input: {
    clientId: string | null;
    entryIds: string[];
    expenseIds: string[];
    issueDate: string;
    dueDate: string;
    taxRate: number;
    discount: number;
    currency: string;
    notes?: string;
  }) => Invoice;
  setInvoiceStatus: (id: string, status: InvoiceStatus) => void;
  updateInvoice: (id: string, patch: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;
  duplicateInvoice: (id: string) => Invoice | null;
  addPayment: (invoiceId: string, p: Omit<Payment, "id">) => Payment;
  removePayment: (invoiceId: string, paymentId: string) => void;
  addEstimate: (d: Omit<Estimate, "id" | "createdAt" | "number" | "invoiceId">) => Estimate;
  updateEstimate: (id: string, patch: Partial<Estimate>) => void;
  deleteEstimate: (id: string) => void;
  convertEstimateToInvoice: (id: string) => Invoice | null;
  addRecurring: (d: Omit<RecurringTemplate, "id" | "createdAt" | "lastRun">) => RecurringTemplate;
  updateRecurring: (id: string, patch: Partial<RecurringTemplate>) => void;
  deleteRecurring: (id: string) => void;
  processRecurring: () => number;
  setGoals: (patch: Partial<Goals>) => void;
  setBusiness: (patch: Partial<Business>) => void;
  setInvDefaults: (patch: Partial<InvoiceDefaults>) => void;
  setPrefs: (patch: Partial<Prefs>) => void;
  setDonation: (patch: Partial<DonationState>) => void;
  setFolderMeta: (meta: FolderSyncMeta | null) => void;
  setAutoSync: (patch: Partial<SyncMeta["auto"]>) => void;
  setActiveSync: (kind: SyncKind | null) => void;
  setCollab: (patch: Partial<CollabState>) => void;
  applyCollabMerge: (result: {
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
    stats: { added: number; updated: number; removed: number };
  }) => void;
  setBuilder: (patch: { name?: string; blocks?: ReportBlock[] }) => void;
  saveReport: (name: string, blocks: ReportBlock[]) => SavedReport;
  deleteReport: (id: string) => void;
  loadSample: () => void;
  clearLedger: () => void;
  importData: (raw: unknown) => string | null;
  exportData: () => string;
}

export type AppState = AppData & AppActions;

/* Tombstone bookkeeping — how deletions propagate to teammates. */
const TOMBSTONE_MAX = 800;
const TOMBSTONE_TTL_MS = 90 * 24 * 3600 * 1000;

function bury(tombs: Tombstone[], table: string, id: string): Tombstone[] {
  const now = new Date().toISOString();
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const next = [
    ...tombs.filter((t) => Date.parse(t.at) > cutoff && !(t.t === table && t.id === id)),
    { t: table, id, at: now },
  ];
  return next.length > TOMBSTONE_MAX ? next.slice(next.length - TOMBSTONE_MAX) : next;
}

function buryMany(tombs: Tombstone[], table: string, ids: string[]): Tombstone[] {
  let out = tombs;
  for (const id of ids) out = bury(out, table, id);
  return out;
}

function nextRunDate(r: RecurringTemplate, fromKey: string): string {
  const base = parseKey(fromKey);
  if (r.frequency === "weekly") return toKey(addDays(base, 7));
  if (r.frequency === "biweekly") return toKey(addDays(base, 14));
  const dom = Math.min(28, Math.max(1, r.dayOfMonth));
  return toKey(new Date(base.getFullYear(), base.getMonth() + 1, dom));
}

const isoNow = (): string => new Date().toISOString();

const defaults = (): AppData => ({
  clients: [],
  projects: [],
  tasks: [],
  entries: [],
  invoices: [],
  expenses: [],
  estimates: [],
  recurringTemplates: [],
  business: { name: "", email: "", phone: "", address: "", taxId: "" },
  invDefaults: {
    prefix: "INV-",
    nextNumber: 1,
    taxRate: 0,
    currency: "USD",
    paymentDays: 14,
    terms: "Payment is due within 14 days of the issue date.",
    notes: "Thank you for your business.",
    templateId: "ledger",
    accent: "#0D6E52",
    paymentDetails: "Bank transfer — please include the invoice number as your payment reference.",
    emailSubject: "Invoice {{invoice_number}} from {{business_name}}",
    emailBody:
      "Hi {{client_name}},\n\nPlease find attached invoice {{invoice_number}} for {{total}}, due on {{due_date}}.\n\nPayment details:\n{{payment_details}}\n\nThank you for your business!\n\n{{business_name}}\n{{business_email}}",
  },
  prefs: {
    theme: "system", weekStart: 1, compact: false, roundingMin: 0, idleWarnMin: 0,
    requireProject: false, requireDescription: false, autoStopMin: 0, lockBeforeDate: null,
    timerSound: true,
  },
  donation: { useCount: 0, lastToastAt: null },
  activeTimer: null,
  syncMeta: { folder: null, auto: { enabled: false, intervalMin: 15 }, active: null },
  builder: { name: "Untitled report", blocks: [] },
  savedReports: [],
  tombstones: [],
  collab: {
    enabled: false,
    teamName: "The studio",
    peerId: uid(),
    peerName: "Me",
    peerColor: PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)],
    intervalSec: 30,
    lastMergeAt: null,
    lastMerge: null,
    peers: [],
  },
  goals: { dailyMin: 0, weeklyMin: 0 },
});

/** A pristine, empty ledger — used by the in-app E2E test bench. */
export const createFreshState = (): AppData => defaults();

/* ---------------- persistence adapter ----------------
 * MUST be defined before `create()` below: zustand invokes the storage
 * factory eagerly while the store initializes, so referencing it later in
 * the module hits a TDZ ReferenceError and silently disables persistence. */

const PERSIST_KEY = "timevault-v1";
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWrite: string | null = null;
/** Last persistence failure ("quota" | null) — surfaced by the test bench. */
export let lastPersistError: string | null = null;

function writePayload(value: string): boolean {
  try {
    localStorage.setItem(PERSIST_KEY, value);
    lastPersistError = null;
    return true;
  } catch {
    /* Quota exceeded (very large ledgers, receipt images) — retry once with a
     * compacted payload that drops heavy base64 blobs before giving up. */
    try {
      const parsed = JSON.parse(value) as {
        state?: { expenses?: Array<Record<string, unknown>>; business?: Record<string, unknown> };
      };
      const st = parsed.state;
      if (st) {
        if (Array.isArray(st.expenses)) {
          st.expenses = st.expenses.map((x) => ({ ...x, receipt: undefined }));
        }
        if (st.business && typeof st.business.logo === "string") st.business.logo = undefined;
        localStorage.setItem(PERSIST_KEY, JSON.stringify(parsed));
        lastPersistError = null;
        return true;
      }
    } catch {
      /* fall through */
    }
    lastPersistError = "quota";
    return false;
  }
}

function flushPersistNow(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (pendingWrite !== null) writePayload(pendingWrite);
}

/** Force any pending persistence to disk (used before exports & sync pushes). */
export const flushPersist = flushPersistNow;

/** Drop the in-memory pending-write buffer without touching disk — models a
 *  real restart (module re-evaluation), where only what reached disk survives.
 *  Used by the E2E bench's relaunch simulation. */
export function resetPersistBuffer(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  pendingWrite = null;
}

/* Debounced: burst mutations (imports, bulk edits, mega seeds) coalesce into
 * one localStorage write instead of one per set(). Reads stay consistent via
 * the pending buffer; pagehide flushes so nothing is lost on close. */
const debouncedStateStorage = {
  getItem: (key: string): string | null =>
    key === PERSIST_KEY && pendingWrite !== null ? pendingWrite : localStorage.getItem(key),
  setItem: (key: string, value: string): void => {
    if (key !== PERSIST_KEY) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* ignore */
      }
      return;
    }
    pendingWrite = value;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(flushPersistNow, 150);
  },
  removeItem: (key: string): void => {
    if (key === PERSIST_KEY) pendingWrite = null;
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPersistNow);
  window.addEventListener("beforeunload", flushPersistNow);
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...defaults(),

      addClient: (d) => {
        const c: Client = { ...d, id: uid(), createdAt: isoNow() };
        set((s) => ({ clients: [...s.clients, c] }));
        return c;
      },
      updateClient: (id, patch) =>
        set((s) => ({
          clients: s.clients.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: isoNow() } : c)),
        })),
      deleteClient: (id) =>
        set((s) => ({
          clients: s.clients.filter((c) => c.id !== id),
          projects: s.projects.map((p) => (p.clientId === id ? { ...p, clientId: null } : p)),
          tombstones: bury(s.tombstones, "clients", id),
        })),

      addProject: (d) => {
        const p: Project = { ...d, active: d.active ?? true, id: uid(), createdAt: isoNow(), archivedAt: null };
        set((s) => ({ projects: [...s.projects, p] }));
        return p;
      },
      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: isoNow() } : p)),
        })),
      deleteProject: (id) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          tasks: s.tasks.filter((t) => t.projectId !== id),
          tombstones: buryMany(
            bury(s.tombstones, "projects", id),
            "tasks",
            s.tasks.filter((t) => t.projectId === id).map((t) => t.id)
          ),
        })),

      addTask: (d) => {
        const t: Task = { ...d, id: uid(), createdAt: isoNow() };
        set((s) => ({ tasks: [...s.tasks, t] }));
        return t;
      },
      updateTask: (id, patch) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: isoNow() } : t)) })),
      deleteTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), tombstones: bury(s.tombstones, "tasks", id) })),

      addEntry: (d) => {
        const e: TimeEntry = { ...d, id: uid(), createdAt: isoNow() };
        set((s) => ({ entries: [...s.entries, e] }));
        pushUndo({
          label: `Added “${e.description || "time entry"}”`,
          undo: () => set((s) => ({ entries: s.entries.filter((x) => x.id !== e.id) })),
          redo: () => set((s) => ({ entries: [...s.entries, e] })),
        });
        return e;
      },
      updateEntry: (id, patch) => {
        const old = get().entries.find((e) => e.id === id);
        if (!old) return;
        const next = { ...old, ...patch, updatedAt: isoNow() };
        set((s) => ({ entries: s.entries.map((e) => (e.id === id ? next : e)) }));
        pushUndo({
          label: `Edited “${old.description || "time entry"}”`,
          undo: () => set((s) => ({ entries: s.entries.map((e) => (e.id === id ? old : e)) })),
          redo: () => set((s) => ({ entries: s.entries.map((e) => (e.id === id ? next : e)) })),
        });
      },
      deleteEntry: (id) => {
        const old = get().entries.find((e) => e.id === id);
        set((s) => ({
          entries: s.entries.filter((e) => e.id !== id),
          tombstones: bury(s.tombstones, "entries", id),
        }));
        if (old) {
          pushUndo({
            label: `Deleted “${old.description || "time entry"}”`,
            undo: () =>
              set((s) => ({
                entries: [...s.entries, old],
                tombstones: s.tombstones.filter((t) => !(t.t === "entries" && t.id === id)),
              })),
            redo: () =>
              set((s) => ({
                entries: s.entries.filter((e) => e.id !== id),
                tombstones: bury(s.tombstones, "entries", id),
              })),
          });
        }
      },
      restoreEntry: (e) =>
        set((s) => ({
          entries: [...s.entries, e],
          tombstones: s.tombstones.filter((t) => !(t.t === "entries" && t.id === e.id)),
        })),

      addExpense: (d) => {
        const x: Expense = { ...d, id: uid(), createdAt: isoNow() };
        set((s) => ({ expenses: [...s.expenses, x] }));
        return x;
      },
      updateExpense: (id, patch) =>
        set((s) => ({
          expenses: s.expenses.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: isoNow() } : x)),
        })),
      deleteExpense: (id) =>
        set((s) => ({
          expenses: s.expenses.filter((x) => x.id !== id),
          tombstones: bury(s.tombstones, "expenses", id),
        })),
      restoreExpense: (x) =>
        set((s) => ({
          expenses: [...s.expenses, x],
          tombstones: s.tombstones.filter((t) => !(t.t === "expenses" && t.id === x.id)),
        })),

      startTimer: (projectId, taskId, description) =>
        set({ activeTimer: { startedAt: Date.now(), projectId, taskId, description } }),

      stopTimer: () => {
        const t = get().activeTimer;
        if (!t) return null;
        let durationMin = Math.max(1, Math.round((Date.now() - t.startedAt) / 60000));
        const rounding = get().prefs.roundingMin;
        if (rounding > 0) durationMin = Math.ceil(durationMin / rounding) * rounding;
        const entry: TimeEntry = {
          id: uid(),
          projectId: t.projectId,
          taskId: t.taskId,
          description: t.description,
          date: todayKey(),
          durationMin,
          billable: true,
          rate: get().projects.find((p) => p.id === t.projectId)?.rate ?? 0,
          createdAt: isoNow(),
        };
        set((s) => ({ entries: [...s.entries, entry], activeTimer: null }));
        pushUndo({
          label: `Punched out (${durationMin}m)`,
          undo: () => set((s) => ({ entries: s.entries.filter((e) => e.id !== entry.id) })),
          redo: () => set((s) => ({ entries: [...s.entries, entry] })),
        });
        return entry;
      },
      discardTimer: () => set({ activeTimer: null }),

      createInvoice: (input) => {
        const s = get();
        const number = `${s.invDefaults.prefix}${String(s.invDefaults.nextNumber).padStart(4, "0")}`;
        const inv = buildInvoice({
          number,
          clientId: input.clientId,
          entryIds: input.entryIds,
          expenseIds: input.expenseIds,
          entries: s.entries,
          expenses: s.expenses,
          tasks: s.tasks,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          taxRate: input.taxRate,
          discount: input.discount,
          currency: input.currency,
          notes: input.notes ?? s.invDefaults.notes,
          terms: s.invDefaults.terms,
        });
        set({
          invoices: [...s.invoices, inv],
          invDefaults: { ...s.invDefaults, nextNumber: s.invDefaults.nextNumber + 1 },
        });
        return inv;
      },
      setInvoiceStatus: (id, status) =>
        set((s) => ({
          invoices: s.invoices.map((i) =>
            i.id === id
              ? {
                  ...i,
                  status,
                  sentAt: status === "sent" ? isoNow() : i.sentAt,
                  paidAt: status === "paid" ? isoNow() : i.paidAt,
                  updatedAt: isoNow(),
                }
              : i
          ),
        })),
      updateInvoice: (id, patch) =>
        set((s) => ({
          invoices: s.invoices.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: isoNow() } : i)),
        })),
      deleteInvoice: (id) =>
        set((s) => ({
          invoices: s.invoices.filter((i) => i.id !== id),
          tombstones: bury(s.tombstones, "invoices", id),
        })),
      duplicateInvoice: (id) => {
        const s = get();
        const src = s.invoices.find((i) => i.id === id);
        if (!src) return null;
        const number = `${s.invDefaults.prefix}${String(s.invDefaults.nextNumber).padStart(4, "0")}`;
        const today = todayKey();
        const copy: Invoice = {
          ...src,
          id: uid(),
          number,
          status: "draft",
          issueDate: today,
          dueDate: toKey(addDays(parseKey(today), Math.max(0, s.invDefaults.paymentDays))),
          items: src.items.map((it) => ({ ...it, id: uid() })),
          payments: [],
          createdAt: isoNow(),
          sentAt: null,
          paidAt: null,
        };
        set({
          invoices: [...s.invoices, copy],
          invDefaults: { ...s.invDefaults, nextNumber: s.invDefaults.nextNumber + 1 },
        });
        return copy;
      },
      addPayment: (invoiceId, p) => {
        const s = get();
        const inv = s.invoices.find((i) => i.id === invoiceId);
        const payment: Payment = { ...p, id: uid() };
        if (!inv) return payment;
        const payments = [...(inv.payments ?? []), payment];
        const { total } = computeTotals(inv.items, inv.taxRate, inv.discount);
        const paidSoFar = payments.reduce((sum, x) => sum + x.amount, 0);
        const nowPaid = paidSoFar >= total - 0.005;
        set({
          invoices: s.invoices.map((i) =>
            i.id === invoiceId
              ? {
                  ...i,
                  payments,
                  status: nowPaid ? ("paid" as const) : i.status,
                  paidAt: nowPaid ? isoNow() : i.paidAt,
                }
              : i
          ),
        });
        return payment;
      },
      removePayment: (invoiceId, paymentId) =>
        set((s) => ({
          invoices: s.invoices.map((i) =>
            i.id === invoiceId
              ? {
                  ...i,
                  payments: (i.payments ?? []).filter((x) => x.id !== paymentId),
                  status: i.status === "paid" ? ("sent" as const) : i.status,
                  paidAt: i.status === "paid" ? null : i.paidAt,
                }
              : i
          ),
        })),

      addEstimate: (d) => {
        const s = get();
        const number = `EST-${String(s.invDefaults.nextNumber).padStart(4, "0")}`;
        const est: Estimate = { ...d, id: uid(), number, invoiceId: null, createdAt: isoNow() };
        set({ estimates: [...s.estimates, est] });
        return est;
      },
      updateEstimate: (id, patch) =>
        set((s) => ({ estimates: s.estimates.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
      deleteEstimate: (id) =>
        set((s) => ({
          estimates: s.estimates.filter((e) => e.id !== id),
          tombstones: bury(s.tombstones, "estimates", id),
        })),
      convertEstimateToInvoice: (id) => {
        const s = get();
        const est = s.estimates.find((e) => e.id === id);
        if (!est || est.invoiceId) return null;
        const number = `${s.invDefaults.prefix}${String(s.invDefaults.nextNumber).padStart(4, "0")}`;
        const inv: Invoice = {
          id: uid(),
          number,
          clientId: est.clientId,
          issueDate: todayKey(),
          dueDate: toKey(addDays(parseKey(todayKey()), Math.max(0, s.invDefaults.paymentDays))),
          status: "draft",
          items: est.items.map((it) => ({ ...it, id: uid() })),
          taxRate: est.taxRate,
          discount: est.discount,
          currency: est.currency,
          notes: est.notes,
          terms: s.invDefaults.terms,
          createdAt: isoNow(),
          sentAt: null,
          paidAt: null,
        };
        set({
          invoices: [...s.invoices, inv],
          invDefaults: { ...s.invDefaults, nextNumber: s.invDefaults.nextNumber + 1 },
          estimates: s.estimates.map((e) =>
            e.id === id ? { ...e, status: "accepted" as const, invoiceId: inv.id } : e
          ),
        });
        return inv;
      },

      addRecurring: (d) => {
        const s = get();
        const rec: RecurringTemplate = { ...d, id: uid(), lastRun: null, createdAt: isoNow() };
        set({ recurringTemplates: [...s.recurringTemplates, rec] });
        return rec;
      },
      updateRecurring: (id, patch) =>
        set((s) => ({
          recurringTemplates: s.recurringTemplates.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),
      deleteRecurring: (id) =>
        set((s) => ({ recurringTemplates: s.recurringTemplates.filter((r) => r.id !== id) })),
      processRecurring: () => {
        const s = get();
        const today = todayKey();
        const due = s.recurringTemplates.filter((r) => r.active && r.nextRun <= today);
        if (due.length === 0) return 0;
        let nextNumber = s.invDefaults.nextNumber;
        const newInvoices: Invoice[] = [];
        const updated = s.recurringTemplates.map((r) => {
          if (!r.active || r.nextRun > today) return r;
          const number = `${s.invDefaults.prefix}${String(nextNumber).padStart(4, "0")}`;
          nextNumber += 1;
          newInvoices.push({
            id: uid(),
            number,
            clientId: r.clientId,
            issueDate: today,
            dueDate: toKey(addDays(parseKey(today), Math.max(0, s.invDefaults.paymentDays))),
            status: "draft",
            items: r.items.map((it) => ({ ...it, id: uid() })),
            taxRate: r.taxRate,
            discount: r.discount,
            currency: r.currency,
            notes: `Recurring — ${r.name}`,
            terms: s.invDefaults.terms,
            createdAt: isoNow(),
            sentAt: null,
            paidAt: null,
          });
          return { ...r, lastRun: today, nextRun: nextRunDate(r, today) };
        });
        set({
          invoices: [...s.invoices, ...newInvoices],
          recurringTemplates: updated,
          invDefaults: { ...s.invDefaults, nextNumber },
        });
        return newInvoices.length;
      },

      setGoals: (patch) => set((s) => ({ goals: { ...s.goals, ...patch } })),
      setBusiness: (patch) => set((s) => ({ business: { ...s.business, ...patch } })),
      setInvDefaults: (patch) => set((s) => ({ invDefaults: { ...s.invDefaults, ...patch } })),
      setPrefs: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),
      setDonation: (patch) => set((s) => ({ donation: { ...s.donation, ...patch } })),
      setFolderMeta: (meta) =>
        set((s) => ({
          syncMeta: {
            ...s.syncMeta,
            folder: meta,
            active: meta === null ? (s.syncMeta.active === "folder" ? null : s.syncMeta.active) : "folder",
          },
        })),
      setAutoSync: (patch) =>
        set((s) => ({ syncMeta: { ...s.syncMeta, auto: { ...s.syncMeta.auto, ...patch } } })),
      setActiveSync: (kind) => set((s) => ({ syncMeta: { ...s.syncMeta, active: kind } })),
      setCollab: (patch) => set((s) => ({ collab: { ...s.collab, ...patch } })),
      applyCollabMerge: (result) =>
        set((s) => ({
          clients: result.clients,
          projects: result.projects,
          tasks: result.tasks,
          entries: result.entries,
          invoices: result.invoices,
          expenses: result.expenses,
          estimates: result.estimates,
          recurringTemplates: result.recurringTemplates,
          tombstones: result.tombstones,
          invDefaults: { ...s.invDefaults, nextNumber: result.nextNumber },
          collab: {
            ...s.collab,
            peers: result.peers,
            lastMergeAt: isoNow(),
            lastMerge: result.stats,
          },
        })),

      setBuilder: (patch) =>
        set((s) => ({
          builder: { name: patch.name ?? s.builder.name, blocks: patch.blocks ?? s.builder.blocks },
        })),
      saveReport: (name, blocks) => {
        const s = get();
        const existing = s.savedReports.find((r) => r.name.toLowerCase() === name.toLowerCase());
        const report: SavedReport = {
          id: existing?.id ?? uid(),
          name,
          blocks: blocks.map((b) => ({ ...b })),
          updatedAt: isoNow(),
        };
        set({
          savedReports: existing
            ? s.savedReports.map((r) => (r.id === report.id ? report : r))
            : [...s.savedReports, report],
        });
        return report;
      },
      deleteReport: (id) =>
        set((s) => ({ savedReports: s.savedReports.filter((r) => r.id !== id) })),

      loadSample: () => set(sampleData()),
      clearLedger: () =>
        set({
          clients: [],
          projects: [],
          tasks: [],
          entries: [],
          invoices: [],
          expenses: [],
          estimates: [],
          recurringTemplates: [],
          activeTimer: null,
        }),

      importData: (raw) => {
        if (!raw || typeof raw !== "object") return "That file doesn't look like a TimeVault backup.";
        const r = raw as Record<string, unknown>;
        const required = ["clients", "projects", "tasks", "entries", "invoices", "expenses"];
        for (const k of required) {
          if (!Array.isArray(r[k])) return `Backup is missing the "${k}" collection.`;
        }
        set({
          clients: r.clients as Client[],
          projects: r.projects as Project[],
          tasks: r.tasks as Task[],
          entries: r.entries as TimeEntry[],
          invoices: r.invoices as Invoice[],
          expenses: r.expenses as Expense[],
          estimates: Array.isArray(r.estimates) ? (r.estimates as Estimate[]) : [],
          recurringTemplates: Array.isArray(r.recurringTemplates)
            ? (r.recurringTemplates as RecurringTemplate[])
            : [],
          goals: (r.goals as Goals) ?? get().goals,
          business: (r.business as Business) ?? get().business,
          invDefaults: (r.invDefaults as InvoiceDefaults) ?? get().invDefaults,
          tombstones: Array.isArray(r.tombstones) ? (r.tombstones as Tombstone[]) : [],
          activeTimer: null,
        });
        return null;
      },

      exportData: () => {
        const s = get();
        return JSON.stringify(
          {
            app: "TimeVault",
            version: 2,
            exportedAt: isoNow(),
            clients: s.clients,
            projects: s.projects,
            tasks: s.tasks,
            entries: s.entries,
            invoices: s.invoices,
            expenses: s.expenses,
            estimates: s.estimates,
            recurringTemplates: s.recurringTemplates,
            business: s.business,
            invDefaults: s.invDefaults,
            prefs: s.prefs,
            goals: s.goals,
            tombstones: s.tombstones,
            peers: s.collab.enabled
              ? [
                  ...s.collab.peers.filter((p) => p.id !== s.collab.peerId),
                  {
                    id: s.collab.peerId,
                    name: s.collab.peerName,
                    color: s.collab.peerColor,
                    at: isoNow(),
                  },
                ]
              : [],
          },
          null,
          2
        );
      },
    }),
    {
      name: "timevault-v1",
      version: 1,
      partialize: (s) => ({
        clients: s.clients,
        projects: s.projects,
        tasks: s.tasks,
        entries: s.entries,
        invoices: s.invoices,
        expenses: s.expenses,
        estimates: s.estimates,
        recurringTemplates: s.recurringTemplates,
        goals: s.goals,
        business: s.business,
        invDefaults: s.invDefaults,
        prefs: s.prefs,
        donation: s.donation,
        activeTimer: s.activeTimer,
        syncMeta: s.syncMeta,
        builder: s.builder,
        savedReports: s.savedReports,
        tombstones: s.tombstones,
        collab: s.collab,
      }) as AppState,
      /* Never discard data on a version bump — pass the blob through and let
       * `merge` reconcile it against fresh defaults. */
      migrate: (persisted) => persisted as AppState,
      /* Defaults-first deep merge: old blobs keep their values, newly added
       * fields backfill instead of landing as `undefined` after an update. */
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppData>;
        const c = current as unknown as AppData;
        const m: AppData = { ...c, ...p } as AppData;
        for (const key of [
          "clients", "projects", "tasks", "entries", "invoices", "expenses",
          "estimates", "recurringTemplates", "tombstones", "savedReports",
        ] as const) {
          if (!Array.isArray(m[key])) {
            (m as unknown as Record<string, unknown>)[key] = c[key];
          }
        }
        m.prefs = { ...c.prefs, ...(p.prefs ?? {}) };
        m.business = { ...c.business, ...(p.business ?? {}) };
        m.invDefaults = { ...c.invDefaults, ...(p.invDefaults ?? {}) };
        m.goals = { ...c.goals, ...(p.goals ?? {}) };
        m.donation = { ...c.donation, ...(p.donation ?? {}) };
        m.collab = { ...c.collab, ...(p.collab ?? {}) };
        m.syncMeta = {
          ...c.syncMeta,
          ...(p.syncMeta ?? {}),
          auto: { ...c.syncMeta.auto, ...(p.syncMeta?.auto ?? {}) },
        };
        m.builder = { ...c.builder, ...(p.builder ?? {}) };
        return m as unknown as AppState;
      },
      /* Debounced storage: burst mutations (imports, bulk edits) coalesce into
       * one localStorage write instead of one per set(). Reads stay consistent
       * via the pending buffer; pagehide flushes so nothing is lost on close. */
      storage: createJSONStorage(() => debouncedStateStorage),
    }
  )
);

/* ---------------- derived helpers ---------------- */

export function billedEntryIds(invoices: Invoice[]): Set<string> {
  const set = new Set<string>();
  for (const inv of invoices) {
    if (inv.status === "void") continue;
    for (const it of inv.items) if (it.kind === "time") set.add(it.refId);
  }
  return set;
}

export function billedExpenseIds(invoices: Invoice[]): Set<string> {
  const set = new Set<string>();
  for (const inv of invoices) {
    if (inv.status === "void") continue;
    for (const it of inv.items) if (it.kind === "expense") set.add(it.refId);
  }
  return set;
}

export const entryAmount = (e: TimeEntry): number => hoursAmount(e.durationMin, e.rate);
export const minutesSum = (entries: TimeEntry[]): number =>
  entries.reduce((s, e) => s + e.durationMin, 0);
export const billableAmount = (entries: TimeEntry[]): number =>
  entries.reduce((s, e) => s + (e.billable ? entryAmount(e) : 0), 0);

export const invoicePaidAmount = (inv: Invoice): number =>
  (inv.payments ?? []).reduce((s, p) => s + p.amount, 0);

export const invoiceBalance = (inv: Invoice): number => {
  const { total } = computeTotals(inv.items, inv.taxRate, inv.discount);
  return Math.max(0, round2(total - invoicePaidAmount(inv)));
};

/* ---------------- sample data ---------------- */

function sampleData(): AppData {
  const now = new Date();
  const iso = isoNow();
  const k = (n: number) => toKey(addDays(now, -n));

  const c1: Client = {
    id: uid(), name: "Fjord & Frame", email: "hello@fjordframe.co", company: "Fjord & Frame ApS",
    address: "Bredgade 24, 1260 Copenhagen", poNumber: "PO-2026-0114", currency: "USD",
    defaultRate: 95, notes: "Product design studio. Net-14.", createdAt: iso,
  };
  const c2: Client = {
    id: uid(), name: "Bluenose Coffee Roasters", email: "ops@bluenose.coffee", company: "",
    address: "14 Argyle St, Halifax NS", currency: "EUR", defaultRate: 85, notes: "", createdAt: iso,
  };

  const p1: Project = { id: uid(), name: "Website retainer", clientId: c1.id, color: "#0D6E52", rate: 95, budgetHours: 40, active: true, createdAt: iso, archivedAt: null };
  const p2: Project = { id: uid(), name: "Brand sprint", clientId: c1.id, color: "#E8920C", rate: 110, budgetHours: 24, active: true, createdAt: iso, archivedAt: null };
  const p3: Project = { id: uid(), name: "Online shop build", clientId: c2.id, color: "#2563EB", rate: 85, budgetHours: null, active: true, createdAt: iso, archivedAt: null };
  const p4: Project = { id: uid(), name: "Legacy app cleanup", clientId: c2.id, color: "#57534E", rate: 70, budgetHours: null, active: false, createdAt: iso, archivedAt: iso };

  const t = (projectId: string, name: string, billable: boolean): Task =>
    ({ id: uid(), projectId, name, billable, createdAt: iso });
  const t1 = t(p1.id, "Design", true);
  const t2 = t(p1.id, "Development", true);
  const t3 = t(p1.id, "Calls & sync", false);
  const t4 = t(p2.id, "Research", true);
  const t5 = t(p2.id, "Identity", true);
  const t6 = t(p2.id, "Pitch deck", true);
  const t7 = t(p3.id, "Theme build", true);
  const t8 = t(p3.id, "Data migration", true);
  const t9 = t(p3.id, "QA", true);

  const rows: Array<[number, Project, Task | null, string, number, boolean, number]> = [
    [0, p1, t2, "Checkout edge-case fixes", 95, true, 95],
    [0, p1, t1, "Retainer — dashboard refinements", 150, true, 95],
    [1, p1, t3, "Weekly sync with Fjord team", 30, false, 95],
    [1, p3, t7, "Cart drawer responsive pass", 135, true, 85],
    [2, p2, t5, "Logo exploration, round 2", 170, true, 110],
    [2, p1, t2, "Fix image pipeline caching", 80, true, 95],
    [3, p3, t8, "Product CSV cleanup scripts", 200, true, 85],
    [3, p2, t4, "Competitor teardown doc", 60, true, 110],
    [4, p1, t1, "Retainer — onboarding flow v2", 190, true, 95],
    [5, p3, t9, "Cross-browser pass, Safari bugs", 75, true, 85],
    [6, p1, t2, "Retainer — search autocomplete", 160, true, 95],
    [7, p2, t5, "Color + type system draft", 140, true, 110],
    [8, p1, t3, "Scope call: Q3 roadmap", 45, false, 95],
    [9, p3, t7, "Theme tokens + header build", 210, true, 85],
    [10, p1, t1, "Retainer — empty states pass", 120, true, 95],
    [11, p2, t6, "Pitch deck skeleton", 90, true, 110],
    [12, p1, t2, "Retainer — API error handling", 175, true, 95],
    [13, p3, t8, "Order history migration dry-run", 150, true, 85],
  ];

  const entries: TimeEntry[] = rows.map(([ago, proj, task, description, durationMin, billable, rate]) => ({
    id: uid(), projectId: proj.id, taskId: task?.id ?? null, description,
    date: k(ago), durationMin, billable, rate, createdAt: iso,
  }));

  const e12 = entries[16];
  const e10 = entries[14];
  const e6 = entries[10];

  const x1: Expense = { id: uid(), projectId: p1.id, date: k(2), category: "Software", amount: 29, currency: "USD", billable: true, notes: "Figma plugin — annual license", createdAt: iso };
  const x2: Expense = { id: uid(), projectId: p3.id, date: k(5), category: "Travel", amount: 18.4, currency: "EUR", billable: true, notes: "Train to roastery tasting", createdAt: iso };
  const x3: Expense = { id: uid(), projectId: p2.id, date: k(9), category: "Meals", amount: 24.5, currency: "USD", billable: false, notes: "Client lunch — sprint kickoff", createdAt: iso };

  const mkItem = (e: TimeEntry): InvoiceItem => ({
    id: `it-${e.id}`, kind: "time", refId: e.id,
    description: e.description, date: e.date,
    qty: round2(e.durationMin / 60), rate: e.rate,
    amount: hoursAmount(e.durationMin, e.rate),
  });
  const items: InvoiceItem[] = [mkItem(e12), mkItem(e10), mkItem(e6), {
    id: `it-${x1.id}`, kind: "expense", refId: x1.id,
    description: x1.notes ?? "Software expense", date: x1.date, qty: 1, rate: x1.amount, amount: x1.amount,
  }];

  const inv: Invoice = {
    id: uid(), number: "INV-0001", clientId: c1.id, issueDate: k(5), dueDate: toKey(addDays(now, 9)),
    status: "draft", items, taxRate: 0, discount: 0, currency: "USD",
    notes: "Covers retainer work from the last two weeks plus the Figma license.",
    terms: "Payment is due within 14 days of the issue date.",
    createdAt: iso, sentAt: null, paidAt: null,
  };

  const qi = (description: string, qty: number, rate: number): InvoiceItem => ({
    id: uid(), kind: "custom", refId: "", description,
    date: todayKey(), qty, rate, amount: round2(qty * rate),
  });

  const est1: Estimate = {
    id: uid(), number: "EST-0002", clientId: c2.id, issueDate: k(2), expiryDate: toKey(addDays(now, 12)),
    status: "draft", taxRate: 0, discount: 0, currency: "EUR",
    items: [qi("Online shop — discovery & scope", 8, 85), qi("Theme customization (est.)", 12, 85), qi("Data migration (est.)", 10, 85)],
    notes: "Estimate valid for 14 days. Final scope confirmed after discovery.",
    createdAt: iso, invoiceId: null,
  };
  const est2: Estimate = {
    id: uid(), number: "EST-0003", clientId: c1.id, issueDate: k(6), expiryDate: toKey(addDays(now, 5)),
    status: "sent", taxRate: 0, discount: 0, currency: "USD",
    items: [qi("Brand sprint — phase 2", 10, 110), qi("Guidelines document", 6, 110)],
    notes: "Includes two revision rounds.",
    createdAt: iso, invoiceId: null,
  };

  const rec1: RecurringTemplate = {
    id: uid(), name: "Website retainer — monthly", clientId: c1.id,
    items: [qi("Retainer — 20h block", 20, 95), qi("Priority support", 1, 150)],
    taxRate: 0, discount: 0, currency: "USD",
    frequency: "monthly", dayOfMonth: 1, active: true,
    nextRun: toKey(addDays(now, 5)), lastRun: null, createdAt: iso,
  };

  return {
    ...defaults(),
    clients: [c1, c2],
    projects: [p1, p2, p3, p4],
    tasks: [t1, t2, t3, t4, t5, t6, t7, t8, t9],
    entries,
    invoices: [inv],
    expenses: [x1, x2, x3],
    estimates: [est1, est2],
    recurringTemplates: [rec1],
    goals: { dailyMin: 360, weeklyMin: 1920 },
    business: {
      name: "Juniper Studio",
      email: "studio@juniper.works",
      phone: "+1 (902) 555-0134",
      address: "27 Dockside Lane, Halifax NS",
      taxId: "",
    },
    invDefaults: {
      ...defaults().invDefaults,
      nextNumber: 2,
      paymentDetails: "Bank transfer to IBAN DK50 0040 0440 1162 43 — reference: invoice number.",
    },
  };
}
