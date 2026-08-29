import { useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { I } from "../components/icons";
import { Badge, Button, ConfirmDialog, EmptyState, useToast } from "../components/ui";
import { cx, fmtHL, round2, todayKey, uid } from "../lib/utils";

/* ---------------- CSV parsing (self-contained, quote-aware) ---------------- */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function parseHours(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes(":")) {
    const [h, m] = s.split(":").map((v) => parseFloat(v));
    if (Number.isNaN(h)) return null;
    return Math.round(h * 60 + (Number.isNaN(m) ? 0 : m));
  }
  const f = parseFloat(s);
  if (Number.isNaN(f) || f <= 0) return null;
  return Math.round(f * 60);
}

interface ParsedRow {
  date: string;
  client: string;
  project: string;
  task: string;
  description: string;
  minutes: number;
  billable: boolean;
  rate: number;
}

function detectColumns(header: string[]): Record<string, number> {
  const find = (...names: string[]) =>
    header.findIndex((h) => names.some((n) => h.trim().toLowerCase().includes(n)));
  return {
    date: find("date"),
    client: find("client"),
    project: find("project"),
    task: find("task"),
    description: find("description", "notes", "note"),
    hours: find("hours", "duration", "time"),
    billable: find("billable"),
    rate: find("rate"),
    amount: find("amount"),
  };
}

function parseRows(grid: string[][]): { rows: ParsedRow[]; skipped: number } {
  if (grid.length < 2) return { rows: [], skipped: 0 };
  const cols = detectColumns(grid[0]);
  if (cols.date < 0 || cols.hours < 0) return { rows: [], skipped: grid.length - 1 };
  const out: ParsedRow[] = [];
  let skipped = 0;
  for (const r of grid.slice(1)) {
    const minutes = parseHours(r[cols.hours] ?? "");
    const dateRaw = (r[cols.date] ?? "").trim();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : todayKey();
    if (minutes === null) {
      skipped++;
      continue;
    }
    const billableRaw = cols.billable >= 0 ? (r[cols.billable] ?? "").trim().toLowerCase() : "yes";
    const rateRaw = cols.rate >= 0 ? parseFloat(r[cols.rate] ?? "") : NaN;
    const amountRaw = cols.amount >= 0 ? parseFloat((r[cols.amount] ?? "").replace(/[^0-9.-]/g, "")) : NaN;
    const rate = !Number.isNaN(rateRaw) ? rateRaw : !Number.isNaN(amountRaw) && minutes > 0 ? round2(amountRaw / (minutes / 60)) : 0;
    out.push({
      date,
      client: cols.client >= 0 ? (r[cols.client] ?? "").trim() : "",
      project: cols.project >= 0 ? (r[cols.project] ?? "").trim() : "Imported project",
      task: cols.task >= 0 ? (r[cols.task] ?? "").trim() : "",
      description: cols.description >= 0 ? (r[cols.description] ?? "").trim() : "",
      minutes,
      billable: billableRaw !== "no" && billableRaw !== "false" && billableRaw !== "0",
      rate,
    });
  }
  return { rows: out, skipped };
}

/* ---------------- page ---------------- */

interface Preview {
  rows: ParsedRow[];
  skipped: number;
  totalMin: number;
  newClients: string[];
  newProjects: string[];
}

