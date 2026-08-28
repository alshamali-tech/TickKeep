import { useCallback, useEffect, useRef, useState } from "react";
import { SUITES, TOTAL_CASES } from "../lib/e2e/cases";
import { runSuite, snapshotAndReset, type TestResult } from "../lib/e2e/engine";
import { I } from "../components/icons";
import { Badge, Button } from "../components/ui";
import { cx, fmtHL } from "../lib/utils";

interface LogLine {
  t: string;
  kind: "info" | "suite" | "pass" | "fail" | "done";
  text: string;
}

const stamp = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

export function TestsPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const abortRef = useRef(false);
  const logBoxRef = useRef<HTMLDivElement>(null);

  const pushLog = useCallback((kind: LogLine["kind"], text: string) => {
    setLog((l) => [...l.slice(-400), { t: stamp(), kind, text }]);
  }, []);

  useEffect(() => {
    const box = logBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [log]);

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const done = passed + failed;
  const totalMs = results.reduce((s, r) => s + r.ms, 0);

  const runAll = async () => {
    if (running) return;
    abortRef.current = false;
    setRunning(true);
    setResults([]);
    setLog([]);
    pushLog("info", "Snapshot of local data taken — it will be restored after the run.");
    const restore = snapshotAndReset();
    pushLog("info", "Store reset to a fresh ledger for deterministic runs.");
    try {
      for (const suite of SUITES) {
        if (abortRef.current) break;
        pushLog("suite", suite.name);
        await runSuite(
          suite,
          (r) => {
            setResults((prev) => {
              const others = prev.filter((x) => !(x.suite === r.suite && x.name === r.name));
              return [...others, r];
            });
            if (r.status === "pass") pushLog("pass", `${r.name} (${r.ms}ms)`);
            if (r.status === "fail") pushLog("fail", `${r.name} — ${r.error}`);
          },
          () => abortRef.current
        );
      }
    } finally {
      restore();
      setRunning(false);
      setLastRunAt(stamp());
      pushLog("done", "Your data was restored.");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
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
              1000-project / 1000-client / 100-teammate stress run.
            </p>
          </div>
          {!running ? (
            <Button icon="play" size="lg" onClick={runAll}>Run all</Button>
          ) : (
            <Button
              variant="danger"
              icon="stop"
              size="lg"
              onClick={() => {
                abortRef.current = true;
                pushLog("info", "Aborting after the current case…");
              }}
            >
              Abort
            </Button>
          )}
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Passed", value: String(passed), cls: "text-ok" },
            { label: "Failed", value: String(failed), cls: failed > 0 ? "text-danger" : "text-muted" },
            { label: "Progress", value: `${done}/${TOTAL_CASES}`, cls: "text-ink" },
            { label: "Duration", value: running ? "…" : fmtHL(Math.round(totalMs / 1000) * 1) || `${Math.round(totalMs)}ms`, cls: "text-ink" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{s.label}</p>
              <p className={cx("mt-0.5 font-mono text-[22px] font-semibold tabular leading-none", s.cls)}>{s.value}</p>
            </div>
          ))}
        </div>

        {running && (
          <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-surface2" aria-hidden="true">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${(done / TOTAL_CASES) * 100}%` }}
            />
          </div>
        )}
        {lastRunAt && !running && (
          <p className="relative mt-3 font-mono text-[11.5px] text-muted">last run {lastRunAt}</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* suite ledger */}
        <div className="space-y-3">
          {SUITES.map((suite) => {
            const rs = results.filter((r) => r.suite === suite.name);
            const sp = rs.filter((r) => r.status === "pass").length;
            const sf = rs.filter((r) => r.status === "fail").length;
            const active = running && rs.length < suite.tests.length && !abortRef.current;
            return (
              <section key={suite.name} className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                <header className="flex items-center gap-2.5 border-b border-line bg-surface2/50 px-4 py-2.5">
                  <span
                    className={cx(
                      "h-2 w-2 rounded-full",
                      sf > 0 ? "bg-danger" : sp === suite.tests.length ? "bg-ok" : active ? "pulse-dot bg-amber" : "bg-line"
                    )}
                  />
                  <h3 className="min-w-0 flex-1 truncate font-display text-[14px] font-bold text-ink">{suite.name}</h3>
                  <span className="font-mono text-[11.5px] tabular text-muted">
                    {sp}/{suite.tests.length}
                  </span>
                </header>
                <ul className="divide-y divide-line/60">
                  {suite.tests.map((test) => {
                    const r = rs.find((x) => x.name === test.name);
                    return (
                      <li key={test.name} className="flex items-center gap-2.5 px-4 py-2">
                        <span className="w-4 shrink-0 text-center">
                          {r?.status === "pass" && <I name="check" size={13} className="text-ok" />}
                          {r?.status === "fail" && <I name="x" size={13} className="text-danger" />}
                          {r?.status === "running" && <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-amber" />}
                          {(!r || r.status === "pending") && <span className="inline-block h-1.5 w-1.5 rounded-full bg-line" />}
                        </span>
                        <span className={cx("min-w-0 flex-1 truncate text-[13px]", r?.status === "fail" ? "font-semibold text-danger" : "text-ink2")}>
                          {test.name}
                        </span>
                        {r && r.status !== "running" && (
                          <span className="shrink-0 font-mono text-[11px] tabular text-muted">{r.ms}ms</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        {/* run console */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-[#0c120e] shadow-card">
          <header className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-danger/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-ok/80" />
            <span className="ml-2 font-mono text-[11.5px] text-white/50">run log</span>
            {running && <Badge tone="amber">live</Badge>}
          </header>
          <div ref={logBoxRef} className="max-h-[560px] min-h-[300px] flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed">
            {log.length === 0 ? (
              <p className="text-white/35">
                {`$ timevault test --all\n\nPress “Run all” to drive the live UI through every suite.\nYour ledger is snapshotted first and restored afterwards.`}
              </p>
            ) : (
              log.map((l, i) => (
                <p
                  key={i}
                  className={cx(
                    "whitespace-pre-wrap",
                    l.kind === "suite" && "mt-2 font-bold text-amber",
                    l.kind === "pass" && "text-ok/90",
                    l.kind === "fail" && "text-danger",
                    l.kind === "info" && "text-white/60",
                    l.kind === "done" && "mt-2 font-bold text-white/85"
                  )}
                >
                  <span className="text-white/30">{l.t}</span>{" "}
                  {l.kind === "pass" && "✓ "}
                  {l.kind === "fail" && "✗ "}
                  {l.kind === "suite" && "▶ "}
                  {l.kind === "done" && "■ "}
                  {l.text}
                </p>
              ))
            )}
          </div>
        </div>
      </div>

      <p className="flex items-center gap-2 font-mono text-[12px] text-muted">
        <I name="shield" size={13} />
        Runs against the live app. Stress seeding is additive to the snapshot and everything is restored on finish.
      </p>
    </div>
  );
}
