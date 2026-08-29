import { useEffect, useMemo, useState } from "react";
import {
  minutesSum, useStore, type TimeEntry,
} from "../lib/store";
import { I } from "../components/icons";
import {
  Button, Card, EmptyState, Input, Menu, Modal, Segmented, Select, Toggle,
  useNow, useToast, navigate,
} from "../components/ui";
import { chime } from "../lib/platform";
import { TimesheetView } from "./timesheet";
import {
  cx, downloadFile, fmtH, fmtHL, hoursAmount, isDateLocked, lastNDays, money, pad2,
  parseDurationInput, relDay, toCSV, todayKey,
} from "../lib/utils";

/* ---------------- shared: entry delete with undo toast ---------------- */

export function useDeleteEntry(): (e: TimeEntry) => void {
  const { push } = useToast();
  const deleteEntry = useStore((s) => s.deleteEntry);
  const restoreEntry = useStore((s) => s.restoreEntry);
  return (e: TimeEntry) => {
    deleteEntry(e.id);
    push({
      kind: "info",
      title: `Deleted ${fmtHL(e.durationMin)} — “${e.description || "entry"}”`,
      action: { label: "Undo", onClick: () => restoreEntry(e) },
    });
  };
}

/* ---------------- entry form modal ---------------- */

export function EntryFormModal({
  open,
  onClose,
  entry,
  presetProjectId,
  presetDate,
  presetDescription,
}: {
  open: boolean;
  onClose: () => void;
  entry: TimeEntry | null;
  presetProjectId?: string | null;
  presetDate?: string | null;
  presetDescription?: string | null;
}) {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const prefs = useStore((s) => s.prefs);
  const addEntry = useStore((s) => s.addEntry);
  const updateEntry = useStore((s) => s.updateEntry);
  const { push } = useToast();

  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayKey());
  const [duration, setDuration] = useState("");
  const [billable, setBillable] = useState(true);
  const [rate, setRate] = useState("0");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr("");
    if (entry) {
      setProjectId(entry.projectId ?? "");
      setTaskId(entry.taskId ?? "");
      setDescription(entry.description);
      setDate(entry.date);
      setDuration(fmtH(entry.durationMin));
      setBillable(entry.billable);
      setRate(String(entry.rate));
    } else {
      const pid = presetProjectId ?? projects.find((p) => p.active)?.id ?? "";
      setProjectId(pid);
      setTaskId("");
      setDescription(presetDescription ?? "");
      setDate(presetDate ?? todayKey());
      setDuration("");
      setBillable(true);
      setRate(String(projects.find((p) => p.id === pid)?.rate ?? 0));
    }
  }, [open, entry, presetProjectId, presetDate, presetDescription, projects]);

  const projectTasks = tasks.filter((t) => t.projectId === projectId);

  const submit = () => {
    if (prefs.requireProject && !projectId) {
      setErr("A project is required for every entry (Settings → Preferences).");
      return;
    }
    if (prefs.requireDescription && !description.trim()) {
      setErr("A description is required for every entry (Settings → Preferences).");
      return;
    }
    const dur = parseDurationInput(duration);
    if (!dur || dur <= 0) {
      setErr("Enter a duration like “1:30”, “90m” or “1.5h”.");
      return;
    }
    const payload = {
      projectId: projectId || null,
      taskId: taskId || null,
      description: description.trim(),
      date,
      durationMin: dur,
      billable,
      rate: Math.max(0, parseFloat(rate) || 0),
    };
    if (entry) {
      updateEntry(entry.id, payload);
      push({ kind: "ok", title: "Entry updated" });
    } else {
      addEntry(payload);
      push({ kind: "ok", title: `Logged ${fmtHL(dur)}`, desc: description.trim() || undefined });
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? "Edit time entry" : "Add time entry"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon="check" onClick={submit}>{entry ? "Save changes" : "Save entry"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Description"
          value={description}
          onChange={(e) => { setDescription(e.target.value); setErr(""); }}
          placeholder="What did you work on?"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Project"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setTaskId("");
              const p = projects.find((x) => x.id === e.target.value);
              if (p) setRate(String(p.rate));
            }}
          >
            <option value="">No project</option>
            {projects.filter((p) => p.active).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Select label="Task" value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={projectTasks.length === 0}>
            <option value="">No task</option>
            {projectTasks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input
            label="Duration"
            value={duration}
            onChange={(e) => { setDuration(e.target.value); setErr(""); }}
            placeholder="1:30, 90m, 1.5h…"
            error={err || undefined}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Hourly rate" type="number" min={0} step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} />
          <div className="pt-6">
            <Toggle checked={billable} onChange={setBillable} label="Billable" />
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- entry row + list ---------------- */

function EntryRow({
  e,
  onEdit,
  onDelete,
  selectable,
  selected,
  onToggle,
}: {
  e: TimeEntry;
  onEdit: (e: TimeEntry) => void;
  onDelete: (e: TimeEntry) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
}) {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const compact = useStore((s) => s.prefs.compact);
  const lockBeforeDate = useStore((s) => s.prefs.lockBeforeDate);
  const { push } = useToast();
  const locked = isDateLocked(e.date, lockBeforeDate);
  const project = projects.find((p) => p.id === e.projectId);
  const task = tasks.find((t) => t.id === e.taskId);
  return (
    <li
      className={cx(
        "group flex items-center gap-3 px-4 transition-colors hover:bg-surface2/50 sm:px-5",
        compact ? "py-1.5" : "py-2.5",
        selected && "bg-accent/6"
      )}
    >
      {locked ? (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center text-muted"
          title={`Locked — entries before ${lockBeforeDate} are read-only`}
          aria-label="Locked entry"
        >
          <I name="shield" size={13} />
        </span>
      ) : selectable ? (
        <button
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select entry: ${e.description || "time entry"}`}
          onClick={() => onToggle?.(e.id)}
          className={cx(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all active:scale-90",
            selected ? "border-accent bg-accent text-onaccent" : "border-line bg-surface hover:border-accent/60"
          )}
        >
          {selected && <I name="check" size={12} />}
        </button>
      ) : null}
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: project?.color ?? "var(--tv-line)" }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-ink">{e.description || "No description"}</p>
        <p className="truncate text-[12px] text-muted">
          {project?.name ?? "No project"}
          {task ? ` · ${task.name}` : ""}
          {!e.billable && " · non-billable"}
        </p>
      </div>
      <span className="font-mono text-[14px] font-semibold tabular text-ink">{fmtH(e.durationMin)}</span>
      {e.billable && (
        <span className="hidden w-20 text-right font-mono text-[13px] font-medium tabular text-accent sm:block">
          {money(hoursAmount(e.durationMin, e.rate))}
        </span>
      )}
      <Menu
        label={`Actions for entry: ${e.description || "time entry"}`}
        items={
          locked
            ? [
                {
                  label: "Continue timer",
                  icon: "play",
                  onClick: () => {
                    const s = useStore.getState();
                    if (s.activeTimer) s.stopTimer();
                    s.startTimer(e.projectId, e.taskId, e.description);
                    navigate("#/app/timer");
                  },
                },
                { label: `Locked (before ${lockBeforeDate})`, icon: "shield", disabled: true, onClick: () => undefined },
              ]
            : [
                {
                  label: "Continue timer",
                  icon: "play",
                  onClick: () => {
                    const s = useStore.getState();
                    if (s.activeTimer) s.stopTimer();
                    s.startTimer(e.projectId, e.taskId, e.description);
                    navigate("#/app/timer");
                  },
                },
                {
                  label: "Duplicate to today",
                  icon: "copy",
                  onClick: () => {
                    const s = useStore.getState();
                    s.addEntry({
                      projectId: e.projectId,
                      taskId: e.taskId,
                      description: e.description,
                      date: todayKey(),
                      durationMin: e.durationMin,
                      billable: e.billable,
                      rate: e.rate,
                    });
                    push({ kind: "ok", title: `Duplicated ${fmtHL(e.durationMin)} to today` });
                  },
                },
                { label: "Edit", icon: "pencil", onClick: () => onEdit(e) },
                { label: "Delete", icon: "trash", danger: true, onClick: () => onDelete(e) },
              ]
        }
      />
    </li>
  );
}

export function EntryGroupList({
  entries,
  onEdit,
  onDelete,
  selectable,
  selected,
  onToggle,
}: {
  entries: TimeEntry[];
  onEdit: (e: TimeEntry) => void;
  onDelete: (e: TimeEntry) => void;
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const e of entries) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  return (
    <div className="space-y-4">
      {groups.map(([date, list]) => {
        const total = minutesSum(list);
        return (
          <Card key={date}>
            <div className="flex items-center justify-between border-b border-line bg-surface2/40 px-4 py-2.5 sm:px-5">
              <p className="text-[13px] font-bold text-ink">{relDay(date)}</p>
              <p className="font-mono text-[12.5px] font-semibold tabular text-muted">{fmtHL(total)}</p>
            </div>
            <ul className="divide-y divide-line/60">
              {list.map((e) => (
                <EntryRow
                  key={e.id}
                  e={e}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  selectable={selectable}
                  selected={selected?.has(e.id)}
                  onToggle={onToggle}
                />
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------------- timer page ---------------- */

export function TimerPage() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const entries = useStore((s) => s.entries);
  const activeTimer = useStore((s) => s.activeTimer);
  const startTimer = useStore((s) => s.startTimer);
  const stopTimer = useStore((s) => s.stopTimer);
  const discardTimer = useStore((s) => s.discardTimer);
  const prefs = useStore((s) => s.prefs);
  const goals = useStore((s) => s.goals);
  const loadSample = useStore((s) => s.loadSample);
  const { push } = useToast();
  const deleteEntry = useDeleteEntry();

  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [note, setNote] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmLong, setConfirmLong] = useState(false);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const now = useNow(activeTimer ? 500 : 30000);
  const sec = activeTimer ? Math.max(0, Math.floor((now - activeTimer.startedAt) / 1000)) : 0;
  const activeProjects = projects.filter((p) => p.active);

  const todayEntries = useMemo(() => entries.filter((e) => e.date === todayKey()), [entries]);
  const elapsedMin = activeTimer ? Math.max(0, (now - activeTimer.startedAt) / 60000) : 0;
  const todayMinLive = minutesSum(todayEntries) + elapsedMin;

  const smartProjects = useMemo(() => {
    const wk = new Set(lastNDays(7));
    const mins = new Map<string, number>();
    for (const e of entries)
      if (wk.has(e.date) && e.projectId) mins.set(e.projectId, (mins.get(e.projectId) ?? 0) + e.durationMin);
    return activeProjects
      .slice()
      .sort((a, b) => (mins.get(b.id) ?? 0) - (mins.get(a.id) ?? 0))
      .slice(0, 4);
  }, [activeProjects, entries]);

  const hmsParts = [String(Math.floor(sec / 3600)), pad2(Math.floor(sec / 60) % 60), pad2(sec % 60)];

  const runningProject = projects.find((p) => p.id === activeTimer?.projectId);
  const projectTasks = tasks.filter((t) => t.projectId === (activeTimer?.projectId ?? projectId));

  const doStop = () => {
    const e = stopTimer();
    if (prefs.timerSound) chime("stop");
    if (e) {
      push({
        kind: "ok",
        title: `Saved ${fmtHL(e.durationMin)}`,
        desc: e.description || runningProject?.name,
        action: { label: "Undo", onClick: () => useStore.getState().deleteEntry(e.id) },
      });
    }
  };

  /* Guard against a forgotten timer: confirm anything over 24h before saving. */
  const handleStop = () => {
    if (activeTimer && Date.now() - activeTimer.startedAt > 24 * 3600 * 1000) {
      setConfirmLong(true);
      return;
    }
    doStop();
  };

  const handlePunchIn = () => {
    if (prefs.requireProject && !projectId) {
      push({ kind: "err", title: "Pick a project first", desc: "Required fields are on (Settings → Preferences)." });
      return;
    }
    if (prefs.requireDescription && !note.trim()) {
      push({ kind: "err", title: "Add a note first", desc: "Descriptions are required (Settings → Preferences)." });
      return;
    }
    startTimer(projectId || null, taskId || null, note.trim());
    if (prefs.timerSound) chime("start");
    push({ kind: "amber", title: "On the clock", desc: projects.find((p) => p.id === projectId)?.name ?? "Timer started" });
  };

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden">
        {activeTimer && <div className="glow-amber anim-breathe pointer-events-none absolute -right-24 -top-24 h-72 w-72" aria-hidden="true" />}
        <div className="relative px-5 py-8 sm:px-8">
          {activeTimer ? (
            <div className="text-center">
              <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-amber">
                On the clock
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-6 sm:gap-9">
                {goals.dailyMin > 0 && <GoalRing current={todayMinLive} target={goals.dailyMin} />}
                <p
                  role="timer"
                  aria-live="off"
                  aria-label={`Elapsed ${hmsParts.join(":")}`}
                  className="flex items-baseline font-mono text-[52px] font-semibold leading-none tabular tracking-tight text-ink sm:text-[76px]"
                >
                  {hmsParts.map((part, i) => (
                    <span key={i} className="contents">
                      {i > 0 && <span className="blink mx-0.5 text-muted/70">:</span>}
                      <span>{part}</span>
                    </span>
                  ))}
                </p>
              </div>
              <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-ink2">
                {runningProject && (
                  <>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: runningProject.color }} />
                    <span className="font-semibold text-ink">{runningProject.name}</span>
                  </>
                )}
                {activeTimer.description && <span className="text-muted">— {activeTimer.description}</span>}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                <Button size="lg" variant="amber" icon="stop" onClick={handleStop}>
                  Punch out
                </Button>
                <Button variant="ghost" icon="trash" onClick={() => setConfirmDiscard(true)}>
                  Discard
                </Button>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-xl">
              <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-accent">
                Punch clock
              </p>
              <h2 className="mt-2 font-display text-2xl font-extrabold text-ink sm:text-3xl">
                What are you working on?
              </h2>
              <div className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="Project" value={projectId} onChange={(e) => { setProjectId(e.target.value); setTaskId(""); }}>
                    <option value="">No project</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                  <Select label="Task" value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={projectTasks.length === 0}>
                    <option value="">No task</option>
                    {projectTasks.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Select>
                </div>
                <Input
                  label="Note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Checkout edge-case fixes"
                />
                {smartProjects.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick-start a project">
                    <span className="mr-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Recent
                    </span>
                    {smartProjects.map((p, i) => (
                      <button
                        key={p.id}
                        onClick={() => { setProjectId(p.id); setTaskId(""); }}
                        className={cx(
                          "inline-flex max-w-56 items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-all active:scale-95",
                          projectId === p.id
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-line bg-surface text-ink2 hover:-translate-y-px hover:border-muted/50 hover:text-ink hover:shadow-card"
                        )}
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                        <span className="truncate">{p.name}</span>
                        {i === 0 && (
                          <span className="rounded bg-accent/12 px-1.5 py-px font-mono text-[9.5px] font-bold uppercase tracking-wide text-accent">
                            top
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <Button size="lg" icon="play" className="mt-2 w-full sm:w-auto" onClick={handlePunchIn}>
                  Punch in
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <section aria-label="Today's entries">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-ink">
            Today
            <span className="ml-2.5 font-mono text-[13px] font-semibold tabular text-muted">
              {fmtHL(todayMinLive)}
              {goals.dailyMin > 0 && (
                <span className={cx("ml-1.5", todayMinLive >= goals.dailyMin ? "text-ok" : "text-amber")}>
                  · {todayMinLive >= goals.dailyMin ? "goal met" : `${fmtHL(goals.dailyMin - todayMinLive)} to goal`}
                </span>
              )}
            </span>
          </h2>
          <Button variant="ghost" size="sm" icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>
            Add entry
          </Button>
        </div>
        {todayEntries.length === 0 ? (
          <EmptyState
            icon="clock"
            title="A blank page so far"
            desc="Punch in above, or log time by hand. The day is young."
          >
            {entries.length === 0 && projects.length === 0 && (
              <Button variant="outline" icon="box" onClick={() => { loadSample(); push({ kind: "ok", title: "Sample data loaded" }); }}>
                Load sample data
              </Button>
            )}
          </EmptyState>
        ) : (
          <Card>
            <ul className="divide-y divide-line/60">
              {todayEntries.map((e) => (
                <EntryRow key={e.id} e={e} onEdit={(x) => { setEditing(x); setFormOpen(true); }} onDelete={deleteEntry} />
              ))}
            </ul>
          </Card>
        )}
      </section>

      <Modal
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard this timer?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>Keep running</Button>
            <Button
              variant="danger"
              onClick={() => {
                discardTimer();
                setConfirmDiscard(false);
                push({ kind: "info", title: "Timer discarded" });
              }}
            >
              Discard
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink2">
          The running time will be thrown away — nothing is saved. If you meant to keep it, punch out instead.
        </p>
      </Modal>

      <Modal
        open={confirmLong}
        onClose={() => setConfirmLong(false)}
        title="That's a long shift"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmLong(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setConfirmLong(false);
                doStop();
              }}
            >
              Save it anyway
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink2">
          This timer has been running for over 24 hours — {activeTimer ? fmtHL(Math.round((Date.now() - activeTimer.startedAt) / 60000)) : ""}.
          Did you forget to stop it? You can save it as-is, or cancel and edit the entry manually afterwards.
        </p>
      </Modal>

      <EntryFormModal open={formOpen} onClose={() => setFormOpen(false)} entry={editing} />
    </div>
  );
}

function GoalRing({ current, target, size = 104 }: { current: number; target: number; size?: number }) {
  const frac = target > 0 ? Math.min(1, current / target) : 0;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const done = current >= target;
  const color = done ? "var(--tv-ok)" : "var(--tv-amber)";
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={Math.round(current)}
      aria-label={`Daily goal progress: ${fmtHL(current)} of ${fmtHL(target)}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--tv-surface2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${frac * c} ${c}`}
          style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.2,0.8,0.3,1), stroke 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[15px] font-bold tabular leading-none text-ink">{Math.round(frac * 100)}%</span>
        <span className={cx("mt-0.5 text-[8.5px] font-bold uppercase tracking-[0.12em]", done ? "text-ok" : "text-muted")}>
          {done ? "goal met" : "of goal"}
        </span>
      </div>
    </div>
  );
}

/* ---------------- entries page (list + week grid) ---------------- */

export function EntriesPage() {
  const entries = useStore((s) => s.entries);
  const projects = useStore((s) => s.projects);
  const updateEntry = useStore((s) => s.updateEntry);
  const deleteEntryById = useStore((s) => s.deleteEntry);
  const restoreEntry = useStore((s) => s.restoreEntry);
  const lockBeforeDate = useStore((s) => s.prefs.lockBeforeDate);
  const { push } = useToast();
  const deleteEntry = useDeleteEntry();

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [billableFilter, setBillableFilter] = useState<"all" | "billable" | "non">("all");
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [view, setView] = useState<"list" | "week">("list");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkProject, setBulkProject] = useState("");

  /* deep-link support: #/app/entries?new=1 opens the entry form (palette) */
  useEffect(() => {
    if (window.location.hash.includes("entries?new=1")) {
      setFormOpen(true);
      history.replaceState(null, "", "#/app/entries");
    }
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (projectFilter && e.projectId !== projectFilter) return false;
      if (billableFilter === "billable" && !e.billable) return false;
      if (billableFilter === "non" && e.billable) return false;
      if (q) {
        const p = projects.find((x) => x.id === e.projectId);
        const hay = `${e.description} ${p?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, projects, search, projectFilter, billableFilter]);

  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkSetBillable = (billable: boolean) => {
    selected.forEach((id) => updateEntry(id, { billable }));
    push({ kind: "ok", title: `${selected.size} ${selected.size === 1 ? "entry" : "entries"} marked ${billable ? "billable" : "non-billable"}` });
    setSelected(new Set());
  };

  const bulkApplyProject = () => {
    selected.forEach((id) => updateEntry(id, { projectId: bulkProject || null }));
    const name = projects.find((p) => p.id === bulkProject)?.name ?? "No project";
    push({ kind: "ok", title: `${selected.size} ${selected.size === 1 ? "entry" : "entries"} → ${name}` });
    setSelected(new Set());
    setBulkProject("");
  };

  const bulkDelete = () => {
    const snapshots = entries.filter((e) => selected.has(e.id));
    snapshots.forEach((e) => deleteEntryById(e.id));
    push({
      kind: "info",
      title: `Deleted ${snapshots.length} ${snapshots.length === 1 ? "entry" : "entries"}`,
      action: { label: "Undo", onClick: () => snapshots.forEach((e) => restoreEntry(e)) },
    });
    setSelected(new Set());
  };

  const exportCsv = () => {
    const rows = filtered
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((e) => [
        e.date,
        projects.find((p) => p.id === e.projectId)?.name ?? "",
        e.description,
        (e.durationMin / 60).toFixed(2),
        e.billable ? "Yes" : "No",
        e.rate,
        e.billable ? ((e.durationMin / 60) * e.rate).toFixed(2) : "0",
      ]);
    downloadFile(
      `tickkeep-entries-${todayKey()}.csv`,
      toCSV([["Date", "Project", "Description", "Hours", "Billable", "Rate", "Amount"], ...rows]),
      "text/csv"
    );
    push({ kind: "ok", title: "CSV exported", desc: `${rows.length} entries` });
  };

  if (view === "week") {
    return (
      <div className="space-y-4">
        <ViewToggle view={view} setView={setView} />
        <TimesheetView />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ViewToggle view={view} setView={setView} />
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-0 flex-1 basis-52">
          <I name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entries…"
            aria-label="Search entries"
            className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted/80 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div className="w-44 min-w-0">
          <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Filter by project">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <Segmented
          label="Filter by billable"
          value={billableFilter}
          onChange={setBillableFilter}
          options={[
            { value: "all", label: "All" },
            { value: "billable", label: "Billable" },
            { value: "non", label: "Non-bill." },
          ]}
        />
        <span className="ml-auto" />
        <Button variant="outline" size="sm" icon="download" onClick={exportCsv} disabled={filtered.length === 0}>
          CSV
        </Button>
        <Button size="sm" icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>
          New entry
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="anim-rise flex flex-wrap items-center gap-2.5 rounded-xl border border-accent/45 bg-accent/8 px-4 py-3">
          <span className="font-mono text-[13px] font-bold tabular text-accent">{selected.size} selected</span>
          <span className="hidden h-5 w-px bg-accent/30 sm:block" />
          <Button variant="ghost" size="sm" onClick={() => bulkSetBillable(true)}>Mark billable</Button>
          <Button variant="ghost" size="sm" onClick={() => bulkSetBillable(false)}>Mark non-billable</Button>
          <span className="flex items-center gap-1.5">
            <select
              value={bulkProject}
              onChange={(e) => setBulkProject(e.target.value)}
              aria-label="Set project for selected entries"
              className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink focus:border-accent focus:outline-none"
            >
              <option value="">Move to project…</option>
              {projects.filter((p) => p.active).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <Button variant="ghost" size="sm" onClick={bulkApplyProject} disabled={!bulkProject}>Apply</Button>
          </span>
          <span className="ml-auto" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setSelected(new Set(filtered.filter((e) => !isDateLocked(e.date, lockBeforeDate)).map((e) => e.id)))
            }
          >
            Select all
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          <Button variant="danger" size="sm" icon="trash" onClick={bulkDelete}>Delete</Button>
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState icon="list" title="No time entries yet" desc="Punch in on the Timer page or add one by hand here.">
          <Button icon="play" onClick={() => navigate("#/app/timer")}>Open the timer</Button>
          <Button variant="outline" icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>Add manually</Button>
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon="filter" title="No entries match" desc="Try widening the filters or clearing the search." />
      ) : (
        <EntryGroupList
          entries={filtered}
          onEdit={(e) => { setEditing(e); setFormOpen(true); }}
          onDelete={deleteEntry}
          selectable
          selected={selected}
          onToggle={toggleSel}
        />
      )}

      <EntryFormModal open={formOpen} onClose={() => setFormOpen(false)} entry={editing} />
    </div>
  );
}

function ViewToggle({ view, setView }: { view: "list" | "week"; setView: (v: "list" | "week") => void }) {
  return (
    <div className="flex justify-end">
      <Segmented
        label="Entries view"
        value={view}
        onChange={setView}
        options={[
          { value: "list", label: "List" },
          { value: "week", label: "Week grid" },
        ]}
      />
    </div>
  );
}
