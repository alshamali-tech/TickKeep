/* Pure aggregation engine — powers the standard report tabs and every
 * custom-builder block. No React, no store import cycle (types only). */
import type {
  Client, Dimension, Expense, Invoice, Metric, Project, RangeKey, Task, TimeEntry,
} from "./store";
import {
  addDays, fmtDay, fmtH, hoursAmount, money, parseKey, round2, startOfWeek, toKey, todayKey,
} from "./utils";

export interface AggCtx {
  entries: TimeEntry[];
  expenses: Expense[];
  projects: Project[];
  clients: Client[];
  tasks: Task[];
  getRate: (cur: string) => number;
  currency: string;
}

export interface Range {
  from: string;
  to: string;
  label: string;
}

export const RANGE_LABEL: Record<RangeKey, string> = {
  thisWeek: "This week",
  lastWeek: "Last week",
  thisMonth: "This month",
  lastMonth: "Last month",
  last90: "Last 90 days",
  all: "All time",
  custom: "Custom",
};

export function resolveRange(
  preset: RangeKey,
  weekStart: 0 | 1,
  from?: string,
  to?: string
): Range {
  const now = new Date();
  const today = todayKey();
  switch (preset) {
    case "thisWeek": {
      const a = startOfWeek(now, weekStart);
      return { from: toKey(a), to: toKey(addDays(a, 6)), label: RANGE_LABEL.thisWeek };
    }
    case "lastWeek": {
      const a = addDays(startOfWeek(now, weekStart), -7);
      return { from: toKey(a), to: toKey(addDays(a, 6)), label: RANGE_LABEL.lastWeek };
    }
    case "thisMonth": {
      const a = new Date(now.getFullYear(), now.getMonth(), 1);
      const b = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: toKey(a), to: toKey(b), label: RANGE_LABEL.thisMonth };
    }
    case "lastMonth": {
      const a = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const b = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toKey(a), to: toKey(b), label: RANGE_LABEL.lastMonth };
    }
    case "last90":
      return { from: toKey(addDays(now, -89)), to: today, label: RANGE_LABEL.last90 };
    case "all": {
      return { from: "2000-01-01", to: today, label: RANGE_LABEL.all };
    }
    case "custom": {
      const f = from || toKey(addDays(now, -29));
      const t = to || today;
      return { from: f <= t ? f : t, to: f <= t ? t : f, label: `${fmtDay(f)} – ${fmtDay(t)}` };
    }
  }
}

export const rangeDays = (r: Range): number =>
  Math.max(1, Math.round((parseKey(r.to).getTime() - parseKey(r.from).getTime()) / 86400000) + 1);

export interface AggRow {
  key: string;
  label: string;
  color: string;
  minutes: number;
  billableMin: number;
  nonBillableMin: number;
  billableAmount: number;
  entryCount: number;
  expenseCount: number;
  expenseTotal: number;
}

export interface AggOpts {
  dimension: Dimension;
  from: string;
  to: string;
  billable: "all" | "billable" | "non";
  projectId: string | null;
  clientId: string | null;
  weekStart: 0 | 1;
}

const isExpenseMetric = (m: Metric): boolean => m === "expenseAmount";
export { isExpenseMetric };

export const METRIC_LABEL: Record<Metric, string> = {
  hours: "Hours",
  amount: "Billable amount",
  entries: "Entries",
  expenseAmount: "Expenses",
};

export const DIM_LABEL: Record<Dimension, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  client: "Client",
  project: "Project",
  task: "Task",
  billable: "Billability",
  category: "Category",
};

const blank = (key: string, label: string, color: string): AggRow => ({
  key, label, color,
  minutes: 0, billableMin: 0, nonBillableMin: 0, billableAmount: 0,
  entryCount: 0, expenseCount: 0, expenseTotal: 0,
});

function clientColorOf(ctx: AggCtx, projectId: string | null): string {
  const p = ctx.projects.find((x) => x.id === projectId);
  return p?.color ?? "var(--tv-line)";
}

function matchesProjectClient(
  ctx: AggCtx,
  projectId: string | null,
  opts: Pick<AggOpts, "projectId" | "clientId">
): boolean {
  if (opts.projectId && projectId !== opts.projectId) return false;
  if (opts.clientId) {
    const p = ctx.projects.find((x) => x.id === projectId);
    if (p?.clientId !== opts.clientId) return false;
  }
  return true;
}

