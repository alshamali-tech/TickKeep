import { useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { I } from "../components/icons";
import { Badge, Button, EmptyState, useToast } from "../components/ui";
import { EntryFormModal } from "./timer";
import { cx, fmtDate, fmtH, toKey, todayKey } from "../lib/utils";

interface CalEvent {
  uid: string;
  summary: string;
  dateKey: string; // YYYY-MM-DD
  startMin: number | null; // minutes from midnight, if timed
  endMin: number | null;
}

/** Minimal, dependency-free ICS reader (VEVENT blocks only). */
function parseIcs(text: string): CalEvent[] {
  const unfolded = text.replace(/\r\n[ \t]/g, "").replace(/\r/g, "\n");
  const lines = unfolded.split("\n");
  const out: CalEvent[] = [];
  let cur: Partial<CalEvent> | null = null;

  const toLocal = (raw: string): { dateKey: string; startMin: number | null; endMin: number | null } => {
    // 20260214T090000Z / 20260214T090000 / 20260214
    const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
    if (!m) return { dateKey: todayKey(), startMin: null, endMin: null };
    const [, y, mo, d, h, mi] = m;
    const dateKey = `${y}-${mo}-${d}`;
    if (h === undefined) return { dateKey, startMin: null, endMin: null };
    const startMin = parseInt(h, 10) * 60 + parseInt(mi, 10);
    return { dateKey, startMin, endMin: null };
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "BEGIN:VEVENT") {
      cur = { uid: "", summary: "", dateKey: todayKey(), startMin: null, endMin: null };
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur && cur.summary) {
        out.push({
          uid: cur.uid || `ev-${out.length}`,
          summary: cur.summary,
          dateKey: cur.dateKey || todayKey(),
          startMin: cur.startMin ?? null,
          endMin: cur.endMin ?? null,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).split(";")[0].toUpperCase();
    const val = line.slice(idx + 1);
    if (key === "SUMMARY") cur.summary = val.replace(/\\,/g, ",");
    else if (key === "UID") cur.uid = val;
    else if (key === "DTSTART") {
      const t = toLocal(val);
      cur.dateKey = t.dateKey;
      cur.startMin = t.startMin;
    } else if (key === "DTEND") {
      const t = toLocal(val);
      cur.endMin = t.startMin;
    }
  }
  return out.sort((a, b) =>
    a.dateKey === b.dateKey ? (a.startMin ?? 0) - (b.startMin ?? 0) : a.dateKey.localeCompare(b.dateKey)
  );
}

export function CalendarPage() {
  const projects = useStore((s) => s.projects);
  const { push } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [events, setEvents] = useState<CalEvent[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("upcoming");
  const [logEvent, setLogEvent] = useState<CalEvent | null>(null);

  const activeProjects = useMemo(() => projects.filter((p) => p.active), [projects]);

  const visible = useMemo(() => {
    const tk = todayKey();
    if (filter === "upcoming") return events.filter((e) => e.dateKey >= tk);
    if (filter === "past") return events.filter((e) => e.dateKey < tk);
    return events;
  }, [events, filter]);

  const onFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseIcs(String(reader.result ?? ""));
        setEvents(parsed);
        setFileName(file.name);
        if (parsed.length === 0) {
          push({ kind: "info", title: "No events found", desc: "That file has no VEVENT entries." });
        } else {
          push({ kind: "ok", title: `Loaded ${parsed.length} events`, desc: file.name });
        }
      } catch {
        push({ kind: "err", title: "Couldn't read that calendar file" });
      }
    };
    reader.readAsText(file);
  };

  const durationOf = (e: CalEvent): number => {
    if (e.startMin !== null && e.endMin !== null && e.endMin > e.startMin) return e.endMin - e.startMin;
    return 60; // sensible default for all-day / unknown
  };

  return (
    <div className="space-y-6">
      {/* drop / pick zone */}
      <section
        className="relative overflow-hidden rounded-2xl border-2 border-dashed border-line bg-surface/60 px-6 py-10 text-center transition-colors hover:border-accent/60"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFile(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        <div className="glow-amber pointer-events-none absolute -right-20 -top-24 h-64 w-64" aria-hidden="true" />
        <div className="relative mx-auto max-w-md">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <I name="cal" size={26} />
          </span>
          <h2 className="mt-4 font-display text-xl font-extrabold text-ink">Bring your calendar in</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink2">
            Drop an <code className="rounded bg-surface2 px-1.5 py-0.5 font-mono text-[12px] text-ink">.ics</code> file
            (Google Calendar, Outlook, Apple) and turn meetings into tracked time — nothing is uploaded, it's read right here.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <Button icon="upload" onClick={() => fileRef.current?.click()}>
              Choose .ics file
            </Button>
            {fileName && (
              <Button variant="ghost" icon="x" onClick={() => { setEvents([]); setFileName(null); }}>
                Clear
              </Button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            aria-label="Import calendar (.ics) file"
            onChange={(e) => {
              onFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      {/* events */}
      {events.length > 0 ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-lg font-bold text-ink">
              Events
              <span className="ml-2 font-mono text-[13px] font-semibold tabular text-muted">{visible.length}</span>
            </h3>
            <div className="flex gap-1.5" role="group" aria-label="Filter events">
              {(["upcoming", "past", "all"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cx(
                    "rounded-full border px-3.5 py-1 text-[12.5px] font-semibold capitalize transition-all",
                    filter === f
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-line text-muted hover:border-muted/50 hover:text-ink"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon="cal" title="Nothing here" desc="No events match this filter." />
          ) : (
            <ul className="space-y-2">
              {visible.map((e) => {
                const timed = e.startMin !== null;
                return (
                  <li
                    key={e.uid}
                    className="anim-rise group flex items-center gap-4 rounded-xl border border-line bg-surface px-4.5 py-3 shadow-card transition-all hover:-translate-y-px hover:border-accent/50"
                  >
                    <div className="flex w-24 shrink-0 flex-col">
                      <span className="font-mono text-[13px] font-semibold tabular text-ink">{fmtDate(e.dateKey)}</span>
                      <span className="font-mono text-[11.5px] tabular text-muted">
                        {timed
                          ? `${fmtH(e.startMin as number)}${e.endMin !== null ? `–${fmtH(e.endMin)}` : ""}`
                          : "all-day"}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-ink">{e.summary}</p>
                      <p className="text-[12px] text-muted">{e.dateKey === todayKey() ? "Today" : fmtDate(e.dateKey)}</p>
                    </div>
                    <Badge tone={e.dateKey >= todayKey() ? "accent" : "gray"}>
                      {e.dateKey >= todayKey() ? "upcoming" : "past"}
                    </Badge>
                    <Button size="sm" variant="soft" icon="plus" onClick={() => setLogEvent(e)}>
                      Log time
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <section>
          <EmptyState
            icon="cal"
            title="No calendar loaded yet"
            desc="Import an .ics export from Google Calendar, Outlook or Apple Calendar to see your events and log time against them."
          >
            <Button icon="upload" onClick={() => fileRef.current?.click()}>Choose .ics file</Button>
          </EmptyState>
        </section>
      )}

      {activeProjects.length === 0 && events.length > 0 && (
        <p className="rounded-lg border border-amber/40 bg-amber/8 px-4 py-3 text-[13px] text-ink2">
          <I name="alert" size={15} className="mr-2 inline text-amber" />
          You have no active projects — logged events will be saved without a project.
        </p>
      )}

      {/* log-time modal pre-filled from the event */}
      <EntryFormModal
        open={logEvent !== null}
        onClose={() => setLogEvent(null)}
        entry={null}
        presetDate={logEvent?.dateKey ?? null}
        presetDescription={logEvent ? logEvent.summary : null}
        presetProjectId={null}
      />
    </div>
  );
}
