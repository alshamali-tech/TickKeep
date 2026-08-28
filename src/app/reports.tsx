import { useCallback, useEffect, useMemo, useState } from "react";
import { billedEntryIds, useStore, type ReportBlock, type Metric, type Dimension, type RangeKey } from "../lib/store";
import {
  RANGE_LABEL, resolveRange, rangeDays, aggregateEntries, aggregateExpenses,
  sumRows, metricNumber, formatMetricValue, totalRow, timeRollup, rollupToRows,
  dailySeries, unbilledByClient, METRIC_LABEL, DIM_LABEL,
  type AggCtx, type Range, type AggRow, type RollupNode,
} from "../lib/reports";
import { fetchRates, makeConverter, readRatesCache, type RatesInfo } from "../lib/platform";
import { I } from "../components/icons";
import { Button, EmptyState, IconButton, Input, ProgressBar, Segmented, Select, Tabs, useToast, navigate } from "../components/ui";
import { ChartCard, Columns, Donut, RankBars, StackedColumns } from "../components/charts";
import { cx, downloadFile, fmtDate, fmtH, fmtHL, money, round2, toCSV, todayKey, uid } from "../lib/utils";

/* ---------------- rates hook (fetch-on-demand, never on app load) ---------------- */

function useRates(needed: boolean, currency: string) {
  const [info, setInfo] = useState<RatesInfo | null>(() => readRatesCache());
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!needed) return;
    const cached = readRatesCache();
    const stale = !cached || Date.now() - cached.fetchedAt > 24 * 3600_000;
    if (!stale) {
      setInfo(cached);
      return;
    }
    setLoading(true);
    fetchRates()
      .then(setInfo)
      .catch(() => setInfo(readRatesCache()))
      .finally(() => setLoading(false));
  }, [needed]);
  const stale = info ? Date.now() - info.fetchedAt > 24 * 3600_000 : true;
  /* Stable identity — the report ctx (and every aggregation memo) depends on
   * this; recreating it per render would recompute every block needlessly. */
  const getRate = useMemo(() => makeConverter(info, currency), [info, currency]);
  return { info, loading, stale, getRate };
}

/* ---------------- page ---------------- */

type TabKey = "time" | "uninvoiced" | "expenses" | "custom";
type PresetKey = RangeKey;

export function ReportsPage() {
  const entries = useStore((s) => s.entries);
  const expenses = useStore((s) => s.expenses);
  const projects = useStore((s) => s.projects);
  const clients = useStore((s) => s.clients);
  const tasks = useStore((s) => s.tasks);
  const invoices = useStore((s) => s.invoices);
  const invDefaults = useStore((s) => s.invDefaults);
  const weekStart = useStore((s) => s.prefs.weekStart);
  const builderBlocks = useStore((s) => s.builder.blocks);

  const [tab, setTab] = useState<TabKey>("time");
  const [preset, setPreset] = useState<PresetKey>("thisMonth");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const range = useMemo(
    () => resolveRange(preset, weekStart, from || undefined, to || undefined),
    [preset, weekStart, from, to]
  );

  const needsRates =
    tab === "expenses" ||
    (tab === "custom" && builderBlocks.some((b) => b.metric === "amount" || b.metric === "expenseAmount"));
  const rates = useRates(needsRates, invDefaults.currency);

  const ctx: AggCtx = useMemo(
    () => ({ entries, expenses, projects, clients, tasks, getRate: rates.getRate, currency: invDefaults.currency }),
    [entries, expenses, projects, clients, tasks, rates.getRate, invDefaults.currency]
  );

  const hasData = entries.length > 0 || expenses.length > 0;

  return (
    <div className="space-y-5">
      <Tabs
        active={tab}
        onChange={(t) => setTab(t as TabKey)}
        items={[
          { id: "time", label: "Time", icon: "clock" },
          { id: "uninvoiced", label: "Un-invoiced", icon: "wallet" },
          { id: "expenses", label: "Expenses", icon: "receipt" },
          { id: "custom", label: "Custom builder", icon: "layout" },
        ]}
      />

      {tab !== "custom" && (
        <div className="flex flex-wrap items-center gap-2.5">
          <Segmented
            label="Date range"
            value={preset === "custom" ? "custom" : preset}
            onChange={(v) => setPreset(v as PresetKey)}
            options={[
              { value: "thisWeek", label: "This wk" },
              { value: "lastWeek", label: "Last wk" },
              { value: "thisMonth", label: "Month" },
              { value: "lastMonth", label: "Last mo" },
              { value: "last90", label: "90 days" },
              { value: "all", label: "All" },
              { value: "custom", label: "Custom" },
            ]}
          />
          {preset === "custom" && (
            <span className="flex items-center gap-1.5">
              <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink focus:border-accent focus:outline-none" />
              <span className="text-muted">–</span>
              <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)}
                className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink focus:border-accent focus:outline-none" />
            </span>
          )}
          <span className="font-mono text-[12.5px] text-muted">{range.label}</span>
        </div>
      )}

      {!hasData && tab !== "custom" ? (
        <EmptyState icon="chart" title="Nothing to chart yet" desc="Track a few hours or log an expense and this page comes alive.">
          <Button icon="play" onClick={() => navigate("#/app/timer")}>Open the timer</Button>
        </EmptyState>
      ) : (
        <>
          {tab === "time" && <TimeTab ctx={ctx} range={range} />}
          {tab === "uninvoiced" && <UninvoicedTab ctx={ctx} invoices={invoices} />}
          {tab === "expenses" && <ExpensesTab ctx={ctx} range={range} stale={rates.stale} loading={rates.loading} />}
          {tab === "custom" && <BuilderTab ctx={ctx} weekStart={weekStart} />}
        </>
      )}
    </div>
  );
}

