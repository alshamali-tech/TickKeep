import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { I, type IconName } from "../components/icons";
import { cx, money } from "../lib/utils";
import { computeTotals } from "../lib/invoice";

interface Item {
  id: string;
  group: string;
  icon: IconName;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const clients = useStore((s) => s.clients);
  const projects = useStore((s) => s.projects);
  const invoices = useStore((s) => s.invoices);
  const loadSample = useStore((s) => s.loadSample);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (hash: string) => () => {
      window.location.hash = hash;
      onClose();
    };
    const base: Item[] = [
      { id: "p-dash", group: "Pages", icon: "grid", label: "Go to Dashboard", run: go("#/app") },
      { id: "p-timer", group: "Pages", icon: "timer", label: "Go to Timer", run: go("#/app/timer") },
      { id: "p-entries", group: "Pages", icon: "list", label: "Go to Time entries", run: go("#/app/entries") },
      { id: "p-projects", group: "Pages", icon: "briefcase", label: "Go to Projects", run: go("#/app/projects") },
      { id: "p-clients", group: "Pages", icon: "users", label: "Go to Clients", run: go("#/app/clients") },
      { id: "p-invoices", group: "Pages", icon: "invoice", label: "Go to Invoices", run: go("#/app/invoices") },
      { id: "p-estimates", group: "Pages", icon: "quote", label: "Go to Estimates", run: go("#/app/estimates") },
      { id: "p-expenses", group: "Pages", icon: "receipt", label: "Go to Expenses", run: go("#/app/expenses") },
      { id: "p-reports", group: "Pages", icon: "chart", label: "Go to Reports", run: go("#/app/reports") },
      { id: "p-review", group: "Pages", icon: "award", label: "Go to Year review", run: go("#/app/review") },
      { id: "p-team", group: "Pages", icon: "share", label: "Go to Team", run: go("#/app/team") },
      { id: "p-sync", group: "Pages", icon: "sync", label: "Go to Sync & backup", run: go("#/app/sync") },
      { id: "p-import", group: "Pages", icon: "upload", label: "Go to Import", run: go("#/app/import") },
      { id: "p-settings", group: "Pages", icon: "gear", label: "Go to Settings", run: go("#/app/settings") },
      { id: "p-tests", group: "Pages", icon: "check", label: "Go to Test bench", run: go("#/app/tests") },
      { id: "act-log", group: "Actions", icon: "plus", label: "Log time manually", run: go("#/app/entries?new=1") },
      { id: "act-newinv", group: "Actions", icon: "invoice", label: "Create a new invoice", run: go("#/app/invoices") },
      { id: "act-sample", group: "Actions", icon: "box", label: "Load sample data", run: () => { loadSample(); onClose(); } },
    ];
    const entity: Item[] = [
      ...clients.map((c) => ({
        id: `c-${c.id}`, group: "Clients", icon: "users" as IconName, label: c.name,
        hint: c.email, run: go("#/app/clients"),
      })),
      ...projects.map((p) => ({
        id: `pr-${p.id}`, group: "Projects", icon: "briefcase" as IconName, label: p.name,
        hint: `${money(p.rate)} / h`, run: go(`#/app/projects/${p.id}`),
      })),
      ...invoices.map((i) => ({
        id: `i-${i.id}`, group: "Invoices", icon: "invoice" as IconName, label: `${i.number} · ${i.status}`,
        hint: money(computeTotals(i.items, i.taxRate, i.discount).total, i.currency),
        run: go(`#/app/invoices/${i.id}`),
      })),
    ];
    return [...base, ...entity];
  }, [clients, projects, invoices, loadSample, onClose]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) =>
      `${it.label} ${it.hint ?? ""} ${it.group}`.toLowerCase().includes(needle)
    );
  }, [items, q]);

  useEffect(() => setSel(0), [q]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${sel}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;

  const runSel = () => {
    const it = filtered[sel];
    if (it) it.run();
  };

  const groups: string[] = [];
  for (const it of filtered) if (!groups.includes(it.group)) groups.push(it.group);

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center px-4 pt-[12vh]">
      <button aria-label="Close search" className="absolute inset-0 bg-[#0b120e]/55 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="anim-rise relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel((s) => Math.min(filtered.length - 1, s + 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel((s) => Math.max(0, s - 1));
          }
          if (e.key === "Enter") {
            e.preventDefault();
            runSel();
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <I name="search" size={17} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            aria-label="Search"
            placeholder="Search pages, clients, projects, invoices…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-13 w-full bg-transparent py-4 text-[15px] text-ink placeholder:text-muted/70 focus:outline-none"
          />
          <kbd className="shrink-0 rounded-md border border-line bg-surface2 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-muted">
            esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{q}”.</p>
          )}
          {groups.map((g) => (
            <div key={g}>
              <p className="px-3 pb-1 pt-2.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">
                {g}
              </p>
              {filtered
                .map((it, i) => ({ it, i }))
                .filter(({ it }) => it.group === g)
                .map(({ it, i }) => {
                  const active = i === sel;
                  return (
                    <button
                      key={it.id}
                      data-idx={i}
                      onClick={runSel}
                      onMouseEnter={() => setSel(i)}
                      className={cx(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                        active ? "bg-accent/10 text-accent" : "text-ink hover:bg-surface2"
                      )}
                    >
                      <I name={it.icon} size={16} className={active ? "text-accent" : "text-muted"} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">{it.label}</span>
                        {it.hint && <span className="block truncate font-mono text-[11px] text-muted">{it.hint}</span>}
                      </span>
                      {active && <I name="chevR" size={14} />}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-line bg-surface2/40 px-4 py-2.5 font-mono text-[10.5px] text-muted">
          <span><kbd className="rounded border border-line bg-surface px-1">↑↓</kbd> navigate</span>
          <span><kbd className="rounded border border-line bg-surface px-1">↵</kbd> open</span>
          <span className="ml-auto"><kbd className="rounded border border-line bg-surface px-1">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
