import { useEffect, useMemo, useState } from "react";
import {
  PROJECT_COLORS, billableAmount, minutesSum, useStore,
  type Project, type TimeEntry,
} from "../lib/store";
import { I } from "../components/icons";
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, Menu, Modal, ProgressBar,
  Select, useToast, navigate,
} from "../components/ui";
import { EntryFormModal, EntryGroupList, useDeleteEntry } from "./timer";
import { cx, fmtHL, money, todayKey } from "../lib/utils";

export function ProjectsPage({ path }: { path: string }) {
  const m = path.match(/^#\/app\/projects\/([^/?#]+)/);
  if (m) return <ProjectDetail id={decodeURIComponent(m[1])} />;
  return <ProjectList />;
}

/* ---------------- list ---------------- */

function ProjectList() {
  const projects = useStore((s) => s.projects);
  const clients = useStore((s) => s.clients);
  const entries = useStore((s) => s.entries);
  const updateProject = useStore((s) => s.updateProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const loadSample = useStore((s) => s.loadSample);
  const { push } = useToast();

  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [toDelete, setToDelete] = useState<Project | null>(null);

  const monthPrefix = todayKey().slice(0, 7);
  const visible = projects.filter((p) => (showArchived ? !p.active : p.active));

  const monthMin = (id: string) =>
    minutesSum(entries.filter((e) => e.projectId === id && e.date.startsWith(monthPrefix)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex cursor-pointer items-center gap-2 text-[13.5px] font-medium text-ink2">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 accent-[var(--tv-accent)]"
          />
          Show archived
        </label>
        <span className="ml-auto" />
        <Button icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>
          New project
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="briefcase"
          title={showArchived ? "Nothing archived" : "No projects yet"}
          desc="Projects hold a rate, a color and a budget — and give your time somewhere to land."
        >
          <Button icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>Create a project</Button>
          {projects.length === 0 && (
            <Button variant="ghost" icon="box" onClick={() => { loadSample(); push({ kind: "ok", title: "Sample data loaded" }); }}>
              Load sample data
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => {
            const client = clients.find((c) => c.id === p.clientId);
            const used = monthMin(p.id);
            const budgetMin = p.budgetHours ? p.budgetHours * 60 : null;
            const ratio = budgetMin ? used / budgetMin : null;
            const projEntries = entries.filter((e) => e.projectId === p.id);
            return (
              <Card key={p.id} className="anim-rise flex flex-col p-4.5 transition-all hover:-translate-y-0.5 hover:shadow-pop sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => navigate(`#/app/projects/${p.id}`)} className="min-w-0 text-left">
                    <span className="flex items-center gap-2.5">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} />
                      <span className="truncate font-display text-[16px] font-bold text-ink hover:text-accent">{p.name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                      {client?.name ?? "No client"} · {money(p.rate)}/h
                    </span>
                  </button>
                  <Menu
                    label={`Actions for ${p.name}`}
                    items={[
                      { label: "Edit", icon: "pencil", onClick: () => { setEditing(p); setFormOpen(true); } },
                      p.active
                        ? {
                            label: "Archive",
                            icon: "archive" as never,
                            onClick: () => {
                              updateProject(p.id, { active: false, archivedAt: new Date().toISOString() });
                              push({ kind: "info", title: `Archived “${p.name}”` });
                            },
                          }
                        : {
                            label: "Unarchive",
                            icon: "box" as never,
                            onClick: () => {
                              updateProject(p.id, { active: true, archivedAt: null });
                              push({ kind: "ok", title: `Restored “${p.name}”` });
                            },
                          },
                      { label: "Delete", icon: "trash", danger: true, onClick: () => setToDelete(p) },
                    ]}
                  />
                </div>

                <div className="mt-4 flex items-baseline gap-3">
                  <span className="font-mono text-[22px] font-semibold tabular text-ink">{fmtHL(used)}</span>
                  <span className="text-[12px] text-muted">this month</span>
                  <span className="ml-auto font-mono text-[13px] font-semibold tabular text-accent">
                    {money(billableAmount(projEntries))}
                  </span>
                </div>

                {ratio !== null && budgetMin ? (
                  <div className="mt-3">
                    <div className="flex items-baseline justify-between text-[11.5px]">
                      <span className="font-semibold uppercase tracking-wide text-muted">Budget</span>
                      <span className={cx("font-mono font-semibold tabular", ratio >= 1 ? "text-danger" : ratio >= 0.75 ? "text-amber" : "text-ink2")}>
                        {fmtHL(used)} / {fmtHL(budgetMin)}
                      </span>
                    </div>
                    <ProgressBar value={ratio} tone={ratio >= 1 ? "danger" : ratio >= 0.75 ? "amber" : "accent"} label={`${p.name} budget`} />
                  </div>
                ) : (
                  <p className="mt-3 text-[12px] text-muted">No budget set — open the project to add one.</p>
                )}

                <div className="mt-4 flex items-center gap-2 border-t border-line/70 pt-3.5">
                  <Badge tone={p.active ? "green" : "gray"}>{p.active ? "active" : "archived"}</Badge>
                  <span className="text-[12px] text-muted">{projEntries.length} entries</span>
                  <span className="ml-auto" />
                  <Button variant="ghost" size="sm" onClick={() => navigate(`#/app/projects/${p.id}`)}>
                    Open <I name="chevR" size={13} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ProjectFormModal open={formOpen} onClose={() => setFormOpen(false)} project={editing} />
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={`Delete “${toDelete?.name}”?`}
        desc="The project and its tasks are removed. Time entries stay in the ledger as “No project”."
        onConfirm={() => {
          if (toDelete) {
            deleteProject(toDelete.id);
            push({ kind: "info", title: `Deleted “${toDelete.name}”` });
          }
        }}
      />
    </div>
  );
}

/* ---------------- detail ---------------- */

function ProjectDetail({ id }: { id: string }) {
  const project = useStore((s) => s.projects.find((p) => p.id === id));
  const clients = useStore((s) => s.clients);
  const tasks = useStore((s) => s.tasks);
  const entries = useStore((s) => s.entries);
  const addTask = useStore((s) => s.addTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const deleteEntry = useDeleteEntry();

  const [taskName, setTaskName] = useState("");
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const projectEntries = useMemo(
    () => entries.filter((e) => e.projectId === id).sort((a, b) => b.date.localeCompare(a.date)),
    [entries, id]
  );
  const projectTasks = tasks.filter((t) => t.projectId === id);

  if (!project) {
    return (
      <EmptyState icon="briefcase" title="Project not found" desc="It may have been deleted.">
        <Button onClick={() => navigate("#/app/projects")}>Back to projects</Button>
      </EmptyState>
    );
  }

  const client = clients.find((c) => c.id === project.clientId);
  const totalMin = minutesSum(projectEntries);
  const monthPrefix = todayKey().slice(0, 7);
  const monthMin = minutesSum(projectEntries.filter((e) => e.date.startsWith(monthPrefix)));
  const budgetMin = project.budgetHours ? project.budgetHours * 60 : null;

  return (
    <div className="space-y-5">
      <button onClick={() => navigate("#/app/projects")} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-muted transition-colors hover:text-accent">
        <I name="chevL" size={15} /> All projects
      </button>

      <div className="flex flex-wrap items-center gap-3">
        <span className="h-4 w-4 rounded-full" style={{ background: project.color }} />
        <h2 className="font-display text-2xl font-extrabold text-ink">{project.name}</h2>
        <Badge tone={project.active ? "green" : "gray"}>{project.active ? "active" : "archived"}</Badge>
        <span className="ml-auto font-mono text-[13px] text-muted">
          {client?.name ?? "No client"} · {money(project.rate)}/h
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <DetailStat label="All time" value={fmtHL(totalMin)} />
        <DetailStat label="This month" value={fmtHL(monthMin)} />
        <DetailStat label="Billable value" value={money(billableAmount(projectEntries))} accent />
        <DetailStat label="Entries" value={String(projectEntries.length)} />
      </div>

      {budgetMin !== null && (
        <Card className="p-4.5 sm:p-5">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-[15px] font-bold text-ink">Monthly budget</h3>
            <span className="font-mono text-[13px] font-semibold tabular text-ink2">
              {fmtHL(monthMin)} / {fmtHL(budgetMin)}
            </span>
          </div>
          <ProgressBar
            value={monthMin / budgetMin}
            tone={monthMin / budgetMin >= 1 ? "danger" : monthMin / budgetMin >= 0.75 ? "amber" : "accent"}
            label={`${project.name} monthly budget`}
          />
          <BudgetForecast budgetMin={budgetMin} monthMin={monthMin} hasEntries={projectEntries.length > 0} />
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <Card>
          <div className="border-b border-line px-4.5 py-3 sm:px-5">
            <h3 className="font-display text-[15px] font-bold text-ink">Tasks</h3>
          </div>
          <form
            className="flex gap-2 px-4.5 py-3.5 sm:px-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!taskName.trim()) return;
              addTask({ projectId: project.id, name: taskName.trim(), billable: true });
              setTaskName("");
            }}
          >
            <input
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="New task…"
              aria-label="New task name"
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none"
            />
            <Button size="sm" type="submit" icon="plus" aria-label="Add task">Add</Button>
          </form>
          {projectTasks.length === 0 ? (
            <p className="px-4.5 pb-4 text-[13px] text-muted sm:px-5">No tasks yet — add one above.</p>
          ) : (
            <ul className="divide-y divide-line/60 border-t border-line">
              {projectTasks.map((t) => (
                <li key={t.id} className="group flex items-center gap-3 px-4.5 py-2.5 sm:px-5">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{t.name}</span>
                  <IconButton
                    label={`Delete task ${t.name}`}
                    name="trash"
                    size={14}
                    className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                    onClick={() => deleteTask(t.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div>
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="font-display text-[15px] font-bold text-ink">Entries</h3>
            <Button variant="ghost" size="sm" icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>
              Add entry
            </Button>
          </div>
          {projectEntries.length === 0 ? (
            <EmptyState icon="clock" title="No time here yet" desc="Track against this project and entries appear below." />
          ) : (
            <EntryGroupList entries={projectEntries} onEdit={(e) => { setEditing(e); setFormOpen(true); }} onDelete={deleteEntry} />
          )}
        </div>
      </div>

      <EntryFormModal open={formOpen} onClose={() => setFormOpen(false)} entry={editing} presetProjectId={project.id} />
    </div>
  );
}

function DetailStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-surface2/60 px-3.5 py-3">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={cx("mt-1 truncate font-mono text-lg font-semibold tabular", accent ? "text-accent" : "text-ink")}>{value}</p>
    </div>
  );
}

function BudgetForecast({ budgetMin, monthMin, hasEntries }: { budgetMin: number; monthMin: number; hasEntries: boolean }) {
  if (!hasEntries || monthMin === 0) {
    return <p className="mt-3 text-[12.5px] text-muted">Track some time this month and the forecast kicks in.</p>;
  }
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyPace = monthMin / dayOfMonth;
  const projected = monthMin + dailyPace * (daysInMonth - dayOfMonth);
  const remaining = budgetMin - monthMin;

  let message: string;
  let tone: "accent" | "amber" | "danger";
  if (remaining <= 0) {
    message = `Monthly budget is used up — ${fmtHL(Math.abs(remaining))} over.`;
    tone = "danger";
  } else if (projected > budgetMin) {
    const daysLeft = remaining / dailyPace;
    message = `At ${fmtHL(dailyPace)}/day, the budget runs out in ~${Math.max(1, Math.round(daysLeft))} days — projected ${fmtHL(projected - budgetMin)} over by month-end.`;
    tone = "danger";
  } else if (projected > budgetMin * 0.8) {
    message = `On pace for ${fmtHL(projected)} — close to the ${fmtHL(budgetMin)} line. Keep an eye on it.`;
    tone = "amber";
  } else {
    message = `On pace for ${fmtHL(projected)} this month — comfortably within the ${fmtHL(budgetMin)} budget.`;
    tone = "accent";
  }

  return (
    <div className={cx(
      "mt-4 flex items-start gap-3 rounded-lg border px-4 py-3.5",
      tone === "danger" ? "border-danger/40 bg-danger/8" : tone === "amber" ? "border-amber/40 bg-amber/8" : "border-accent/40 bg-accent/8"
    )}>
      <I name="chart" size={17} className={cx("mt-0.5 shrink-0", tone === "danger" ? "text-danger" : tone === "amber" ? "text-amber" : "text-accent")} />
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-ink">Budget forecast</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink2">{message}</p>
      </div>
    </div>
  );
}

/* ---------------- form ---------------- */

function ProjectFormModal({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project: Project | null;
}) {
  const clients = useStore((s) => s.clients);
  const addProject = useStore((s) => s.addProject);
  const updateProject = useStore((s) => s.updateProject);
  const { push } = useToast();

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [rate, setRate] = useState("90");
  const [budget, setBudget] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr("");
    setName(project?.name ?? "");
    setClientId(project?.clientId ?? "");
    setColor(project?.color ?? PROJECT_COLORS[0]);
    setRate(String(project?.rate ?? 90));
    setBudget(project?.budgetHours ? String(project.budgetHours) : "");
  }, [open, project]);

  const submit = () => {
    if (!name.trim()) {
      setErr("Projects need a name.");
      return;
    }
    const payload = {
      name: name.trim(),
      clientId: clientId || null,
      color,
      rate: Math.max(0, parseFloat(rate) || 0),
      budgetHours: budget ? Math.max(0, parseFloat(budget) || 0) : null,
    };
    if (project) {
      updateProject(project.id, payload);
      push({ kind: "ok", title: "Project updated" });
    } else {
      addProject(payload);
      push({ kind: "ok", title: `Project “${payload.name}” created` });
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? "Edit project" : "New project"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon="check" onClick={submit}>{project ? "Save changes" : "Create project"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={(e) => { setName(e.target.value); setErr(""); }}
          placeholder="e.g. Website retainer"
          error={err || undefined}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Input label="Hourly rate" type="number" min={0} step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <Input
          label="Monthly budget (hours, optional)"
          type="number"
          min={0}
          step="1"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="e.g. 40"
        />
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-ink2">Color</p>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                className={cx(
                  "h-8 w-8 rounded-full transition-transform hover:scale-110 active:scale-95",
                  color === c && "ring-2 ring-ink ring-offset-2 ring-offset-surface"
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