/* ---------------- Time tab ---------------- */

function TimeTab({ ctx, range }: { ctx: AggCtx; range: Range }) {
  const [billFilter, setBillFilter] = useState<"all" | "billable" | "non">("all");
  const [clientFilter, setClientFilter] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set(["*"]));
  const { push } = useToast();

  const tree = useMemo(
    () => timeRollup(ctx, range.from, range.to, billFilter, clientFilter || undefined),
    [ctx, range, billFilter, clientFilter]
  );
  const series = useMemo(
    () => dailySeries(ctx, range.from, range.to, clientFilter || undefined),
    [ctx, range, clientFilter]
  );

  const totals = useMemo(() => {
    const t = { minutes: 0, billableMin: 0, billableAmount: 0, entries: 0 };
    for (const c of tree) {
      t.minutes += c.minutes;
      t.billableMin += c.billableMin;
      t.billableAmount += c.billableAmount;
      t.entries += c.entryCount;
    }
    return t;
  }, [tree]);

  const days = rangeDays(range);
  const billPct = totals.minutes > 0 ? Math.round((totals.billableMin / totals.minutes) * 100) : 0;

  const topProjects = useMemo(() => {
    const map = new Map<string, { label: string; value: number; color: string }>();
    for (const c of tree)
      for (const p of c.children) {
        const cur = map.get(p.id ?? "none") ?? { label: p.label, value: 0, color: p.color };
        cur.value += p.minutes;
        map.set(p.id ?? "none", cur);
      }
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 5).map((x) => ({ ...x, value: x.value / 60 }));
  }, [tree]);

  const isOpen = (key: string) => open.has("*") || open.has(key);
  const toggle = (key: string) => {
    const next = new Set(open);
    next.delete("*");
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpen(next);
  };

  const exportCsv = () => {
    const rows = rollupToRows(tree);
    downloadFile(
      `timevault-time-report-${range.from}-${range.to}.csv`,
      toCSV([["Name", "Level", "Entries", "Hours", "Billable hours", "Billable amount"], ...rows]),
      "text/csv"
    );
    push({ kind: "ok", title: "Time report exported", desc: `${rows.length} rows · ${range.label}` });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented
          label="Billable filter"
          value={billFilter}
          onChange={setBillFilter}
          options={[
            { value: "all", label: "All" },
            { value: "billable", label: "Billable" },
            { value: "non", label: "Non-billable" },
          ]}
        />
        <div className="w-48 min-w-0">
          <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} aria-label="Filter by client">
            <option value="">All clients</option>
            {ctx.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <span className="ml-auto" />
        <Button variant="outline" size="sm" icon="download" onClick={exportCsv}>CSV</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatChip label="Tracked" value={fmtHL(totals.minutes)} sub={`${totals.entries} entries · ${range.label}`} />
        <StatChip label="Billable" value={fmtHL(totals.billableMin)} sub={`${billPct}% of tracked`} tone="accent" />
        <StatChip label="Billable value" value={money(totals.billableAmount, ctx.currency)} sub={`in ${ctx.currency}`} tone="accent" />
        <StatChip label="Avg per day" value={fmtHL(totals.minutes / days)} sub={`across ${days} days`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-line bg-surface shadow-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-4.5 py-3 sm:px-5">
            <h3 className="font-display text-[15px] font-bold text-ink">Client → project → task</h3>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setOpen(new Set(["*"]))}>Expand all</Button>
              <Button variant="ghost" size="sm" onClick={() => setOpen(new Set())}>Collapse</Button>
            </div>
          </div>
          {tree.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">No entries in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-130 border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-surface2/40">
                    <th className="px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted" scope="col">Name</th>
                    <th className="px-3 py-2.5 text-right text-[11.5px] font-semibold uppercase tracking-wide text-muted" scope="col">Entries</th>
                    <th className="px-3 py-2.5 text-right text-[11.5px] font-semibold uppercase tracking-wide text-muted" scope="col">Hours</th>
                    <th className="px-3 py-2.5 text-right text-[11.5px] font-semibold uppercase tracking-wide text-muted" scope="col">Billable</th>
                    <th className="px-5 py-2.5 text-right text-[11.5px] font-semibold uppercase tracking-wide text-muted" scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {tree.map((c) => (
                    <TreeGroup key={c.id ?? "none"} node={c} depth={0} isOpen={isOpen(c.id ?? "none")} onToggle={() => toggle(c.id ?? "none")} currency={ctx.currency}>
                      {isOpen(c.id ?? "none") &&
                        c.children.map((p) => {
                          const pKey = `${c.id ?? "none"}:${p.id ?? "none"}`;
                          return (
                            <TreeGroup key={pKey} node={p} depth={1} isOpen={isOpen(pKey)} onToggle={() => toggle(pKey)} currency={ctx.currency}>
                              {isOpen(pKey) &&
                                p.children.map((t) => <TreeRow key={t.id ?? "none"} node={t} depth={2} currency={ctx.currency} />)}
                            </TreeGroup>
                          );
                        })}
                    </TreeGroup>
                  ))}
                  <tr className="border-t-2 border-line bg-surface2/60 font-bold">
                    <td className="px-5 py-3 text-[13px] text-ink">Total</td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] tabular text-ink">{totals.entries}</td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] tabular text-ink">{fmtH(totals.minutes)}</td>
                    <td className="px-3 py-3 text-right font-mono text-[13px] tabular text-accent">{fmtH(totals.billableMin)}</td>
                    <td className="px-5 py-3 text-right font-mono text-[13px] tabular text-ink">{money(totals.billableAmount, ctx.currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-4">
          <ChartCard title="Hours per day" sub="Billable vs non-billable">
            <StackedColumns
              data={series.map((d) => ({ label: d.label, a: d.billableMin, b: d.nonBillableMin }))}
              aLabel="Billable"
              bLabel="Non-billable"
              height={150}
            />
          </ChartCard>
          <ChartCard title="Billable utilization" sub="Share of tracked time that earns">
            <ProgressBar value={billPct / 100} tone={billPct >= 70 ? "accent" : billPct >= 40 ? "amber" : "danger"} label="Billable utilization" />
            <p className="mt-2 font-mono text-[13px] font-semibold tabular text-ink">
              {billPct}% <span className="font-normal text-muted">billable</span>
            </p>
          </ChartCard>
          <ChartCard title="Top projects" sub="By hours in range">
            <RankBars data={topProjects} format={(v) => fmtHL(v * 60)} />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

function TreeGroup({ node, depth, isOpen, onToggle, currency, children }: {
  node: RollupNode; depth: number; isOpen: boolean; onToggle: () => void; currency: string; children?: React.ReactNode;
}) {
  const hasKids = node.children.length > 0;
  return (
    <>
      <tr className="border-b border-line/60 transition-colors hover:bg-surface2/40">
        <td className="py-2.5 pr-2 pl-3">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 22 }}>
            {hasKids ? (
              <button onClick={onToggle} aria-expanded={isOpen} aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.label}`}
                className="rounded p-1 text-muted transition-all hover:bg-surface2 hover:text-ink">
                <I name={isOpen ? "chevD" : "chevR"} size={14} />
              </button>
            ) : (
              <span className="w-6" />
            )}
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: node.color }} />
            <span className={cx("min-w-0 truncate text-[13px]", depth === 0 ? "font-bold text-ink" : "font-semibold text-ink")}>{node.label}</span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-[12.5px] tabular text-ink2">{node.entryCount}</td>
        <td className={cx("px-3 py-2.5 text-right font-mono text-[12.5px] tabular", depth === 0 ? "font-bold text-ink" : "text-ink")}>{fmtH(node.minutes)}</td>
        <td className="px-3 py-2.5 text-right font-mono text-[12.5px] tabular text-accent">{fmtH(node.billableMin)}</td>
        <td className={cx("px-5 py-2.5 text-right font-mono text-[12.5px] tabular", depth === 0 ? "font-bold text-ink" : "text-ink")}>{money(node.billableAmount, currency)}</td>
      </tr>
      {children}
    </>
  );
}

function TreeRow({ node, depth, currency }: { node: RollupNode; depth: number; currency: string }) {
  return (
    <tr className="border-b border-line/60 transition-colors last:border-0 hover:bg-surface2/40">
      <td className="py-2 pr-2 pl-3">
        <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 22 + 26 }}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted/60" />
          <span className="min-w-0 truncate text-[12.5px] text-ink2">{node.label}</span>
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-[12px] tabular text-muted">{node.entryCount}</td>
      <td className="px-3 py-2 text-right font-mono text-[12px] tabular text-ink2">{fmtH(node.minutes)}</td>
      <td className="px-3 py-2 text-right font-mono text-[12px] tabular text-accent/80">{fmtH(node.billableMin)}</td>
      <td className="px-5 py-2 text-right font-mono text-[12px] tabular text-ink2">{money(node.billableAmount, currency)}</td>
    </tr>
  );
}

function StatChip({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "accent" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={cx("mt-1 font-mono text-[22px] font-semibold tabular leading-none", tone === "accent" ? "text-accent" : "text-ink")}>{value}</p>
      {sub && <p className="mt-1 truncate text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

/* ---------------- Un-invoiced tab ---------------- */

function UninvoicedTab({ ctx, invoices }: { ctx: AggCtx; invoices: ReturnType<typeof useStore.getState>["invoices"] }) {
  const { push } = useToast();
  const billed = useMemo(() => billedEntryIds(invoices), [invoices]);
  const data = useMemo(() => unbilledByClient(ctx, billed), [ctx, billed]);

  const totals = useMemo(() => {
    const t = { amount: 0, minutes: 0, entries: 0 };
    for (const c of data) {
      t.amount += c.amount;
      t.minutes += c.minutes;
      t.entries += c.entryCount;
    }
    return t;
  }, [data]);

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-xl border border-amber/45 bg-amber/10 p-5">
        <div className="glow-amber pointer-events-none absolute -right-10 -top-14 h-48 w-48" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink2">Sitting un-invoiced</p>
            <p className="mt-0.5 font-mono text-[30px] font-semibold tabular leading-none text-ink">{money(totals.amount, ctx.currency)}</p>
          </div>
          <div className="text-[13px] text-ink2">
            <p><span className="font-mono font-semibold tabular text-ink">{fmtHL(totals.minutes)}</span> of billable time</p>
            <p><span className="font-mono font-semibold tabular text-ink">{totals.entries}</span> entries across <span className="font-mono font-semibold tabular text-ink">{data.length}</span> clients</p>
          </div>
          <Button
            variant="amber"
            icon="invoice"
            className="ml-auto"
            onClick={() => {
              navigate("#/app/invoices");
              push({ kind: "info", title: "Pick the unbilled entries", desc: "The invoice wizard lists exactly these hours." });
            }}
          >
            Start an invoice
          </Button>
        </div>
      </div>

      {data.length === 0 ? (
        <EmptyState icon="check" title="Everything's billed" desc="No billable hours are waiting on an invoice. Beautiful." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((c) => (
            <section key={c.clientId ?? "none"} className="anim-rise rounded-xl border border-line bg-surface shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4.5 py-3.5 sm:px-5">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-[15px] font-bold text-ink">{c.name}</h3>
                  <p className="text-[12px] text-muted">{fmtHL(c.minutes)} · {c.entryCount} entries</p>
                </div>
                <p className="font-mono text-lg font-semibold tabular text-amber">{money(c.amount, ctx.currency)}</p>
              </div>
              <ul className="divide-y divide-line/60">
                {c.projects.map((p) => (
                  <li key={p.projectId ?? "none"} className="flex items-center gap-3 px-4.5 py-2.5 sm:px-5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-ink">{p.name}</p>
                      <p className="font-mono text-[11.5px] text-muted">{fmtDate(p.first)} → {fmtDate(p.last)}</p>
                    </div>
                    <span className="font-mono text-[12.5px] tabular text-ink2">{fmtH(p.minutes)}</span>
                    <span className="w-20 text-right font-mono text-[12.5px] font-semibold tabular text-ink">{money(p.amount, ctx.currency)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Expenses tab ---------------- */

const CAT_COLORS = ["#E8920C", "#0D6E52", "#2563EB", "#7C3AED", "#DB2777", "#0891B2"];

function ExpensesTab({ ctx, range, stale, loading }: { ctx: AggCtx; range: Range; stale: boolean; loading: boolean }) {
  const rows = useMemo(
    () => ctx.expenses.filter((x) => x.date >= range.from && x.date <= range.to).sort((a, b) => b.date.localeCompare(a.date)),
    [ctx.expenses, range]
  );

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of rows) m.set(x.category, (m.get(x.category) ?? 0) + x.amount * ctx.getRate(x.currency));
    return [...m.entries()]
      .map(([label, value], i) => ({ label, value, color: CAT_COLORS[i % CAT_COLORS.length] }))
      .sort((a, b) => b.value - a.value);
  }, [rows, ctx]);

  const byProject = useMemo(() => {
    const m = new Map<string, { value: number; color: string }>();
    for (const x of rows) {
      const p = ctx.projects.find((pp) => pp.id === x.projectId);
      const key = p?.name ?? "No project";
      const cur = m.get(key) ?? { value: 0, color: p?.color ?? "var(--tv-line)" };
      cur.value += x.amount * ctx.getRate(x.currency);
      m.set(key, cur);
    }
    return [...m.entries()].map(([label, v]) => ({ label, value: v.value, color: v.color })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [rows, ctx]);

  const total = rows.reduce((s, x) => s + x.amount * ctx.getRate(x.currency), 0);
  const billableTotal = rows.reduce((s, x) => s + (x.billable ? x.amount * ctx.getRate(x.currency) : 0), 0);

  return (
    <div className="space-y-5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface2/50 px-3.5 py-2.5 text-[12.5px] text-ink2">
        <I name="info" size={14} className="shrink-0 text-info" />
        <span>
          Amounts converted to <strong className="font-semibold text-ink">{ctx.currency}</strong>
          {loading && " · refreshing…"}
          {!loading && !stale && " · rates fresh (<24h)"}
          {!loading && stale && " · rates older than 24h — figures approximate"}
          {" · "}rates by open.er-api.com
        </span>
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatChip label="Total spend" value={money(total, ctx.currency)} sub={range.label} />
        <StatChip label="Billable" value={money(billableTotal, ctx.currency)} sub={`${rows.filter((x) => x.billable).length} items`} tone="accent" />
        <StatChip label="Out of pocket" value={money(total - billableTotal, ctx.currency)} sub="non-billable" />
        <StatChip label="Receipts" value={String(rows.length)} sub={`avg ${money(rows.length ? total / rows.length : 0, ctx.currency)}`} />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="receipt" title="No expenses in range" desc="Log one and it lands here, converted and categorized.">
          <Button icon="plus" onClick={() => navigate("#/app/expenses")}>Log an expense</Button>
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Spend by category" sub={`Converted to ${ctx.currency}`}>
              <Donut data={byCategory} centerLabel="Total spend" format={(v) => money(v, ctx.currency)} />
            </ChartCard>
            <ChartCard title="Spend by project" sub={`Converted to ${ctx.currency}`}>
              <RankBars data={byProject} format={(v) => money(v, ctx.currency)} color="var(--tv-amber)" />
            </ChartCard>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
            <table className="w-full min-w-160 border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-surface2/50">
                  {["Date", "Project", "Category", "Notes", "Original", `In ${ctx.currency}`, "Billing"].map((h) => (
                    <th key={h} className="px-5 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-muted" scope="col">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => {
                  const p = ctx.projects.find((pp) => pp.id === x.projectId);
                  return (
                    <tr key={x.id} className="border-b border-line/70 transition-colors last:border-0 hover:bg-surface2/40">
                      <td className="px-5 py-3 text-[13px] whitespace-nowrap text-ink2">{fmtDate(x.date)}</td>
                      <td className="max-w-40 truncate px-5 py-3 text-[13px] text-ink">
                        <span className="inline-flex min-w-0 items-center gap-2">
                          {p && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />}
                          <span className="truncate">{p?.name ?? "No project"}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[13px] text-ink2">{x.category}</td>
                      <td className="max-w-52 truncate px-5 py-3 text-[13px] text-ink2">{x.notes || "—"}</td>
                      <td className="px-5 py-3 text-right font-mono text-[13px] tabular whitespace-nowrap text-ink">{money(x.amount, x.currency)}</td>
                      <td className="px-5 py-3 text-right font-mono text-[13px] font-semibold tabular whitespace-nowrap text-ink">{money(x.amount * ctx.getRate(x.currency), ctx.currency)}</td>
                      <td className="px-5 py-3">
                        <span className={cx("rounded px-2 py-0.5 text-[11.5px] font-bold", x.billable ? "bg-accent/12 text-accent" : "bg-surface2 text-muted")}>
                          {x.billable ? "billable" : "own cost"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Custom report builder ---------------- */

const BLOCK_META: Array<{ type: ReportBlock["type"]; label: string; icon: "zap" | "chart" | "donut" | "rank" | "list"; hint: string }> = [
  { type: "stat", label: "Stat card", icon: "zap", hint: "One big number" },
  { type: "chart", label: "Columns", icon: "chart", hint: "Trend over time" },
  { type: "donut", label: "Donut", icon: "donut", hint: "Share of a whole" },
  { type: "hbar", label: "Ranking", icon: "rank", hint: "Top performers" },
  { type: "table", label: "Table", icon: "list", hint: "Full rollup" },
];

const DEFAULTS: Record<ReportBlock["type"], Partial<ReportBlock>> = {
  stat: { metric: "hours", dimension: "project", range: "thisWeek", size: "half" },
  chart: { metric: "hours", dimension: "day", range: "thisMonth", size: "full" },
  donut: { metric: "hours", dimension: "client", range: "last90", size: "half" },
  hbar: { metric: "amount", dimension: "client", range: "last90", size: "half" },
  table: { metric: "hours", dimension: "project", range: "thisMonth", size: "full" },
};

const T = (type: ReportBlock["type"], over: Partial<ReportBlock>): ReportBlock => ({
  id: uid(), type, from: "", to: "", billable: "all", projectId: null, clientId: null, title: "",
  ...DEFAULTS[type], ...over,
} as ReportBlock);

const TEMPLATES: Array<{ id: string; name: string; blocks: () => ReportBlock[] }> = [
  {
    id: "pulse",
    name: "Weekly pulse",
    blocks: () => [
      T("stat", { title: "Tracked this week" }),
      T("stat", { metric: "amount", title: "Billable value" }),
      T("chart", { dimension: "day", range: "thisWeek", title: "Hours per day" }),
      T("hbar", { range: "thisWeek", title: "Projects this week", dimension: "project" }),
    ],
  },
  {
    id: "profit",
    name: "Client profitability",
    blocks: () => [
      T("hbar", { metric: "amount", range: "last90", title: "Billable by client · 90d" }),
      T("donut", { range: "last90", title: "Hours share by client" }),
      T("chart", { metric: "amount", dimension: "week", range: "last90", title: "Billable value per week" }),
      T("table", { range: "last90", dimension: "client", title: "Client rollup · 90d" }),
    ],
  },
  {
    id: "expense",
    name: "Expense audit",
    blocks: () => [
      T("stat", { metric: "expenseAmount", title: "Spend this month" }),
      T("donut", { metric: "expenseAmount", dimension: "category", range: "last90", title: "Spend by category" }),
      T("hbar", { metric: "expenseAmount", dimension: "project", range: "last90", title: "Spend by project" }),
      T("table", { metric: "expenseAmount", dimension: "category", range: "last90", title: "Category rollup" }),
    ],
  },
];

const METRIC_OPTIONS: Array<{ value: Metric; label: string }> = [
  { value: "hours", label: "Hours" },
  { value: "amount", label: "Billable amount" },
  { value: "entries", label: "Entry count" },
  { value: "expenseAmount", label: "Expense total" },
];

const isExpenseMetric = (m: Metric) => m === "expenseAmount";
const dimsFor = (metric: Metric): Dimension[] =>
  isExpenseMetric(metric)
    ? ["day", "week", "month", "project", "client", "category"]
    : ["day", "week", "month", "client", "project", "task", "billable"];

function computeRows(block: ReportBlock, ctx: AggCtx, weekStart: 0 | 1): AggRow[] {
  const r = resolveRange(block.range, weekStart, block.from || undefined, block.to || undefined);
  const opts = {
    dimension: block.dimension,
    from: r.from,
    to: r.to,
    billable: block.billable,
    projectId: block.projectId,
    clientId: block.clientId,
    weekStart,
  };
  return isExpenseMetric(block.metric)
    ? aggregateExpenses(ctx, { ...opts, dimension: block.dimension === "billable" || block.dimension === "task" ? "category" : block.dimension })
    : aggregateEntries(ctx, { ...opts, dimension: block.dimension === "category" ? "project" : block.dimension });
}

const autoTitle = (b: ReportBlock) =>
  `${METRIC_LABEL[b.metric]} by ${DIM_LABEL[b.dimension]} · ${RANGE_LABEL[b.range]}`;

function BuilderTab({ ctx, weekStart }: { ctx: AggCtx; weekStart: 0 | 1 }) {
  const builder = useStore((s) => s.builder);
  const savedReports = useStore((s) => s.savedReports);
  const setBuilder = useStore((s) => s.setBuilder);
  const saveReport = useStore((s) => s.saveReport);
  const deleteReport = useStore((s) => s.deleteReport);
  const projects = useStore((s) => s.projects);
  const clients = useStore((s) => s.clients);
  const { push } = useToast();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [configOpen, setConfigOpen] = useState<string | null>(null);

  const blocks = builder.blocks;

  const updateBlock = useCallback(
    (id: string, patch: Partial<ReportBlock>) =>
      setBuilder({ blocks: blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }),
    [blocks, setBuilder]
  );

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...blocks];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setBuilder({ blocks: next });
  };

  const drop = (target: number) => {
    if (dragIdx === null || dragIdx === target) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const next = [...blocks];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(target > dragIdx ? target - 1 : target, 0, moved);
    setBuilder({ blocks: next });
    setDragIdx(null);
    setOverIdx(null);
  };

  const doSave = () => {
    const report = saveReport(builder.name.trim() || "Untitled report", blocks);
    setActiveId(report.id);
    push({ kind: "ok", title: `Report “${report.name}” saved`, desc: `${blocks.length} blocks · stored on this device` });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-surface p-3 shadow-card">
        <label className="sr-only" htmlFor="report-name">Report name</label>
        <input
          id="report-name"
          value={builder.name}
          onChange={(e) => setBuilder({ name: e.target.value })}
          className="h-10 min-w-0 flex-1 basis-44 rounded-lg border border-line bg-bg px-3 font-display text-[15px] font-bold text-ink focus:border-accent focus:outline-none"
          placeholder="Report name"
        />
        <Button icon="bookmark" onClick={doSave} disabled={blocks.length === 0}>
          {activeId ? "Save changes" : "Save report"}
        </Button>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Templates:</span>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setBuilder({ name: t.name, blocks: t.blocks() });
                setActiveId(null);
                push({ kind: "info", title: `Template “${t.name}” loaded` });
              }}
              className="rounded-full border border-line bg-surface2/60 px-3 py-1 text-[12.5px] font-semibold text-ink2 transition-all hover:border-accent/60 hover:bg-accent/10 hover:text-accent active:scale-95"
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {savedReports.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Saved:</span>
          {savedReports.map((r) => (
            <span
              key={r.id}
              className={cx(
                "inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-[12.5px] font-semibold transition-colors",
                activeId === r.id ? "border-accent/60 bg-accent/10 text-accent" : "border-line bg-surface text-ink2 hover:border-accent/40"
              )}
            >
              <button
                onClick={() => {
                  setBuilder({ name: r.name, blocks: r.blocks.map((b) => ({ ...b })) });
                  setActiveId(r.id);
                  push({ kind: "info", title: `Loaded “${r.name}”` });
                }}
                className="max-w-40 truncate hover:underline"
              >
                {r.name}
              </button>
              <span className="font-mono text-[10.5px] text-muted">{r.blocks.length}</span>
              <button
                onClick={() => {
                  deleteReport(r.id);
                  if (activeId === r.id) setActiveId(null);
                  push({ kind: "info", title: `Deleted “${r.name}”` });
                }}
                aria-label={`Delete saved report ${r.name}`}
                className="rounded-full p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <I name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {BLOCK_META.map((m) => (
          <button
            key={m.type}
            onClick={() => setBuilder({ blocks: [...blocks, T(m.type, {})] })}
            className="group flex items-center gap-3 rounded-xl border border-dashed border-line bg-surface/60 px-3.5 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/70 hover:bg-accent/5 hover:shadow-card active:translate-y-0"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface2 text-ink2 transition-colors group-hover:bg-accent group-hover:text-onaccent">
              <I name={m.icon} size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-ink">{m.label}</span>
              <span className="block truncate text-[11.5px] text-muted">{m.hint}</span>
            </span>
            <I name="plus" size={15} className="ml-auto shrink-0 text-muted transition-colors group-hover:text-accent" />
          </button>
        ))}
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface/50 px-6 py-14 text-center">
          <I name="layout" size={34} className="mx-auto text-muted" />
          <p className="mt-3 font-display text-lg font-bold text-ink">Blank canvas</p>
          <p className="mx-auto mt-1 max-w-sm text-[13.5px] text-muted">
            Add blocks from the palette above, or load a template. Every block is independently configurable.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" onDragOver={(e) => e.preventDefault()}>
          {blocks.map((b, i) => {
            const meta = BLOCK_META.find((m) => m.type === b.type);
            const isConfig = configOpen === b.id;
            return (
              <div
                key={b.id}
                draggable
                onDragStart={(e) => {
                  setDragIdx(i);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDragIdx(null);
                  setOverIdx(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverIdx(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(i);
                }}
                className={cx(
                  "rounded-xl border bg-surface shadow-card transition-all",
                  b.size === "full" && "lg:col-span-2",
                  dragIdx === i ? "opacity-40" : "opacity-100",
                  overIdx === i && dragIdx !== null && dragIdx !== i ? "border-accent ring-2 ring-accent/40" : "border-line"
                )}
              >
                <div className="flex items-center gap-1.5 border-b border-line/70 px-3 py-2">
                  <span className="cursor-grab touch-none rounded p-1 text-muted hover:bg-surface2 hover:text-ink active:cursor-grabbing" title="Drag to reorder" aria-label="Drag to reorder block">
                    <I name="grip" size={15} />
                  </span>
                  <I name={meta?.icon ?? "layout"} size={14} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{b.title || autoTitle(b)}</span>
                  <IconButton label="Configure block" name="gear" size={15} onClick={() => setConfigOpen(isConfig ? null : b.id)} />
                  <IconButton label={b.size === "full" ? "Make half width" : "Make full width"} name="layout" size={15}
                    onClick={() => updateBlock(b.id, { size: b.size === "full" ? "half" : "full" })} />
                  <IconButton label="Move block up" name="chevU" size={15} disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton label="Move block down" name="chevD" size={15} disabled={i === blocks.length - 1} onClick={() => move(i, 1)} />
                  <IconButton label="Delete block" name="trash" size={15} className="hover:text-danger"
                    onClick={() => setBuilder({ blocks: blocks.filter((x) => x.id !== b.id) })} />
                </div>

                {isConfig && (
                  <div className="anim-rise grid gap-3 border-b border-line/70 bg-surface2/40 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-3">
                    <Select label="Metric" value={b.metric}
                      onChange={(e) => {
                        const metric = e.target.value as Metric;
                        const dims = dimsFor(metric);
                        updateBlock(b.id, { metric, dimension: dims.includes(b.dimension) ? b.dimension : dims[0] });
                      }}>
                      {METRIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                    <Select label="Group by" value={b.dimension} onChange={(e) => updateBlock(b.id, { dimension: e.target.value as Dimension })}>
                      {dimsFor(b.metric).map((d) => <option key={d} value={d}>{DIM_LABEL[d]}</option>)}
                    </Select>
                    <Select label="Range" value={b.range} onChange={(e) => updateBlock(b.id, { range: e.target.value as RangeKey })}>
                      {(Object.keys(RANGE_LABEL) as RangeKey[]).map((r) => <option key={r} value={r}>{RANGE_LABEL[r]}</option>)}
                    </Select>
                    {!isExpenseMetric(b.metric) && (
                      <Select label="Billable filter" value={b.billable} onChange={(e) => updateBlock(b.id, { billable: e.target.value as ReportBlock["billable"] })}>
                        <option value="all">All</option>
                        <option value="billable">Billable</option>
                        <option value="non">Non-billable</option>
                      </Select>
                    )}
                    <Select label="Project filter" value={b.projectId ?? ""} onChange={(e) => updateBlock(b.id, { projectId: e.target.value || null })}>
                      <option value="">All projects</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                    <Select label="Client filter" value={b.clientId ?? ""} onChange={(e) => updateBlock(b.id, { clientId: e.target.value || null })}>
                      <option value="">All clients</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                    {b.range === "custom" && (
                      <>
                        <Input label="From" type="date" value={b.from} onChange={(e) => updateBlock(b.id, { from: e.target.value })} />
                        <Input label="To" type="date" value={b.to} onChange={(e) => updateBlock(b.id, { to: e.target.value })} />
                      </>
                    )}
                  </div>
                )}

                <div className="px-4 py-4 sm:px-5">
                  <BlockBody block={b} ctx={ctx} weekStart={weekStart} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="flex items-center gap-2 font-mono text-[12px] text-muted">
        <I name="info" size={13} />
        Blocks compute live from your ledger. Drag cards (or use the arrows) to reorder — layout saves with the report.
      </p>
    </div>
  );
}

function BlockBody({ block, ctx, weekStart }: { block: ReportBlock; ctx: AggCtx; weekStart: 0 | 1 }) {
  /* Memoized per block — aggregation never re-runs on unrelated renders. */
  const rows = useMemo(() => computeRows(block, ctx, weekStart), [block, ctx, weekStart]);
  const fmt = useCallback((v: number) => formatMetricValue(v, block.metric, ctx.currency), [block.metric, ctx.currency]);
  const currency = ctx.currency;
  if (block.type === "stat") {
    const total = sumRows(rows, block.metric);
    const t = totalRow(rows);
    const billPct = t.minutes > 0 ? Math.round((t.billableMin / t.minutes) * 100) : null;
    return (
      <div className="flex h-full flex-col justify-center py-2">
        <p className="font-mono text-[34px] font-semibold tabular leading-none text-ink">{fmt(total)}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
          <span>{t.entryCount + t.expenseCount} items</span>
          {billPct !== null && block.metric !== "expenseAmount" && (
            <span className={cx("font-semibold", billPct >= 70 ? "text-ok" : billPct >= 40 ? "text-amber" : "text-danger")}>
              {billPct}% billable
            </span>
          )}
        </div>
      </div>
    );
  }
  if (block.type === "chart") {
    const timeLike = ["day", "week", "month"].includes(block.dimension);
    if (block.metric === "hours" && timeLike) {
      return (
        <StackedColumns
          data={rows.map((r) => ({ label: r.label, a: r.billableMin, b: r.nonBillableMin }))}
          aLabel="Billable"
          bLabel="Non-billable"
          height={block.size === "half" ? 130 : 168}
        />
      );
    }
    return (
      <Columns
        data={rows.map((r) => ({ label: r.label, value: metricNumber(r, block.metric), color: timeLike ? undefined : r.color }))}
        format={fmt}
        height={block.size === "half" ? 130 : 168}
        ariaLabel={block.title || autoTitle(block)}
      />
    );
  }
  if (block.type === "donut") {
    return <Donut data={rows.slice(0, 8).map((r) => ({ label: r.label, value: metricNumber(r, block.metric), color: r.color }))} centerLabel={METRIC_LABEL[block.metric]} format={fmt} />;
  }
  if (block.type === "hbar") {
    return <RankBars data={rows.slice(0, 7).map((r) => ({ label: r.label, value: metricNumber(r, block.metric), color: r.color }))} format={fmt} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-105 border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th className="py-2 pr-3 text-[11.5px] font-semibold uppercase tracking-wide text-muted" scope="col">{DIM_LABEL[block.dimension]}</th>
            <th className="py-2 pr-3 text-right text-[11.5px] font-semibold uppercase tracking-wide text-muted" scope="col">Items</th>
            <th className="py-2 pr-3 text-right text-[11.5px] font-semibold uppercase tracking-wide text-muted" scope="col">Hours</th>
            <th className="py-2 pr-3 text-right text-[11.5px] font-semibold uppercase tracking-wide text-muted" scope="col">Billable</th>
            <th className="py-2 text-right text-[11.5px] font-semibold uppercase tracking-wide text-muted" scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-line/60 last:border-0 hover:bg-surface2/40">
              <td className="max-w-44 truncate py-2 pr-3 text-[13px] font-medium text-ink">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className="truncate">{r.label}</span>
                </span>
              </td>
              <td className="py-2 pr-3 text-right font-mono text-[12.5px] tabular text-ink2">{r.entryCount + r.expenseCount}</td>
              <td className="py-2 pr-3 text-right font-mono text-[12.5px] tabular text-ink">{fmtH(r.minutes)}</td>
              <td className="py-2 pr-3 text-right font-mono text-[12.5px] tabular text-accent">{money(r.billableAmount, currency)}</td>
              <td className="py-2 text-right font-mono text-[12.5px] tabular text-ink">{money(r.billableAmount + r.expenseTotal, currency)}</td>
            </tr>
          ))}
          {rows.length > 0 &&
            (() => {
              const t = totalRow(rows);
              return (
                <tr className="bg-surface2/50">
                  <td className="py-2 pr-3 text-[12.5px] font-bold text-ink">Total</td>
                  <td className="py-2 pr-3 text-right font-mono text-[12.5px] font-bold tabular text-ink">{t.entryCount + t.expenseCount}</td>
                  <td className="py-2 pr-3 text-right font-mono text-[12.5px] font-bold tabular text-ink">{fmtH(t.minutes)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-[12.5px] font-bold tabular text-accent">{money(t.billableAmount, currency)}</td>
                  <td className="py-2 text-right font-mono text-[12.5px] font-bold tabular text-ink">{money(t.billableAmount + t.expenseTotal, currency)}</td>
                </tr>
              );
            })()}
        </tbody>
      </table>
    </div>
  );
}

void round2;
