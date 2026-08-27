import { useMemo, useState } from "react";
import { billedEntryIds, billableAmount, entryAmount, minutesSum, useStore, type Goals, type Invoice } from "../lib/store";
import { I } from "../components/icons";
import { Badge, Button, Card, EmptyState, ProgressBar, useNow, useToast, navigate } from "../components/ui";
import { ActivityHeatmap, StreakChip } from "../components/charts";
import { addDays, cx, fmtDayLong, fmtH, fmtHL, lastNDays, money, rangeKeys, toKey, todayKey } from "../lib/utils";
import { EntryFormModal } from "./timer";

export function DashboardPage() {
  const entries = useStore((s) => s.entries);
  const projects = useStore((s) => s.projects);
  const invoices = useStore((s) => s.invoices);
  const activeTimer = useStore((s) => s.activeTimer);
  const stopTimer = useStore((s) => s.stopTimer);
  const loadSample = useStore((s) => s.loadSample);
  const goals = useStore((s) => s.goals);
  const { push } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const now = useNow(activeTimer ? 1000 : 60000);

  const isEmpty = entries.length === 0 && projects.length === 0;

  const today = todayKey();
  const todayEntries = useMemo(() => entries.filter((e) => e.date === today), [entries, today]);
  const weekKeys = useMemo(() => lastNDays(7), []);
  const weekEntries = useMemo(() => {
    const set = new Set(weekKeys);
    return entries.filter((e) => set.has(e.date));
  }, [entries, weekKeys]);

  const billed = useMemo(() => billedEntryIds(invoices), [invoices]);
  const outstanding = useMemo(
    () => billableAmount(entries.filter((e) => !billed.has(e.id))),
    [entries, billed]
  );
  const openInvoices = invoices.filter((i) => i.status === "draft" || i.status === "sent");
  const overdue = invoices.filter((i) => i.status === "sent" && i.dueDate < today);

  const weekByDay = weekKeys.map((k) => minutesSum(entries.filter((e) => e.date === k)));
  const maxDay = Math.max(1, ...weekByDay);

  const yesterdayMin = useMemo(() => {
    const y = toKey(addDays(new Date(), -1));
    return minutesSum(entries.filter((e) => e.date === y));
  }, [entries]);
  const lastWeekMin = useMemo(() => {
    const keys = new Set(rangeKeys(addDays(new Date(), -13), addDays(new Date(), -7)));
    return minutesSum(entries.filter((e) => keys.has(e.date)));
  }, [entries]);

  const todayMin = minutesSum(todayEntries);
  const weekMin = minutesSum(weekEntries);
  const pctDelta = (cur: number, prev: number): number | null => {
    if (prev <= 0) return cur > 0 ? 100 : null;
    return ((cur - prev) / prev) * 100;
  };

  const budgetAlerts = useMemo(() => {
    const monthPrefix = today.slice(0, 7);
    return projects
      .filter((p) => p.active && p.budgetHours && p.budgetHours > 0)
      .map((p) => {
        const used = minutesSum(entries.filter((e) => e.projectId === p.id && e.date.startsWith(monthPrefix)));
        return { project: p, used, budget: (p.budgetHours as number) * 60 };
      })
      .filter((x) => x.used / x.budget >= 0.75)
      .sort((a, b) => b.used / b.budget - a.used / a.budget);
  }, [projects, entries, today]);

  const recent = useMemo(
    () => entries.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    [entries]
  );

  if (isEmpty) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="px-6 py-12 text-center sm:px-12">
          <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <I name="timer" size={30} />
          </span>
          <h2 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">Your ledger is brand new.</h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-ink2">
            Add a client, name a project, punch in — and TimeVault will keep the hours, budgets and
            invoices straight. Everything stays in this browser.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
            <Button
              size="lg"
              icon="box"
              onClick={() => {
                loadSample();
                push({ kind: "ok", title: "Sample data loaded", desc: "Two clients, four projects, two weeks of entries." });
              }}
            >
              Load sample data
            </Button>
            <Button variant="outline" size="lg" icon="play" onClick={() => navigate("#/app/timer")}>
              Open the timer
            </Button>
          </div>
          <p className="mt-6 inline-flex items-center gap-2 font-mono text-[12px] text-muted">
            <I name="shield" size={13} /> No account. No cloud. Nothing leaves this device.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.15em] text-muted">{fmtDayLong(new Date())}</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-ink sm:text-[28px]">
            {greeting()}, timekeeper.
          </h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon="plus" onClick={() => setFormOpen(true)}>
            New entry
          </Button>
          <Button icon="invoice" onClick={() => navigate("#/app/invoices")}>
            New invoice
          </Button>
        </div>
      </div>

      <SetupChecklist />
      {todayMin === 0 && !activeTimer && <NudgeBanner />}

      {activeTimer ? (
        <RunningTimerStrip
          elapsedMin={(now - activeTimer.startedAt) / 60000}
          onStop={() => {
            const e = stopTimer();
            if (e) push({ kind: "ok", title: `Saved ${fmtHL(e.durationMin)}`, action: { label: "Undo", onClick: () => useStore.getState().deleteEntry(e.id) } });
          }}
        />
      ) : (
        <button
          onClick={() => navigate("#/app/timer")}
          className="group flex w-full items-center gap-4 rounded-xl border border-dashed border-line bg-surface/60 px-5 py-4 text-left transition-colors hover:border-accent/60 hover:bg-accent/5"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface2 text-ink2 transition-colors group-hover:bg-accent group-hover:text-onaccent">
            <I name="play" size={17} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">The clock is out.</span>
            <span className="block text-[13px] text-muted">Punch in — the timer keeps running even if you close the tab.</span>
          </span>
          <I name="chevR" size={17} className="ml-auto shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
        </button>
      )}

      {/* stat tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Tracked today"
          value={fmtHL(todayMin)}
          sub={`${todayEntries.length} ${todayEntries.length === 1 ? "entry" : "entries"} · ${money(billableAmount(todayEntries))}`}
          icon="clock"
          delta={pctDelta(todayMin, yesterdayMin)}
          deltaLabel="vs yesterday"
        />
        <StatTile
          label="This week"
          value={fmtHL(weekMin)}
          sub={`${money(billableAmount(weekEntries))} billable`}
          icon="cal"
          delta={pctDelta(weekMin, lastWeekMin)}
          deltaLabel="vs last week"
        >
          <svg viewBox="0 0 112 30" className="mt-2 h-8 w-full" aria-hidden="true">
            {weekByDay.map((m, i) => {
              const h = m === 0 ? 2 : Math.max(4, (m / maxDay) * 28);
              return (
                <rect
                  key={i}
                  x={i * 16 + 2}
                  y={30 - h}
                  width="11"
                  height={h}
                  rx="2"
                  fill={i === 6 ? "var(--tv-accent)" : "var(--tv-line)"}
                />
              );
            })}
          </svg>
        </StatTile>
        <StatTile label="Unbilled & billable" value={money(outstanding)} sub="waiting on an invoice" icon="wallet" accent />
        <div className="rounded-xl border border-line bg-surface p-4.5 shadow-card sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-muted">Open invoices</p>
            <I name="invoice" size={16} className="text-muted" />
          </div>
          <p className="mt-1.5 font-mono text-[26px] font-semibold tabular leading-none text-ink">{openInvoices.length}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {overdue.length > 0 && <Badge tone="red">{overdue.length} overdue</Badge>}
            <button onClick={() => navigate("#/app/invoices")} className="text-[13px] font-semibold text-accent transition-colors hover:underline">
              Review →
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GoalsCard dailyUsed={todayMin} weeklyUsed={weekMin} goals={goals} />
        <AgingCard invoices={invoices} />
      </div>

      {entries.length > 0 && (
        <section aria-label="Activity heatmap" className="rounded-xl border border-line bg-surface p-4.5 shadow-card sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-[15px] font-bold text-ink">Consistency</h3>
              <p className="text-[12.5px] text-muted">Every hour tracked, last 20 weeks</p>
            </div>
            <StreakChip entries={entries} />
          </div>
          <ActivityHeatmap entries={entries} />
        </section>
      )}

      {budgetAlerts.length > 0 && (
        <section aria-label="Budget alerts" className="space-y-2.5">
          {budgetAlerts.map(({ project, used, budget }) => {
            const ratio = used / budget;
            return (
              <button
                key={project.id}
                onClick={() => navigate(`#/app/projects/${project.id}`)}
                className={cx(
                  "flex w-full items-center gap-4 rounded-xl border px-4.5 py-3.5 text-left shadow-card transition-all hover:-translate-y-px",
                  ratio >= 1 ? "border-danger/40 bg-danger/5" : "border-amber/40 bg-amber/8"
                )}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: project.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{project.name}</span>
                  <ProgressBar value={ratio} tone={ratio >= 1 ? "danger" : "amber"} label={`${project.name} budget`} />
                </span>
                <span className={cx("shrink-0 font-mono text-[13px] font-semibold tabular", ratio >= 1 ? "text-danger" : "text-amber")}>
                  {fmtHL(used)} / {fmtHL(budget)}
                </span>
                <I name="chevR" size={15} className="shrink-0 text-muted" />
              </button>
            );
          })}
        </section>
      )}

      <section aria-label="Recent entries">
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-ink">Recent entries</h3>
          <Button variant="ghost" size="sm" onClick={() => navigate("#/app/entries")}>
            View all <I name="chevR" size={14} />
          </Button>
        </div>
        {recent.length === 0 ? (
          <EmptyState icon="clock" title="No entries yet" desc="Punch in on the timer page to start the ledger." />
        ) : (
          <ul className="divide-y divide-line/70 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            {recent.map((e) => {
              const project = projects.find((p) => p.id === e.projectId);
              return (
                <li key={e.id} className="flex items-center gap-3 px-4.5 py-3 transition-colors hover:bg-surface2/50">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: project?.color ?? "var(--tv-line)" }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{e.description || "Untitled entry"}</p>
                    <p className="text-[12.5px] text-muted">
                      {project?.name ?? "No project"} · {e.date === todayKey() ? "Today" : e.date}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular text-ink">{fmtH(e.durationMin)}</span>
                  {e.billable && (
                    <span className="hidden font-mono text-[13px] font-medium tabular text-accent sm:block">
                      {money(entryAmount(e))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <EntryFormModal open={formOpen} onClose={() => setFormOpen(false)} entry={null} />
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function DeltaPill({ delta, label }: { delta: number | null; label: string }) {
  if (delta === null) return null;
  const up = delta >= 0;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10.5px] font-bold tabular",
        up ? "bg-ok/12 text-ok" : "bg-danger/12 text-danger"
      )}
      title={label}
    >
      <svg width="8" height="9" viewBox="0 0 8 9" aria-hidden="true" className={up ? "" : "rotate-180"}>
        <path d="M4 0l4 5H0z" fill="currentColor" />
      </svg>
      {Math.abs(Math.round(delta))}%
    </span>
  );
}

function StatTile({
  label, value, sub, icon, accent, delta, deltaLabel, children,
}: {
  label: string;
  value: string;
  sub: string;
  icon: "clock" | "cal" | "wallet";
  accent?: boolean;
  delta?: number | null;
  deltaLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4.5 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        <I name={icon} size={16} className={accent ? "text-accent" : "text-muted"} />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <p className={cx("font-mono text-[26px] font-semibold tabular leading-none", accent ? "text-accent" : "text-ink")}>
          {value}
        </p>
        {delta !== undefined && <DeltaPill delta={delta} label={deltaLabel ?? ""} />}
      </div>
      <p className="mt-1.5 truncate text-[12.5px] text-muted">{sub}</p>
      {children}
    </div>
  );
}

function RunningTimerStrip({ elapsedMin, onStop }: { elapsedMin: number; onStop: () => void }) {
  const activeTimer = useStore((s) => s.activeTimer);
  const projects = useStore((s) => s.projects);
  const project = projects.find((p) => p.id === activeTimer?.projectId);
  return (
    <div className="relative overflow-hidden rounded-xl border border-amber/50 bg-amber/10 px-5 py-4">
      <div className="glow-amber pointer-events-none absolute -right-16 -top-16 h-52 w-52" aria-hidden="true" />
      <div className="relative flex flex-wrap items-center gap-4">
        <span className="pulse-dot h-2.5 w-2.5 shrink-0 rounded-full bg-amber" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xl font-semibold tabular leading-tight text-ink">{fmtH(elapsedMin)}</p>
          <p className="truncate text-[13px] text-ink2">
            {project?.name ?? "No project"}
            {activeTimer?.description ? ` — ${activeTimer.description}` : ""}
          </p>
        </div>
        <Button variant="amber" icon="stop" onClick={onStop}>
          Punch out
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigate("#/app/timer")}>
          Open timer
        </Button>
      </div>
    </div>
  );
}

function GoalsCard({
  dailyUsed,
  weeklyUsed,
  goals,
}: {
  dailyUsed: number;
  weeklyUsed: number;
  goals: Goals;
}) {
  const hasGoals = goals.dailyMin > 0 || goals.weeklyMin > 0;
  return (
    <section className="rounded-xl border border-line bg-surface p-4.5 shadow-card sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-[15px] font-bold text-ink">Goals</h3>
        <Button variant="ghost" size="sm" onClick={() => navigate("#/app/settings")}>
          Adjust
        </Button>
      </div>
      {!hasGoals ? (
        <p className="text-[13px] leading-relaxed text-muted">
          Set a daily or weekly target in Settings and this card starts keeping score.
        </p>
      ) : (
        <div className="space-y-4">
          {goals.dailyMin > 0 && (
            <GoalMeter label="Today" used={dailyUsed} target={goals.dailyMin} />
          )}
          {goals.weeklyMin > 0 && (
            <GoalMeter label="This week" used={weeklyUsed} target={goals.weeklyMin} />
          )}
        </div>
      )}
    </section>
  );
}

function GoalMeter({ label, used, target }: { label: string; used: number; target: number }) {
  const ratio = target > 0 ? used / target : 0;
  const done = ratio >= 1;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink2">{label}</span>
        <span className={cx("font-mono text-[12.5px] font-semibold tabular", done ? "text-ok" : "text-ink")}>
          {fmtHL(used)} / {fmtHL(target)}
        </span>
      </div>
      <ProgressBar value={ratio} tone={done ? "accent" : ratio > 0.75 ? "amber" : "accent"} label={`${label} goal`} />
      {done && <p className="mt-1 font-mono text-[10.5px] font-bold uppercase tracking-wide text-ok">goal met 🎯</p>}
    </div>
  );
}

function AgingCard({ invoices }: { invoices: Invoice[] }) {
  const open = invoices.filter((i) => i.status === "sent");
  const today = todayKey();
  const buckets: Array<{ label: string; days: [number, number]; cls: string }> = [
    { label: "Current", days: [0, 0], cls: "bg-ok" },
    { label: "1–30", days: [1, 30], cls: "bg-accent" },
    { label: "31–60", days: [31, 60], cls: "bg-amber" },
    { label: "61–90", days: [61, 90], cls: "bg-amber" },
    { label: "90+", days: [91, 100000], cls: "bg-danger" },
  ];
  const amounts = buckets.map((b) =>
    open.reduce((s, inv) => {
      const late = inv.dueDate < today ? Math.max(0, Math.round((Date.parse(today) - Date.parse(inv.dueDate)) / 86400000)) : 0;
      const inBucket =
        b.label === "Current" ? inv.dueDate >= today : late >= b.days[0] && late <= b.days[1];
      if (!inBucket) return s;
      const total = inv.items.reduce((a, it) => a + it.amount, 0) * (1 + inv.taxRate / 100) - inv.discount;
      const paid = (inv.payments ?? []).reduce((a, p) => a + p.amount, 0);
      return s + Math.max(0, total - paid);
    }, 0)
  );
  const grand = amounts.reduce((s, a) => s + a, 0);
  const cur = open.length > 0 ? open[0].currency : "USD";

  return (
    <section className="rounded-xl border border-line bg-surface p-4.5 shadow-card sm:p-5 lg:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-[15px] font-bold text-ink">Receivables aging</h3>
        <span className="font-mono text-[12.5px] font-semibold tabular text-ink">{money(grand, cur)} out</span>
      </div>
      {open.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-muted">
          No sent invoices waiting on payment. When there are, you'll see how late each bucket runs.
        </p>
      ) : (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface2" role="img" aria-label="Aging distribution">
            {amounts.map((a, i) =>
              a > 0 ? (
                <div key={i} className={cx("h-full", buckets[i].cls)} style={{ width: `${(a / Math.max(1, grand)) * 100}%` }} />
              ) : null
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {buckets.map((b, i) => (
              <div key={b.label} className="rounded-lg bg-surface2/60 px-2.5 py-2">
                <p className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-wide text-muted">
                  <span className={cx("h-2 w-2 rounded-sm", b.cls)} /> {b.label}
                </p>
                <p className="mt-0.5 truncate font-mono text-[13px] font-semibold tabular text-ink">{money(amounts[i], cur)}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* ---------------- nudge + setup checklist ---------------- */

function NudgeBanner() {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("tv-nudge-dismissed") === todayKey());
  if (dismissed) return null;
  return (
    <div className="anim-rise relative flex items-center gap-4 overflow-hidden rounded-xl border border-accent/40 bg-accent/8 px-5 py-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-12 -top-16 h-44 w-44 rounded-full"
        style={{ background: "radial-gradient(closest-side, color-mix(in srgb, var(--tv-accent) 18%, transparent), transparent 70%)" }}
      />
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-onaccent">
        <I name="timer" size={19} />
      </span>
      <div className="relative min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">Nothing on the clock yet today.</p>
        <p className="truncate text-[12.5px] text-ink2">Your future self will thank you for the honest ledger.</p>
      </div>
      <Button size="sm" icon="play" onClick={() => navigate("#/app/timer")}>Punch in</Button>
      <button
        aria-label="Dismiss nudge for today"
        onClick={() => {
          sessionStorage.setItem("tv-nudge-dismissed", todayKey());
          setDismissed(true);
        }}
        className="relative rounded-md p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-ink"
      >
        <I name="x" size={15} />
      </button>
    </div>
  );
}

