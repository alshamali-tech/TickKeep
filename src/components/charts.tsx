import { useMemo, useState, type ReactNode } from "react";
import type { TimeEntry } from "../lib/store";
import { cx, fmtHL, lastNDays, parseKey, toKey } from "../lib/utils";

/* Hand-rolled, theme-native, motion-aware chart kit. */

/* ---------------- stacked columns (billable vs non-billable) ---------------- */

export interface StackDatum {
  label: string;
  a: number;
  b: number;
}

export function StackedColumns({
  data,
  aLabel,
  bLabel,
  format = (v) => fmtHL(v),
  height = 168,
}: {
  data: StackDatum[];
  aLabel: string;
  bLabel: string;
  format?: (v: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.a + d.b));
  const labelEvery = data.length > 16 ? 5 : data.length > 8 ? 2 : 1;

  if (data.length === 0) {
    return <p className="py-8 text-center text-[13px] text-muted">No data in this range.</p>;
  }

  return (
    <div>
      <div className="relative">
        {hover !== null && data[hover] && (
          <div
            role="status"
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-pop"
            style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
          >
            <p className="font-semibold text-ink">{data[hover].label}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-ink2">
              <span className="h-2 w-2 rounded-sm bg-accent" /> {aLabel}:{" "}
              <span className="font-mono font-semibold tabular text-ink">{format(data[hover].a)}</span>
            </p>
            <p className="flex items-center gap-1.5 text-ink2">
              <span className="h-2 w-2 rounded-sm bg-line" /> {bLabel}:{" "}
              <span className="font-mono font-semibold tabular text-ink">{format(data[hover].b)}</span>
            </p>
          </div>
        )}
        <div className="flex items-end gap-[3px]" style={{ height }} onMouseLeave={() => setHover(null)}>
          {data.map((d, i) => {
            const total = d.a + d.b;
            return (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                aria-label={`${d.label}: ${aLabel} ${format(d.a)}, ${bLabel} ${format(d.b)}`}
                className={cx(
                  "group relative flex min-w-0 flex-1 cursor-pointer flex-col justify-end rounded-t-[3px] transition-opacity",
                  hover !== null && hover !== i && "opacity-45"
                )}
                style={{ height: "100%" }}
              >
                <span
                  className="anim-bar block w-full rounded-t-[3px] bg-line"
                  style={{ height: `${(d.b / max) * 100}%`, animationDelay: `${i * 12}ms` }}
                />
                <span
                  className={cx("anim-bar block w-full bg-accent", d.b === 0 && "rounded-t-[3px]")}
                  style={{ height: `${(d.a / max) * 100}%`, animationDelay: `${i * 12}ms` }}
                />
                {total === 0 && <span className="block h-[3px] w-full rounded bg-line/60" />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {data.map((d, i) => (
          <span key={i} className="min-w-0 flex-1 truncate text-center font-mono text-[10px] text-muted">
            {i % labelEvery === 0 ? d.label : ""}
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-4 text-[12px] text-ink2">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent" /> {aLabel}</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-line" /> {bLabel}</span>
      </div>
    </div>
  );
}

/* ---------------- single-metric columns ---------------- */

export function Columns({
  data,
  color = "var(--tv-accent)",
  format,
  height = 140,
  ariaLabel,
}: {
  data: Array<{ label: string; value: number; color?: string }>;
  color?: string;
  format: (v: number) => string;
  height?: number;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1e-9, ...data.map((d) => d.value));
  const labelEvery = data.length > 16 ? 5 : data.length > 8 ? 2 : 1;
  if (data.length === 0) return <p className="py-8 text-center text-[13px] text-muted">No data in this range.</p>;

  return (
    <div>
      <div className="relative">
        {hover !== null && data[hover] && (
          <div
            role="status"
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-pop"
            style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
          >
            <span className="font-semibold text-ink">{data[hover].label}</span>{" "}
            <span className="font-mono font-semibold tabular text-ink">{format(data[hover].value)}</span>
          </div>
        )}
        <div className="flex items-end gap-[3px]" style={{ height }} onMouseLeave={() => setHover(null)}>
          {data.map((d, i) => (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              aria-label={`${ariaLabel} — ${d.label}: ${format(d.value)}`}
              className={cx(
                "flex min-w-0 flex-1 cursor-pointer items-end self-stretch rounded-t-[3px] transition-opacity",
                hover !== null && hover !== i && "opacity-45"
              )}
            >
              <span
                className="anim-bar block w-full rounded-t-[3px]"
                style={{
                  height: `${Math.max(1.5, (d.value / max) * 100)}%`,
                  background: d.value === 0 ? "var(--tv-line)" : d.color ?? color,
                  animationDelay: `${i * 14}ms`,
                }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {data.map((d, i) => (
          <span key={i} className="min-w-0 flex-1 truncate text-center font-mono text-[10px] text-muted">
            {i % labelEvery === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------- donut ---------------- */

export function Donut({
  data,
  centerLabel,
  format,
}: {
  data: Array<{ label: string; value: number; color: string }>;
  centerLabel: string;
  format: (v: number) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const [hover, setHover] = useState<number | null>(null);

  if (total <= 0 || data.length === 0) {
    return <p className="py-8 text-center text-[13px] text-muted">No data in this range.</p>;
  }

  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const active = hover !== null ? data[hover] : null;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative shrink-0">
        <svg width="132" height="132" viewBox="0 0 110 110" role="img" aria-label={centerLabel}>
          <circle cx="55" cy="55" r={R} fill="none" stroke="var(--tv-surface2)" strokeWidth="13" />
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * C;
            const el = (
              <circle
                key={i}
                cx="55" cy="55" r={R}
                fill="none"
                stroke={d.color}
                strokeWidth={hover === i ? 16 : 13}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 55 55)"
                className="cursor-pointer transition-all duration-200"
                style={{ opacity: hover !== null && hover !== i ? 0.35 : 1 }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-mono text-[15px] font-semibold tabular leading-tight text-ink">
            {active ? format(active.value) : format(total)}
          </span>
          <span className="max-w-20 truncate text-[10.5px] font-medium text-muted">
            {active ? active.label : centerLabel}
          </span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {data.slice(0, 7).map((d, i) => (
          <li
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={cx(
              "flex cursor-default items-center gap-2.5 rounded-md px-2 py-1 transition-colors",
              hover === i && "bg-surface2/70"
            )}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink2">{d.label}</span>
            <span className="font-mono text-[12.5px] font-semibold tabular text-ink">{format(d.value)}</span>
            <span className="w-10 text-right font-mono text-[11.5px] tabular text-muted">
              {Math.round((d.value / total) * 100)}%
            </span>
          </li>
        ))}
        {data.length > 7 && (
          <li className="px-2 text-[11.5px] text-muted">+ {data.length - 7} more</li>
        )}
      </ul>
    </div>
  );
}

/* ---------------- horizontal ranking bars ---------------- */

export function RankBars({
  data,
  format,
  color,
}: {
  data: Array<{ label: string; value: number; color?: string }>;
  format: (v: number) => string;
  color?: string;
}) {
  const max = Math.max(1e-9, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="py-8 text-center text-[13px] text-muted">No data in this range.</p>;
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={i} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] font-medium text-ink2 group-hover:text-ink">{d.label}</span>
            <span className="shrink-0 font-mono text-[12.5px] font-semibold tabular text-ink">{format(d.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface2">
            <div
              className="anim-grow h-full rounded-full transition-all duration-200 group-hover:brightness-110"
              style={{
                width: `${Math.max(2, (d.value / max) * 100)}%`,
                background: d.color ?? color ?? "var(--tv-accent)",
                animationDelay: `${i * 60}ms`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- section wrapper ---------------- */

export function ChartCard({
  title,
  sub,
  right,
  children,
  className,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-xl border border-line bg-surface p-4.5 shadow-card sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-bold text-ink">{title}</h3>
          {sub && <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ---------------- activity heatmap (GitHub-style) ---------------- */

export function ActivityHeatmap({ entries, weeks = 20 }: { entries: TimeEntry[]; weeks?: number }) {
  const cells = useMemo(() => {
    const days = lastNDays(weeks * 7);
    const per = new Map<string, number>();
    for (const e of entries) per.set(e.date, (per.get(e.date) ?? 0) + e.durationMin);
    return days.map((d) => ({ key: d, min: per.get(d) ?? 0, dow: (parseKey(d).getDay() + 6) % 7 }));
  }, [entries, weeks]);

  const max = Math.max(60, ...cells.map((c) => c.min));

  const colorFor = (min: number): string => {
    if (min === 0) return "var(--tv-surface2)";
    const f = min / max;
    if (f < 0.25) return "color-mix(in srgb, var(--tv-accent) 30%, var(--tv-surface2))";
    if (f < 0.5) return "color-mix(in srgb, var(--tv-accent) 55%, var(--tv-surface2))";
    if (f < 0.75) return "color-mix(in srgb, var(--tv-accent) 78%, var(--tv-surface2))";
    return "var(--tv-accent)";
  };

  return (
    <div className="overflow-x-auto pb-1">
      <div className="grid w-max grid-flow-col gap-[3px]" style={{ gridTemplateRows: "repeat(7, 11px)" }}>
        {cells.map((c) => (
          <div
            key={c.key}
            role="img"
            aria-label={`${c.key}: ${fmtHL(c.min)} tracked`}
            className="tv-tip h-[11px] w-[11px] rounded-[3px] transition-transform hover:scale-125"
            data-tip={`${c.key} · ${fmtHL(c.min)}`}
            style={{ background: colorFor(c.min), gridRow: c.dow + 1 }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 font-mono text-[10.5px] text-muted">
        Less
        {[0, 0.3, 0.55, 0.8, 1].map((f) => (
          <span key={f} className="h-[10px] w-[10px] rounded-[2px]" style={{ background: colorFor(f * max) }} />
        ))}
        More
      </div>
    </div>
  );
}

/* ---------------- streak chip ---------------- */

export function StreakChip({ entries }: { entries: TimeEntry[] }) {
  const streak = useMemo(() => {
    const days = new Set(entries.map((e) => e.date));
    let s = 0;
    let cur = new Date();
    if (!days.has(toKey(cur))) cur = parseKey(toKey(cur));
    cur.setDate(cur.getDate() - (days.has(toKey(cur)) ? 0 : 1));
    while (days.has(toKey(cur))) {
      s++;
      cur.setDate(cur.getDate() - 1);
    }
    return s;
  }, [entries]);

  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-[12.5px] font-bold tabular",
        streak > 0 ? "bg-amber/12 text-amber" : "bg-surface2 text-muted"
      )}
    >
      <svg width="13" height="15" viewBox="0 0 13 15" aria-hidden="true">
        <path
          d="M6.5 0C7 3 9.5 4.5 10.5 7a5.5 5.5 0 1 1-10 2C.5 6 3 5 3.5 2.5 5 3.5 6 5 6 6.5 7 5 6.5 2 6.5 0z"
          fill="currentColor"
          opacity={streak > 0 ? 1 : 0.4}
        />
      </svg>
      {streak}-day streak
    </span>
  );
}