export function ImportPage() {
  const importData = useStore((s) => s.importData);
  const addClient = useStore((s) => s.addClient);
  const addProject = useStore((s) => s.addProject);
  const addTask = useStore((s) => s.addTask);
  const addEntry = useStore((s) => s.addEntry);
  const clients = useStore((s) => s.clients);
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const { push } = useToast();

  const jsonRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [pendingJson, setPendingJson] = useState<{ name: string; data: unknown } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [importing, setImporting] = useState(false);

  const totals = useMemo(() => ({ clients: clients.length, projects: projects.length, tasks: tasks.length }), [clients, projects, tasks]);

  const onJsonFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setPendingJson({ name: file.name, data: JSON.parse(String(reader.result)) });
      } catch {
        push({ kind: "err", title: "Couldn't read that file", desc: "It isn't valid JSON." });
      }
    };
    reader.readAsText(file);
  };

  const onCsvFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const grid = parseCsv(String(reader.result));
      const { rows, skipped } = parseRows(grid);
      if (rows.length === 0) {
        push({ kind: "err", title: "No rows recognized", desc: "Expected columns like Date, Client, Project, Hours, Billable, Rate." });
        return;
      }
      const existingClients = new Set(clients.map((c) => c.name.toLowerCase()));
      const existingProjects = new Set(projects.map((p) => p.name.toLowerCase()));
      setPreview({
        rows,
        skipped,
        totalMin: rows.reduce((s, r) => s + r.minutes, 0),
        newClients: [...new Set(rows.map((r) => r.client).filter((c) => c && !existingClients.has(c.toLowerCase())))],
        newProjects: [...new Set(rows.map((r) => r.project).filter((p) => p && !existingProjects.has(p.toLowerCase())))],
      });
    };
    reader.readAsText(file);
  };

  const applyCsv = () => {
    if (!preview) return;
    setImporting(true);
    try {
      const clientIds = new Map<string, string>();
      for (const c of clients) clientIds.set(c.name.toLowerCase(), c.id);
      for (const name of preview.newClients) {
        const c = addClient({ name, currency: "USD", defaultRate: 0 });
        clientIds.set(name.toLowerCase(), c.id);
      }
      const projectIds = new Map<string, string>();
      for (const p of projects) projectIds.set(p.name.toLowerCase(), p.id);
      for (const name of preview.newProjects) {
        const clientId = preview.rows.find((r) => r.project === name)?.client;
        const p = addProject({
          name,
          clientId: clientId ? clientIds.get(clientId.toLowerCase()) ?? null : null,
          color: "#0D6E52",
          rate: preview.rows.find((r) => r.project === name)?.rate ?? 0,
          budgetHours: null,
        });
        projectIds.set(name.toLowerCase(), p.id);
      }
      const taskIds = new Map<string, string>();
      for (const t of tasks) taskIds.set(`${t.projectId}:${t.name.toLowerCase()}`, t.id);
      let addedTasks = 0;
      for (const r of preview.rows) {
        if (!r.task) continue;
        const pid = projectIds.get(r.project.toLowerCase());
        if (!pid) continue;
        const key = `${pid}:${r.task.toLowerCase()}`;
        if (!taskIds.has(key)) {
          const t = addTask({ projectId: pid, name: r.task, billable: r.billable });
          taskIds.set(key, t.id);
          addedTasks++;
        }
      }
      for (const r of preview.rows) {
        const pid = projectIds.get(r.project.toLowerCase()) ?? null;
        addEntry({
          projectId: pid,
          taskId: pid && r.task ? taskIds.get(`${pid}:${r.task.toLowerCase()}`) ?? null : null,
          description: r.description || r.task || r.project,
          date: r.date,
          durationMin: r.minutes,
          billable: r.billable,
          rate: r.rate,
        });
      }
      push({
        kind: "ok",
        title: `Imported ${preview.rows.length} entries`,
        desc: `${preview.newClients.length} clients · ${preview.newProjects.length} projects · ${addedTasks} tasks created`,
      });
      setPreview(null);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <I name="db" size={19} />
          </span>
          <h2 className="mt-3 font-display text-lg font-bold text-ink">TickKeep backup</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink2">
            Restore a <code className="rounded bg-surface2 px-1 font-mono text-[12px]">tickkeep-backup-*.json</code> export.
            Replaces your current ledger after you confirm.
          </p>
          <Button className="mt-4" icon="upload" onClick={() => jsonRef.current?.click()}>
            Choose backup file
          </Button>
          <input ref={jsonRef} type="file" accept="application/json,.json" className="hidden" aria-label="Choose TickKeep backup file"
            onChange={(e) => {
              onJsonFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }} />
        </section>

        <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber/15 text-amber">
            <I name="upload" size={19} />
          </span>
          <h2 className="mt-3 font-display text-lg font-bold text-ink">Time CSV</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink2">
            A time export from your old tracker — columns like <em>Date, Client, Project, Task, Hours, Billable, Rate</em>.
            Clients and projects are created automatically.
          </p>
          <Button className="mt-4" variant="outline" icon="file" onClick={() => csvRef.current?.click()}>
            Choose CSV file
          </Button>
          <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" aria-label="Choose time CSV file"
            onChange={(e) => {
              onCsvFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }} />
        </section>
      </div>

      {preview && (
        <section className="anim-rise rounded-xl border border-accent/40 bg-surface shadow-card">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-[15px] font-bold text-ink">Ready to import</h3>
              <p className="mt-0.5 text-[12.5px] text-muted">
                {preview.rows.length} entries · {fmtHL(preview.totalMin)}
                {preview.skipped > 0 && ` · ${preview.skipped} rows skipped (unparseable hours)`}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {preview.newClients.length > 0 && <Badge tone="info">{preview.newClients.length} new clients</Badge>}
              {preview.newProjects.length > 0 && <Badge tone="accent">{preview.newProjects.length} new projects</Badge>}
            </div>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full min-w-140 border-collapse text-left">
              <thead className="sticky top-0 bg-surface2/90 backdrop-blur">
                <tr className="border-b border-line">
                  {["Date", "Client", "Project", "Task", "Hours", "Billable", "Rate"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted" scope="col">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 50).map((r, i) => (
                  <tr key={i} className={cx("border-b border-line/60", i % 2 === 1 && "bg-surface2/30")}>
                    <td className="px-4 py-2 font-mono text-[12.5px] tabular whitespace-nowrap text-ink2">{r.date}</td>
                    <td className="max-w-32 truncate px-4 py-2 text-[13px] text-ink">{r.client || "—"}</td>
                    <td className="max-w-36 truncate px-4 py-2 text-[13px] font-medium text-ink">{r.project}</td>
                    <td className="max-w-32 truncate px-4 py-2 text-[13px] text-ink2">{r.task || "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-[12.5px] tabular text-ink">{fmtHL(r.minutes)}</td>
                    <td className="px-4 py-2">{r.billable ? <Badge tone="accent">yes</Badge> : <Badge tone="gray">no</Badge>}</td>
                    <td className="px-4 py-2 text-right font-mono text-[12.5px] tabular text-ink2">{r.rate ? r.rate.toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.rows.length > 50 && (
              <p className="px-4 py-2.5 text-[12px] text-muted">…and {preview.rows.length - 50} more rows</p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
            <Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button>
            <Button icon="check" onClick={applyCsv} disabled={importing}>{importing ? "Importing…" : `Import ${preview.rows.length} entries`}</Button>
          </div>
        </section>
      )}

      {!preview && (
        <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
          <h3 className="font-display text-[15px] font-bold text-ink">Currently on this device</h3>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[13px] tabular text-ink2">
            <span><strong className="text-ink">{totals.clients}</strong> clients</span>
            <span><strong className="text-ink">{totals.projects}</strong> projects</span>
            <span><strong className="text-ink">{totals.tasks}</strong> tasks</span>
          </div>
          <p className="mt-3 text-[12.5px] text-muted">
            Imports are additive for CSV (existing clients/projects are reused by name) and replace everything for JSON backups.
          </p>
        </section>
      )}

      <ConfirmDialog
        open={pendingJson !== null}
        onClose={() => setPendingJson(null)}
        title={`Import “${pendingJson?.name}”?`}
        desc="This replaces your current clients, projects, entries, invoices, expenses, estimates and recurring profiles with the backup's contents."
        confirmLabel="Replace data"
        onConfirm={() => {
          if (!pendingJson) return;
          const err = importData(pendingJson.data);
          if (err) push({ kind: "err", title: "Import failed", desc: err });
          else push({ kind: "ok", title: "Backup imported", desc: "Welcome back — everything's here." });
          setPendingJson(null);
        }}
      />

      <p className="flex items-center gap-2 font-mono text-[12px] text-muted">
        <I name="shield" size={13} /> Imports run entirely on this device — nothing is uploaded anywhere.
      </p>
    </div>
  );
}