export function aggregateEntries(ctx: AggCtx, opts: AggOpts): AggRow[] {
  const map = new Map<string, AggRow>();
  const put = (key: string, label: string, color: string): AggRow => {
    let r = map.get(key);
    if (!r) {
      r = blank(key, label, color);
      map.set(key, r);
    }
    return r;
  };

  for (const e of ctx.entries) {
    if (e.date < opts.from || e.date > opts.to) continue;
    if (!matchesProjectClient(ctx, e.projectId, opts)) continue;
    if (opts.billable === "billable" && !e.billable) continue;
    if (opts.billable === "non" && e.billable) continue;

    let key: string;
    let label: string;
    let color: string;
    switch (opts.dimension) {
      case "day":
        key = e.date; label = fmtDay(e.date); color = clientColorOf(ctx, e.projectId); break;
      case "week": {
        const w = startOfWeek(parseKey(e.date), opts.weekStart);
        key = toKey(w); label = `Wk of ${fmtDay(key)}`; color = "var(--tv-accent)"; break;
      }
      case "month":
        key = e.date.slice(0, 7);
        label = parseKey(e.date).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        color = "var(--tv-accent)"; break;
      case "client": {
        const p = ctx.projects.find((x) => x.id === e.projectId);
        const c = ctx.clients.find((x) => x.id === p?.clientId);
        key = c?.id ?? "none"; label = c?.name ?? "No client"; color = p?.color ?? "var(--tv-line)"; break;
      }
      case "project": {
        const p = ctx.projects.find((x) => x.id === e.projectId);
        key = p?.id ?? "none"; label = p?.name ?? "No project"; color = p?.color ?? "var(--tv-line)"; break;
      }
      case "task": {
        const t = ctx.tasks.find((x) => x.id === e.taskId);
        key = t?.id ?? "none"; label = t?.name ?? "No task"; color = clientColorOf(ctx, e.projectId); break;
      }
      case "billable":
        key = e.billable ? "billable" : "non";
        label = e.billable ? "Billable" : "Non-billable";
        color = e.billable ? "var(--tv-accent)" : "var(--tv-line)"; break;
      case "category": {
        const p = ctx.projects.find((x) => x.id === e.projectId);
        key = p?.id ?? "none"; label = p?.name ?? "No project"; color = p?.color ?? "var(--tv-line)"; break;
      }
    }

    const row = put(key, label, color);
    row.minutes += e.durationMin;
    row.entryCount += 1;
    if (e.billable) {
      row.billableMin += e.durationMin;
      row.billableAmount += hoursAmount(e.durationMin, e.rate);
    } else {
      row.nonBillableMin += e.durationMin;
    }
  }

  return sortRows([...map.values()], opts.dimension);
}

export function aggregateExpenses(
  ctx: AggCtx,
  opts: Omit<AggOpts, "dimension"> & { dimension: Dimension }
): AggRow[] {
  const map = new Map<string, AggRow>();
  const put = (key: string, label: string, color: string): AggRow => {
    let r = map.get(key);
    if (!r) {
      r = blank(key, label, color);
      map.set(key, r);
    }
    return r;
  };
  const CAT_COLORS = ["#E8920C", "#0D6E52", "#2563EB", "#7C3AED", "#DB2777", "#0891B2"];
  let ci = 0;
  const catColor = new Map<string, string>();

  for (const x of ctx.expenses) {
    if (x.date < opts.from || x.date > opts.to) continue;
    if (!matchesProjectClient(ctx, x.projectId, opts)) continue;
    if (opts.billable === "billable" && !x.billable) continue;
    if (opts.billable === "non" && x.billable) continue;

    let key: string;
    let label: string;
    let color: string;
    switch (opts.dimension) {
      case "day":
        key = x.date; label = fmtDay(x.date); color = "#E8920C"; break;
      case "week": {
        const w = startOfWeek(parseKey(x.date), opts.weekStart);
        key = toKey(w); label = `Wk of ${fmtDay(key)}`; color = "#E8920C"; break;
      }
      case "month":
        key = x.date.slice(0, 7);
        label = parseKey(x.date).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        color = "#E8920C"; break;
      case "client": {
        const p = ctx.projects.find((pp) => pp.id === x.projectId);
        const c = ctx.clients.find((cc) => cc.id === p?.clientId);
        key = c?.id ?? "none"; label = c?.name ?? "No client"; color = p?.color ?? "var(--tv-line)"; break;
      }
      case "project":
      case "task":
      case "billable": {
        const p = ctx.projects.find((pp) => pp.id === x.projectId);
        key = p?.id ?? "none"; label = p?.name ?? "No project"; color = p?.color ?? "var(--tv-line)"; break;
      }
      case "category": {
        key = x.category; label = x.category;
        if (!catColor.has(x.category)) catColor.set(x.category, CAT_COLORS[ci++ % CAT_COLORS.length]);
        color = catColor.get(x.category)!; break;
      }
    }

    const row = put(key, label, color);
    row.expenseCount += 1;
    row.expenseTotal += x.amount * ctx.getRate(x.currency);
  }

  return sortRows([...map.values()], opts.dimension);
}

