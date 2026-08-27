import { useMemo, useState } from "react";
import { minutesSum, useStore, type TimeEntry } from "../lib/store";
import { I } from "../components/icons";
import { Button, EmptyState, IconButton, Modal, navigate, useToast } from "../components/ui";
import { EntryFormModal, useDeleteEntry } from "./timer";
import { timesheetPdf } from "../lib/timesheetPdf";
import { addDays, cx, fmtH, fmtHL, money, hoursAmount, startOfWeek, toKey, todayKey } from "../lib/utils";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function TimesheetView() {
  const entries = useStore((s) => s.entries);
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const business = useStore((s) => s.business);
  const weekStartPref = useStore((s) => s.prefs.weekStart);
  const deleteEntry = useDeleteEntry();
  const { push } = useToast();

  const [offset, setOffset] = useState(0);
  const [cell, setCell] = useState<{ projectId: string | null; date: string } | null>(null);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const weekStart = useMemo(() => {
    const base = addDays(new Date(), offset * 7);
    return startOfWeek(base, weekStartPref);
  }, [offset, weekStartPref]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toKey(addDays(weekStart, i))),
    [weekStart]
  );

  const activeProjects = projects.filter((p) => p.active);
  const rows = useMemo(() => {
    return activeProjects.map((p) => ({
      project: p,
      cells: days.map((d) => minutesSum(entries.filter((e) => e.projectId === p.id && e.date === d))),
    }));
  }, [activeProjects, days, entries]);

  const noProjectCells = days.map((d) =>
    minutesSum(entries.filter((e) => e.projectId === null && e.date === d))
  );

  const dayTotals = days.map((_, di) =>
    rows.reduce((s, r) => s + r.cells[di], 0) + noProjectCells[di]
  );
  const weekTotal = dayTotals.reduce((s, v) => s + v, 0);
  const weekEntries = entries.filter((e) => days.includes(e.date));
  const weekBillable = weekEntries.reduce(
    (s, e) => s + (e.billable ? hoursAmount(e.durationMin, e.rate) : 0),
    0
  );

  const rangeLabel = `${days[0]} → ${days[6]}`;

  const entriesFor = (projectId: string | null, date: string) =>
    entries.filter((e) => e.projectId === projectId && e.date === date);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <IconButton label="Previous week" name="chevL" onClick={() => setOffset((o) => o - 1)} />
        <IconButton label="Next week" name="chevR" onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0} />
        <Button variant="ghost" size="sm" onClick={() => setOffset(0)} disabled={offset === 0}>
          This week
        </Button>
        <span className="font-mono text-[13px] font-semibold tabular text-ink2">{rangeLabel}</span>
        <span className="ml-auto" />
        <Button
          variant="outline"
          size="sm"
          icon="download"
          onClick={async () => {
            const list = entries.filter((e) => days.includes(e.date));
            if (list.length === 0) {
              push({ kind: "info", title: "Nothing to export", desc: "This week has no tracked time." });
              return;
            }
            await timesheetPdf({
              weekStartKey: days[0],
              entries: list,
              projects,
              tasks,
              business,
              client: null,
            });
            push({ kind: "ok", title: "Timesheet PDF downloaded", desc: rangeLabel });
          }}
        >
          Timesheet PDF
        </Button>
        <div className="text-right">
          <p className="font-mono text-[19px] font-semibold tabular leading-none text-ink">{fmtHL(weekTotal)}</p>
          <p className="mt-0.5 text-[11.5px] text-muted">{money(weekBillable)} billable</p>
        </div>
      </div>

      {activeProjects.length === 0 ? (
        <EmptyState icon="briefcase" title="No active projects" desc="Create a project and the week grid fills up as you track.">
          <Button icon="plus" onClick={() => navigate("#/app/projects")}>New project</Button>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-160 border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface2/50">
                <th className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-muted" scope="col">
                  Project
                </th>
                {days.map((d, i) => {
                  const isToday = d === todayKey();
                  return (
                    <th key={d} scope="col" className={cx("px-2 py-2.5 text-center", isToday && "bg-amber/10")}>
                      <span className={cx("block text-[12px] font-semibold uppercase tracking-wide", isToday ? "text-amber" : "text-muted")}>
                        {DAY_NAMES[i]}
                      </span>
                      <span className={cx("block font-mono text-[11px] tabular", isToday ? "font-bold text-amber" : "text-muted")}>
                        {d.slice(8)}
                      </span>
                    </th>
                  );
                })}
                <th className="px-3 py-2.5 text-right text-[12px] font-semibold uppercase tracking-wide text-muted" scope="col">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ project, cells }) => {
                const rowTotal = cells.reduce((s, v) => s + v, 0);
                return (
                  <tr key={project.id} className="border-b border-line/60 transition-colors hover:bg-surface2/30">
                    <td className="max-w-44 truncate px-4 py-2 text-[13.5px] font-semibold text-ink">
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: project.color }} />
                        <span className="truncate">{project.name}</span>
                      </span>
                    </td>
                    {cells.map((min, di) => (
                      <Cell key={days[di]} min={min} isToday={days[di] === todayKey()}
                        onClick={() => setCell({ projectId: project.id, date: days[di] })} />
                    ))}
                    <td className="px-3 py-2 text-right font-mono text-[13px] font-semibold tabular text-ink">
                      {rowTotal > 0 ? fmtH(rowTotal) : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-b border-line/60">
                <td className="px-4 py-2 text-[13px] font-medium text-muted">No project</td>
                {noProjectCells.map((min, di) => (
                  <Cell key={days[di]} min={min} isToday={days[di] === todayKey()}
                    onClick={() => setCell({ projectId: null, date: days[di] })} muted />
                ))}
                <td className="px-3 py-2 text-right font-mono text-[12.5px] tabular text-muted">
                  {noProjectCells.reduce((s, v) => s + v, 0) > 0 ? fmtH(noProjectCells.reduce((s, v) => s + v, 0)) : "—"}
                </td>
              </tr>
              <tr className="bg-surface2/50 font-bold">
                <td className="px-4 py-2.5 text-[13px] text-ink">Daily total</td>
                {dayTotals.map((min, di) => (
                  <td key={days[di]} className={cx("px-2 py-2.5 text-center font-mono text-[12.5px] tabular", days[di] === todayKey() ? "text-amber" : "text-ink")}>
                    {min > 0 ? fmtH(min) : "·"}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right font-mono text-[13.5px] tabular text-accent">{fmtH(weekTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <DayEditor
        cell={cell}
        onClose={() => setCell(null)}
        project={projects.find((p) => p.id === cell?.projectId) ?? null}
        entriesFor={entriesFor}
        onEdit={(e) => { setCell(null); setEditing(e); setFormOpen(true); }}
        onDelete={(e) => { deleteEntry(e); }}
        onAdd={() => { setCell(null); setEditing(null); setFormOpen(true); }}
      />

      <EntryFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        entry={editing}
        presetProjectId={cell?.projectId ?? editing?.projectId ?? null}
        presetDate={cell?.date ?? null}
      />
    </div>
  );
}

function Cell({ min, isToday, onClick, muted }: { min: number; isToday: boolean; onClick: () => void; muted?: boolean }) {
  return (
    <td className={cx("px-1 py-1 text-center", isToday && "bg-amber/8")}>
      <button
        onClick={onClick}
        aria-label={`${min > 0 ? fmtHL(min) : "No time"} — click to edit`}
        className={cx(
          "mx-auto block h-9 w-full min-w-12 rounded-lg font-mono text-[13px] font-semibold tabular transition-all active:scale-95",
          min > 0
            ? "bg-accent/12 text-accent hover:bg-accent/22"
            : muted
              ? "text-muted/50 hover:bg-surface2"
              : "text-muted/70 hover:bg-surface2 hover:text-ink"
        )}
      >
        {min > 0 ? fmtH(min) : "–"}
      </button>
    </td>
  );
}

function DayEditor({
  cell,
  onClose,
  project,
  entriesFor,
  onEdit,
  onDelete,
  onAdd,
}: {
  cell: { projectId: string | null; date: string } | null;
  onClose: () => void;
  project: { name: string; color: string } | null;
  entriesFor: (projectId: string | null, date: string) => TimeEntry[];
  onEdit: (e: TimeEntry) => void;
  onDelete: (e: TimeEntry) => void;
  onAdd: () => void;
}) {
  const lockBeforeDate = useStore((s) => s.prefs.lockBeforeDate);
  if (!cell) return null;
  const locked = Boolean(lockBeforeDate) && cell.date < (lockBeforeDate as string);
  const list = entriesFor(cell.projectId, cell.date);
  const total = minutesSum(list);

  return (
    <Modal
      open
      onClose={onClose}
      title={`${project?.name ?? "No project"} — ${cell.date}`}
      footer={
        <>
          <span className="mr-auto font-mono text-[13px] font-semibold tabular text-ink">{fmtHL(total)}</span>
          <Button variant="ghost" onClick={onClose}>Done</Button>
          <Button icon="plus" onClick={onAdd} disabled={locked}>Add entry</Button>
        </>
      }
    >
      {locked && (
        <p className="mb-3 flex items-center gap-2 rounded-lg border border-ok/35 bg-ok/8 px-3.5 py-2.5 text-[12.5px] text-ink2">
          <I name="shield" size={14} className="shrink-0 text-ok" />
          This day is locked — entries before {lockBeforeDate} are read-only.
        </p>
      )}
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No time logged this day yet.</p>
      ) : (
        <ul className="divide-y divide-line/60 overflow-hidden rounded-lg border border-line">
          {list.map((e) => (
            <li key={e.id} className="flex items-center gap-3 bg-surface px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">{e.description || "No description"}</p>
                <p className="font-mono text-[11.5px] tabular text-muted">
                  {fmtH(e.durationMin)}
                  {e.billable ? ` · ${money(hoursAmount(e.durationMin, e.rate))}` : " · non-billable"}
                </p>
              </div>
              {locked ? (
                <span className="flex items-center gap-1 font-mono text-[10.5px] font-bold uppercase tracking-wide text-muted" title="Locked">
                  <I name="shield" size={13} /> locked
                </span>
              ) : (
                <>
                  <IconButton label="Edit entry" name="pencil" size={15} onClick={() => onEdit(e)} />
                  <IconButton label="Delete entry" name="trash" size={15} className="hover:text-danger" onClick={() => onDelete(e)} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
