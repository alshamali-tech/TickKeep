import { useEffect, useMemo, useState } from "react";
import { minutesSum, useStore } from "../lib/store";
import { I } from "../components/icons";
import { Button, EmptyState, IconButton, navigate } from "../components/ui";
import { cx, downloadFile, fmtDate, fmtHL, money, parseKey, toCSV, todayKey } from "../lib/utils";

const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export function ReviewPage() {
  const entries = useStore((s) => s.entries);
  const invoices = useStore((s) => s.invoices);
  const projects = useStore((s) => s.projects);
  const clients = useStore((s) => s.clients);

  const nowYear = new Date().getFullYear();
  const minYear = useMemo(() => {
    let m = nowYear;
    for (const e of entries) m = Math.min(m, parseInt(e.date.slice(0, 4), 10));
    for (const i of invoices) m = Math.min(m, parseInt(i.issueDate.slice(0, 4), 10));
    return m;
  }, [entries, invoices, nowYear]);

  const [year, setYear] = useState(nowYear);

  const yearEntries = useMemo(() => entries.filter((e) => e.date.startsWith(String(year))), [entries, year]);
  const yearInvoices = useMemo(
    () => invoices.filter((i) => i.issueDate.startsWith(String(year)) && i.status !== "void"),
    [invoices, year]
  );

  const stats = useMemo(() => {
    const totalMin = minutesSum(yearEntries);
    const billableMin = minutesSum(yearEntries.filter((e) => e.billable));
    const billableAmt = yearEntries.reduce((s, e) => s + (e.billable ? (e.durationMin / 60) * e.rate : 0), 0);

    const months = MONTH_LETTERS.map((_, mi) => {
      const prefix = `${year}-${String(mi + 1).padStart(2, "0")}`;
      const list = yearEntries.filter((e) => e.date.startsWith(prefix));
      return {
        min: minutesSum(list),
        amt: list.reduce((s, e) => s + (e.billable ? (e.durationMin / 60) * e.rate : 0), 0),
      };
    });

    const dow = DOW.map(() => 0);
    for (const e of yearEntries) {
      const idx = (parseKey(e.date).getDay() + 6) % 7;
      dow[idx] += e.durationMin;
    }

    const byDay = new Map<string, number>();
    for (const e of yearEntries) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.durationMin);
    let busiest: { date: string; min: number } | null = null;
    for (const [date, min] of byDay) if (!busiest || min > busiest.min) busiest = { date, min };

    const days = [...byDay.keys()].sort();
    let best = 0;
    let run = 0;
    let prev: Date | null = null;
    for (const d of days) {
      const cur = parseKey(d);
      run = prev && cur.getTime() - prev.getTime() === 86400000 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = cur;
    }

    const projClient = new Map<string, string>();
    for (const p of projects) if (p.clientId) projClient.set(p.id, p.clientId);
    const clientAgg = new Map<string, { min: number; amt: number }>();
    for (const e of yearEntries) {
      const cid = e.projectId ? projClient.get(e.projectId) : undefined;
      if (!cid) continue;
      const cur = clientAgg.get(cid) ?? { min: 0, amt: 0 };
      cur.min += e.durationMin;
      if (e.billable) cur.amt += (e.durationMin / 60) * e.rate;
      clientAgg.set(cid, cur);
    }
    const topClients = [...clientAgg.entries()]
      .map(([id, v]) => ({ id, name: clients.find((c) => c.id === id)?.name ?? "Unknown client", ...v }))
      .sort((a, b) => b.amt - a.amt)
      .slice(0, 3);

    const activeDays = byDay.size;
    return {
      totalMin,
      billableMin,
      billableAmt,
      months,
      dow,
      busiest,
      bestStreak: best,
      topClients,
      activeDays,
      avgDay: activeDays ? totalMin / activeDays : 0,
      firstDay: days[0] ?? null,
      entryCount: yearEntries.length,
      invoiceCount: yearInvoices.length,
      invoicedTotal: yearInvoices.reduce(
        (s, i) => s + i.items.reduce((a, it) => a + it.amount, 0) * (1 + i.taxRate / 100) - i.discount,
        0
      ),
      collected: yearInvoices.reduce((s, i) => s + (i.payments ?? []).reduce((a, p) => a + p.amount, 0), 0),
    };
  }, [yearEntries, yearInvoices, projects, clients, year]);

  const hours = useCountUp(stats.totalMin / 60);

  if (entries.length === 0 && invoices.length === 0) {
    return (
      <EmptyState icon="award" title="No history to celebrate yet" desc="Track a few hours and this page turns into your year in numbers.">
        <Button icon="play" onClick={() => navigate("#/app/timer")}>Open the timer</Button>
      </EmptyState>
    );
  }

  const maxMonth = Math.max(1, ...stats.months.map((m) => m.min));
  const bestMonth = stats.months.findIndex((m) => m.min === maxMonth);
  const maxDow = Math.max(1, ...stats.dow);
  const topDow = stats.dow.findIndex((d) => d === maxDow);

  const exportYearCsv = () => {
    const rows = yearEntries
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => [
        e.date,
        projects.find((p) => p.id === e.projectId)?.name ?? "",
        e.description,
        Math.round((e.durationMin / 60) * 100) / 100,
        e.billable ? "Yes" : "No",
        e.billable ? Math.round((e.durationMin / 60) * e.rate * 100) / 100 : 0,
      ]);
    downloadFile(`timevault-year-${year}.csv`, toCSV([["Date", "Project", "Description", "Hours", "Billable", "Amount"], ...rows]), "text/csv");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <IconButton label="Previous year" name="chevL" disabled={year <= minYear} onClick={() => setYear((y) => Math.max(minYear, y - 1))} />
          <h2 className="font-display text-3xl font-extrabold tabular tracking-tight text-ink">{year}</h2>
          <IconButton label="Next year" name="chevR" disabled={year >= nowYear} onClick={() => setYear((y) => Math.min(nowYear, y + 1))} />
        </div>
        <Button variant="outline" size="sm" icon="download" onClick={exportYearCsv} disabled={yearEntries.length === 0}>
          Export year CSV
        </Button>
      </div>

      {yearEntries.length === 0 ? (
        <EmptyState icon="cal" title={`Nothing tracked in ${year}`} desc="This year is a blank page in the ledger.">
          {year !== nowYear && <Button variant="outline" onClick={() => setYear(nowYear)}>Back to {nowYear}</Button>}
        </EmptyState>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-9">
            <div className="bg-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:linear-gradient(to_right,black,transparent_65%)]" aria-hidden="true" />
            <div className="glow-amber pointer-events-none absolute -right-20 -top-24 h-72 w-72" aria-hidden="true" />
            <div className="relative flex flex-wrap items-center justify-between gap-8">
              <div>
                <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-accent">Your year on the clock</p>
                <p className="mt-3 font-mono text-[64px] font-semibold tabular leading-none tracking-tight text-ink sm:text-[92px]">
                  {hours.toFixed(0)}<span className="text-[0.42em] text-muted"> h</span>
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <span className="rounded-full bg-accent/10 px-3 py-1 font-mono text-[12.5px] font-bold tabular text-accent">
                    {stats.totalMin > 0 ? Math.round((stats.billableMin / stats.totalMin) * 100) : 0}% billable
                  </span>
                  <span className="rounded-full bg-surface2 px-3 py-1 font-mono text-[12.5px] font-semibold tabular text-ink2">
                    {money(stats.billableAmt)} earned
                  </span>
                  <span className="rounded-full bg-surface2 px-3 py-1 font-mono text-[12.5px] font-semibold tabular text-ink2">
                    {stats.activeDays} active days
                  </span>
                </div>
              </div>
              {stats.busiest && (
                <div className="-rotate-2 rounded-xl border-2 border-dashed border-amber/60 bg-amber/8 px-6 py-5 text-center shadow-card transition-transform hover:rotate-0">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-amber">Busiest day</p>
                  <p className="mt-1.5 font-mono text-3xl font-semibold tabular text-ink">{fmtHL(stats.busiest.min)}</p>
                  <p className="mt-1 text-[12.5px] font-medium text-ink2">{fmtDate(stats.busiest.date)}</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
              <div className="mb-5 flex items-baseline justify-between">
                <h3 className="font-display text-[16px] font-bold text-ink">Monthly rhythm</h3>
                <span className="font-mono text-[11.5px] text-muted">hours per month</span>
              </div>
              <div className="flex h-40 items-end gap-1.5 sm:gap-2.5">
                {stats.months.map((m, i) => {
                  const h = m.min === 0 ? 3 : Math.max(6, (m.min / maxMonth) * 152);
                  const isBest = i === bestMonth && m.min > 0;
                  const future = `${year}-${String(i + 1).padStart(2, "0")}` > todayKey().slice(0, 7);
                  return (
                    <div key={i} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                      <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-[10.5px] font-semibold tabular whitespace-nowrap text-ink opacity-0 shadow-pop transition-opacity group-hover:opacity-100">
                        {fmtHL(m.min)}
                      </span>
                      <div
                        className={cx(
                          "anim-bar w-full rounded-t-[4px] transition-colors",
                          future ? "bg-line/40" : isBest ? "bg-amber" : "bg-accent/80 group-hover:bg-accent"
                        )}
                        style={{ height: h, animationDelay: `${i * 40}ms` }}
                      />
                      <span className={cx("mt-2 font-mono text-[10.5px] font-semibold", isBest ? "text-amber" : "text-muted")}>{MONTH_LETTERS[i]}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
              <div className="mb-5 flex items-baseline justify-between">
                <h3 className="font-display text-[16px] font-bold text-ink">Weekday profile</h3>
                <span className="font-mono text-[11.5px] text-muted">peak: {DOW[topDow]}</span>
              </div>
              <div className="flex h-40 items-end gap-2">
                {stats.dow.map((min, i) => {
                  const h = min === 0 ? 3 : Math.max(6, (min / maxDow) * 140);
                  return (
                    <div key={i} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                      <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-[10.5px] font-semibold tabular whitespace-nowrap text-ink opacity-0 shadow-pop transition-opacity group-hover:opacity-100">
                        {fmtHL(min)}
                      </span>
                      <div
                        className={cx("anim-bar w-full rounded-t-[4px] transition-colors", i === topDow && min > 0 ? "bg-amber" : "bg-line group-hover:bg-muted/60")}
                        style={{ height: h, animationDelay: `${i * 50}ms` }}
                      />
                      <span className="mt-2 font-mono text-[10px] font-semibold text-muted">{DOW[i][0]}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6">
              <h3 className="font-display text-[16px] font-bold text-ink">Clients who kept you busy</h3>
              <p className="mt-0.5 text-[12.5px] text-muted">Ranked by billable value this year</p>
              {stats.topClients.length === 0 ? (
                <p className="mt-6 rounded-lg bg-surface2/60 px-4 py-4 text-[13px] text-muted">
                  No client-linked time this year — link projects to clients to see the podium.
                </p>
              ) : (
                <ul className="mt-5 space-y-3">
                  {stats.topClients.map((c, rank) => (
                    <li
                      key={c.id}
                      className={cx(
                        "anim-rise flex items-center gap-4 rounded-xl border px-4 py-3.5 transition-all hover:-translate-y-px hover:shadow-card",
                        rank === 0 ? "border-amber/50 bg-amber/8" : "border-line bg-bg"
                      )}
                      style={{ animationDelay: `${rank * 90}ms` }}
                    >
                      <span className={cx(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-[15px] font-extrabold",
                        rank === 0 ? "bg-amber text-onamber" : "bg-surface2 text-ink2"
                      )}>
                        {rank + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-bold text-ink">{c.name}</p>
                        <p className="font-mono text-[11.5px] tabular text-muted">{fmtHL(c.min)} tracked</p>
                      </div>
                      <span className="font-mono text-[16px] font-semibold tabular text-accent">{money(c.amt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6">
              <h3 className="font-display text-[16px] font-bold text-ink">The year, itemized</h3>
              <dl className="mt-4">
                {[
                  ["First punch-in", stats.firstDay ? fmtDate(stats.firstDay) : "—"],
                  ["Entries logged", String(stats.entryCount)],
                  ["Average tracked day", fmtHL(stats.avgDay)],
                  ["Longest streak", `${stats.bestStreak} ${stats.bestStreak === 1 ? "day" : "days"}`],
                  ["Invoices issued", String(stats.invoiceCount)],
                  ["Invoiced", money(stats.invoicedTotal)],
                  ["Collected", money(stats.collected)],
                ].map(([k, v]) => (
                  <div key={k} className="rule-dash flex items-baseline justify-between gap-4 py-2.5">
                    <dt className="text-[13px] text-ink2">{k}</dt>
                    <dd className="font-mono text-[13.5px] font-semibold tabular text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
                <I name="award" size={13} className="text-amber" /> TimeVault · time capsule {year}
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