function sortRows(rows: AggRow[], dim: Dimension): AggRow[] {
  const timeLike = dim === "day" || dim === "week" || dim === "month";
  if (timeLike) return rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows.sort((a, b) => b.minutes + b.expenseTotal - (a.minutes + a.expenseTotal));
}

export const sumRows = (rows: AggRow[], metric: Metric): number =>
  round2(
    rows.reduce(
      (s, r) =>
        s +
        (metric === "hours"
          ? r.minutes / 60
          : metric === "amount"
            ? r.billableAmount
            : metric === "entries"
              ? r.entryCount
              : r.expenseTotal),
      0
    )
  );

export function metricNumber(r: AggRow, metric: Metric): number {
  if (metric === "hours") return r.minutes / 60;
  if (metric === "amount") return r.billableAmount;
  if (metric === "entries") return r.entryCount;
  return r.expenseTotal;
}

export function formatMetricValue(v: number, metric: Metric, currency: string): string {
  if (metric === "hours") return `${round2(v)}h`;
  if (metric === "entries") return String(Math.round(v));
  return money(v, currency);
}

export function totalRow(rows: AggRow[]): AggRow {
  const t = blank("total", "Total", "var(--tv-accent)");
  for (const r of rows) {
    t.minutes += r.minutes;
    t.billableMin += r.billableMin;
    t.nonBillableMin += r.nonBillableMin;
    t.billableAmount += r.billableAmount;
    t.entryCount += r.entryCount;
    t.expenseCount += r.expenseCount;
    t.expenseTotal += r.expenseTotal;
  }
  t.billableAmount = round2(t.billableAmount);
  t.expenseTotal = round2(t.expenseTotal);
  return t;
}

/* ---------------- Harvest-style time rollup (client → project → task) ---------------- */

export interface RollupNode {
  id: string | null;
  label: string;
  color: string;
  kind: "client" | "project" | "task";
  minutes: number;
  billableMin: number;
  billableAmount: number;
  entryCount: number;
  children: RollupNode[];
}

export function timeRollup(
  ctx: AggCtx,
  from: string,
  to: string,
  billable: "all" | "billable" | "non" = "all",
  clientId: string | null = null
): RollupNode[] {
  const clients = new Map<string, RollupNode>();
  const node = (
    map: Map<string, RollupNode>,
    id: string,
    label: string,
    color: string,
    kind: RollupNode["kind"]
  ): RollupNode => {
    let n = map.get(id);
    if (!n) {
      n = { id, label, color, kind, minutes: 0, billableMin: 0, billableAmount: 0, entryCount: 0, children: [] };
      map.set(id, n);
    }
    return n;
  };

  for (const e of ctx.entries) {
    if (e.date < from || e.date > to) continue;
    if (billable === "billable" && !e.billable) continue;
    if (billable === "non" && e.billable) continue;
    const p = ctx.projects.find((x) => x.id === e.projectId);
    if (clientId && p?.clientId !== clientId) continue;

    const c = node(clients, p?.clientId ?? "none", ctx.clients.find((x) => x.id === p?.clientId)?.name ?? "No client", p?.color ?? "var(--tv-line)", "client");
    const projMap = new Map(c.children.map((x) => [x.id ?? "none", x]));
    const pr = node(projMap, p?.id ?? "none", p?.name ?? "No project", p?.color ?? "var(--tv-line)", "project");
    if (!c.children.includes(pr)) c.children.push(pr);
    const taskMap = new Map(pr.children.map((x) => [x.id ?? "none", x]));
    const tk = node(taskMap, e.taskId ?? "none", ctx.tasks.find((x) => x.id === e.taskId)?.name ?? "No task", p?.color ?? "var(--tv-line)", "task");
    if (!pr.children.includes(tk)) pr.children.push(tk);

    for (const n of [c, pr, tk]) {
      n.minutes += e.durationMin;
      n.entryCount += 1;
      if (e.billable) {
        n.billableMin += e.durationMin;
        n.billableAmount += hoursAmount(e.durationMin, e.rate);
      }
    }
  }

  const finish = (n: RollupNode) => {
    n.billableAmount = round2(n.billableAmount);
    n.children.sort((a, b) => b.minutes - a.minutes);
    n.children.forEach(finish);
  };
  const out = [...clients.values()].sort((a, b) => b.minutes - a.minutes);
  out.forEach(finish);
  return out;
}