const SETUP_DISMISS_KEY = "tv-setup-dismissed";

function SetupChecklist() {
  const business = useStore((s) => s.business);
  const clients = useStore((s) => s.clients);
  const projects = useStore((s) => s.projects);
  const entries = useStore((s) => s.entries);
  const invoices = useStore((s) => s.invoices);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(SETUP_DISMISS_KEY) === "1");

  const steps = [
    { label: "Fill in your business profile", done: business.name.trim().length > 0, to: "#/app/settings" },
    { label: "Add your first client", done: clients.length > 0, to: "#/app/clients" },
    { label: "Create a project", done: projects.length > 0, to: "#/app/projects" },
    { label: "Track your first hour", done: entries.length > 0, to: "#/app/timer" },
    { label: "Send your first invoice", done: invoices.length > 0, to: "#/app/invoices" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const complete = doneCount === steps.length;
  if (dismissed || complete) return null;

  return (
    <section aria-label="Setup checklist" className="anim-rise rounded-xl border border-line bg-surface p-4.5 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-[15px] font-bold text-ink">Get set up</h3>
          <p className="text-[12.5px] text-muted">{doneCount} of {steps.length} done — five minutes to a working studio.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface2">
            <div className="anim-grow h-full rounded-full bg-accent" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <button
            aria-label="Dismiss setup checklist"
            onClick={() => {
              localStorage.setItem(SETUP_DISMISS_KEY, "1");
              setDismissed(true);
            }}
            className="rounded-md p-1 text-muted transition-colors hover:bg-surface2 hover:text-ink"
          >
            <I name="x" size={14} />
          </button>
        </div>
      </div>
      <ul className="mt-3.5 grid gap-1.5 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.label}>
            <button
              onClick={() => navigate(s.to)}
              className={cx(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium transition-all hover:bg-surface2",
                s.done ? "text-muted line-through decoration-ok/60" : "text-ink"
              )}
            >
              <span
                className={cx(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  s.done ? "border-ok bg-ok text-white" : "border-line"
                )}
              >
                {s.done && <I name="check" size={11} />}
              </span>
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              {!s.done && <I name="chevR" size={13} className="text-muted" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
