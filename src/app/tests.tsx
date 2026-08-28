import { useSyncExternalStore } from "react";
import { SUITES, TOTAL_CASES } from "../lib/e2e/cases";
import { abortBench, getBench, runAllBench, subscribeBench, type LogLine } from "../lib/e2e/engine";
import { I } from "../components/icons";
import { Badge, Button } from "../components/ui";
import { cx, fmtHL } from "../lib/utils";

export function TestsPage() {
  const bench = useSyncExternalStore(subscribeBench, getBench);
  const { running, results, log, lastRunAt, current, aborted } = bench;

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const done = passed + failed;
  const totalMs = results.reduce((s, r) => s + r.ms, 0);
  const pct = TOTAL_CASES > 0 ? Math.round((done / TOTAL_CASES) * 100) : 0;

  const bySuite = SUITES.map((s) => {
    const rs = results.filter((r) => r.suite === s.name);
    return {
      name: s.name,
      total: s.tests.length,
      passed: rs.filter((r) => r.status === "pass").length,
      failed: rs.filter((r) => r.status === "fail").length,
      running: current?.startsWith(s.name),
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* header */}
      <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="glow-amber pointer-events-none absolute -right-16 -top-20 h-52 w-52" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <I name="check" size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-extrabold text-ink">Test bench</h2>
            <p className="mt-0.5 text-[13px] text-ink2">
              End-to-end · drives the real UI · {TOTAL_CASES} cases across {SUITES.length} suites, including a
              1000-project / 1000-client / 100-teammate stress run. Cases may navigate the app while running —
              results are kept and you're brought back here at the end.
            </p>
          </div>
          {!running ? (
            <Button icon="play" size="lg" onClick={() => void runAllBench(SUITES)}>
              Run all
            </Button>
          ) : (
            <Button
              variant="danger"
              icon="stop"
              size="lg"
              disabled={aborted}
              onClick={() => abortBench()}
            >
              {aborted ? "Stopping…" : "Stop"}
            </Button>
          )}
        </div>

        {/* counters */}
        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Passed", value: String(passed), cls: "text-ok" },
            { label: "Failed", value: String(failed), cls: failed > 0 ? "text-danger" : "text-muted" },
            { label: "Progress", value: `${done}/${TOTAL_CASES}`, cls: "text-ink" },
            {
              label: "Duration",
              value: totalMs > 1000 ? fmtHL(Math.round(totalMs / 1000)) : `${totalMs}ms`,
              cls: "text-ink",
            },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{s.label}</p>
              <p className={cx("mt-0.5 font-mono text-[22px] font-semibold tabular leading-none", s.cls)}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* progress bar */}
        {(running || done > 0) && (
          <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-surface2" aria-hidden="true">
            <div
              className={cx(
                "h-full rounded-full transition-all duration-300",
                failed > 0 ? "bg-amber" : "bg-accent"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        {running && current && (
          <p className="relative mt-2.5 flex items-center gap-2 font-mono text-[12px] text-muted">
            <span className="pulse-dot h-2 w-2 shrink-0 rounded-full bg-amber" />
            running: <span className="truncate text-ink2">{current}</span>
          </p>
        )}
        {lastRunAt && !running && (
          <p className="relative mt-2.5 font-mono text-[12px] text-muted">last run {lastRunAt}</p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* suite ledger */}
        <section aria-label="Suites" className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <h3 className="px-1 font-display text-[15px] font-bold text-ink">Suites</h3>
          <ul className="mt-3 space-y-1">
            {bySuite.map((s) => (
              <li
                key={s.name}
                className={cx(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
                  s.running ? "bg-amber/10" : "hover:bg-surface2/60"
                )}
              >
                <span
                  className={cx(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    s.running
                      ? "bg-amber text-onamber"
                      : s.failed > 0
                        ? "bg-danger/12 text-danger"
                        : s.passed === s.total && s.total > 0
                          ? "bg-ok/12 text-ok"
                          : "bg-surface2 text-muted"
                  )}
                >
                  <I name={s.running ? "timer" : s.failed > 0 ? "x" : "check"} size={12} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{s.name}</span>
                <span className="shrink-0 font-mono text-[11.5px] tabular text-muted">
                  {s.passed}/{s.total}
                </span>
                {s.failed > 0 && <Badge tone="red">{s.failed}</Badge>}
              </li>
            ))}
          </ul>
        </section>

        {/* run log console */}
        <section aria-label="Run log" className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h3 className="font-display text-[15px] font-bold text-ink">Run log</h3>
            <span className="font-mono text-[11px] text-muted">{log.length} lines</span>
          </div>
          <LogConsole log={log} />
        </section>
      </div>

      <p className="flex items-center gap-2 font-mono text-[12px] text-muted">
        <I name="shield" size={13} /> Your real ledger is snapshotted before the run and restored afterwards — tests never touch it.
      </p>
    </div>
  );
}

function LogConsole({ log }: { log: LogLine[] }) {
  return (
    <div className="max-h-[440px] overflow-y-auto bg-[#101512] px-4 py-3 font-mono text-[12px] leading-relaxed [color-scheme:dark]">
      {log.length === 0 ? (
        <p className="text-[#5d6b60]">Press “Run all” to start the suite.</p>
      ) : (
        log.map((l, i) => (
          <p
            key={i}
            className={cx(
              "whitespace-pre-wrap break-words",
              l.kind === "pass" && "text-[#7fd39a]",
              l.kind === "fail" && "text-[#f28b7d]",
              l.kind === "suite" && "mt-1.5 font-bold text-[#e9d8a6]",
              l.kind === "info" && "text-[#8fa3b0]",
              l.kind === "done" && "mt-1.5 font-bold text-[#d8e2dc]"
            )}
          >
            <span className="mr-2 text-[#5d6b60]">{l.t}</span>
            {l.kind === "suite" ? `▶ ${l.text}` : l.text}
          </p>
        ))
      )}
    </div>
  );
}