export function rollupToRows(tree: RollupNode[]): Array<Array<string | number>> {
  const out: Array<Array<string | number>> = [];
  const walk = (n: RollupNode, level: number) => {
    out.push([n.label, n.kind, n.entryCount, round2(n.minutes / 60), round2(n.billableMin / 60), n.billableAmount]);
    n.children.forEach((c) => walk(c, level + 1));
  };
  tree.forEach((n) => walk(n, 0));
  return out;
}

/* ---------------- daily series (billable vs non) ---------------- */

export interface DailyPoint {
  key: string;
  label: string;
  billableMin: number;
  nonBillableMin: number;
}

export function dailySeries(
  ctx: AggCtx,
  from: string,
  to: string,
  clientId: string | null = null
): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  const cur = parseKey(from);
  const end = parseKey(to);
  while (cur <= end) {
    const k = toKey(cur);
    map.set(k, { key: k, label: String(cur.getDate()), billableMin: 0, nonBillableMin: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  for (const e of ctx.entries) {
    if (e.date < from || e.date > to) continue;
    if (clientId) {
      const p = ctx.projects.find((x) => x.id === e.projectId);
      if (p?.clientId !== clientId) continue;
    }
    const d = map.get(e.date);
    if (!d) continue;
    if (e.billable) d.billableMin += e.durationMin;
    else d.nonBillableMin += e.durationMin;
  }
  return [...map.values()];
}

/* ---------------- un-invoiced analysis ---------------- */

export interface UnbilledProject {
  projectId: string | null;
  name: string;
  color: string;
  entryCount: number;
  minutes: number;
  amount: number;
  first: string;
  last: string;
}

export interface UnbilledClient {
  clientId: string | null;
  name: string;
  projects: UnbilledProject[];
  entryCount: number;
  minutes: number;
  amount: number;
}

export function unbilledByClient(ctx: AggCtx, billedIds: Set<string>): UnbilledClient[] {
  const map = new Map<string, UnbilledClient>();
  for (const e of ctx.entries) {
    if (!e.billable || billedIds.has(e.id)) continue;
    const p = ctx.projects.find((x) => x.id === e.projectId);
    const c = ctx.clients.find((x) => x.id === p?.clientId);
    const cKey = c?.id ?? "none";
    let uc = map.get(cKey);
    if (!uc) {
      uc = { clientId: c?.id ?? null, name: c?.name ?? "No client", projects: [], entryCount: 0, minutes: 0, amount: 0 };
      map.set(cKey, uc);
    }
    let up = uc.projects.find((x) => x.projectId === e.projectId);
    if (!up) {
      up = {
        projectId: e.projectId, name: p?.name ?? "No project", color: p?.color ?? "var(--tv-line)",
        entryCount: 0, minutes: 0, amount: 0, first: e.date, last: e.date,
      };
      uc.projects.push(up);
    }
    up.entryCount += 1;
    up.minutes += e.durationMin;
    up.amount += hoursAmount(e.durationMin, e.rate);
    if (e.date < up.first) up.first = e.date;
    if (e.date > up.last) up.last = e.date;
    uc.entryCount += 1;
    uc.minutes += e.durationMin;
    uc.amount += hoursAmount(e.durationMin, e.rate);
  }
  for (const uc of map.values()) {
    uc.amount = round2(uc.amount);
    uc.projects.forEach((p) => (p.amount = round2(p.amount)));
    uc.projects.sort((a, b) => b.amount - a.amount);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export type { Invoice, Expense, TimeEntry, Project, Client, Task };
