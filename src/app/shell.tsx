import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "../lib/store";
import { autoPush } from "../lib/sync";
import { chime } from "../lib/platform";
import { undoLast, redoLast } from "../lib/undo";
import { I, Logo, type IconName } from "../components/icons";
import { Button, IconButton, Modal, useNow, useToast, navigate } from "../components/ui";
import { cx, fmtH, fmtHL } from "../lib/utils";
import { CommandPalette } from "./palette";

export const DONATIONS = [
  { label: "Ko-fi", href: "https://ko-fi.com/mammonalshamali" },
  { label: "Buy Me a Coffee", href: "https://buymeacoffee.com/timevault" },
  { label: "PayPal", href: "https://paypal.me/timevault" },
];

const NAV: Array<{ title: string; items: Array<{ to: string; label: string; icon: IconName }> }> = [
  {
    title: "Overview",
    items: [
      { to: "#/app", label: "Dashboard", icon: "grid" },
      { to: "#/app/reports", label: "Reports", icon: "chart" },
      { to: "#/app/review", label: "Year review", icon: "award" },
    ],
  },
  {
    title: "Track",
    items: [
      { to: "#/app/timer", label: "Timer", icon: "timer" },
      { to: "#/app/entries", label: "Time entries", icon: "list" },
      { to: "#/app/calendar", label: "Calendar", icon: "cal" },
      { to: "#/app/projects", label: "Projects", icon: "briefcase" },
      { to: "#/app/clients", label: "Clients", icon: "users" },
    ],
  },
  {
    title: "Bill",
    items: [
      { to: "#/app/invoices", label: "Invoices", icon: "invoice" },
      { to: "#/app/estimates", label: "Estimates", icon: "quote" },
      { to: "#/app/expenses", label: "Expenses", icon: "receipt" },
    ],
  },
  {
    title: "System",
    items: [
      { to: "#/app/sync", label: "Sync", icon: "sync" },
      { to: "#/app/import", label: "Import", icon: "upload" },
      { to: "#/app/tests", label: "Test bench", icon: "check" },
      { to: "#/app/settings", label: "Settings", icon: "gear" },
    ],
  },
];

const TITLES: Array<[string, string]> = [
  ["#/app", "Dashboard"],
  ["#/app/timer", "Timer"],
  ["#/app/entries", "Time entries"],
  ["#/app/projects", "Projects"],
  ["#/app/clients", "Clients"],
  ["#/app/invoices", "Invoices"],
  ["#/app/estimates", "Estimates"],
  ["#/app/expenses", "Expenses"],
  ["#/app/reports", "Reports"],
  ["#/app/review", "Year in review"],
  ["#/app/calendar", "Calendar"],
  ["#/app/sync", "Sync & backup"],
  ["#/app/import", "Import data"],
  ["#/app/tests", "Test bench"],
  ["#/app/settings", "Settings"],
];

/** Pushes to the active sync destination on the configured interval. */
function AutoSyncRunner() {
  const enabled = useStore((s) => s.syncMeta.auto.enabled);
  const intervalMin = useStore((s) => s.syncMeta.auto.intervalMin);
  const active = useStore((s) => s.syncMeta.active);
  useEffect(() => {
    if (!enabled || !active) return;
    const id = window.setInterval(() => void autoPush(active), Math.max(1, intervalMin) * 60_000);
    return () => window.clearInterval(id);
  }, [enabled, intervalMin, active]);
  return null;
}

/** Detects a new service worker and offers a refresh. Data is safe — it lives in storage. */
function useAppUpdate() {
  const { push } = useToast();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let notified = false;
    const notify = () => {
      if (notified) return;
      notified = true;
      push({
        kind: "info",
        title: "A new version of TimeVault is ready",
        desc: "Refresh to update — your tracked data stays exactly where it is.",
        action: { label: "Refresh", onClick: () => window.location.reload() },
      });
    };
    const onController = () => notify();
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    navigator.serviceWorker.ready
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) notify();
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              nw.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onController);
  }, [push]);
}

/* ---------------- keyboard shortcuts reference ---------------- */

const SHORTCUTS: Array<{ group: string; keys: string[]; label: string }> = [
  { group: "Global", keys: ["⌘", "K"], label: "Open the command palette" },
  { group: "Global", keys: ["⌘", "⇧", "T"], label: "Start / stop the timer" },
  { group: "Global", keys: ["⌘", "Z"], label: "Undo last action" },
  { group: "Global", keys: ["⌘", "⇧", "Z"], label: "Redo" },
  { group: "Global", keys: ["?"], label: "Show this reference" },
  { group: "Navigate", keys: ["g", "d"], label: "Go to Dashboard" },
  { group: "Navigate", keys: ["g", "t"], label: "Go to Timer" },
  { group: "Navigate", keys: ["g", "e"], label: "Go to Entries" },
  { group: "Navigate", keys: ["g", "p"], label: "Go to Projects" },
  { group: "Navigate", keys: ["g", "c"], label: "Go to Clients" },
  { group: "Navigate", keys: ["g", "i"], label: "Go to Invoices" },
  { group: "Navigate", keys: ["g", "r"], label: "Go to Reports" },
  { group: "Navigate", keys: ["g", "s"], label: "Go to Settings" },
];

function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" footer={<Button variant="ghost" onClick={onClose}>Done</Button>}>
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g}>
            <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{g}</p>
            <ul className="divide-y divide-line/60 overflow-hidden rounded-lg border border-line">
              {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-4 bg-surface px-3.5 py-2.5">
                  <span className="text-[13px] text-ink2">{s.label}</span>
                  <span className="flex shrink-0 gap-1">
                    {s.keys.map((k) => (
                      <kbd key={k} className="rounded-md border border-line bg-surface2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ---------------- shell ---------------- */

export function Shell({ path, children }: { path: string; children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const title = TITLES.find(([p]) => path.split("?")[0] === p)?.[1] ?? "Dashboard";

  useEffect(() => setDrawer(false), [path]);

  // Generate recurring invoices that have come due.
  const processRecurring = useStore((s) => s.processRecurring);
  useEffect(() => {
    processRecurring();
  }, [processRecurring]);

  // Global keyboard shortcuts.
  const gRef = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const inField = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        const s = useStore.getState();
        if (s.activeTimer) {
          const entry = s.stopTimer();
          if (entry) chime("stop");
        } else {
          s.startTimer(s.projects[0]?.id ?? null, null, "");
          chime("start");
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        if (inField) return;
        e.preventDefault();
        if (e.shiftKey) redoLast();
        else undoLast();
        return;
      }
      if (inField || mod || e.altKey) return;
      if (e.key === "?") {
        setShortcutsOpen((v) => !v);
        return;
      }
      if (e.key === "g") {
        gRef.current = Date.now();
        return;
      }
      if (Date.now() - gRef.current < 900) {
        const jumps: Record<string, string> = {
          d: "#/app", t: "#/app/timer", e: "#/app/entries", p: "#/app/projects",
          c: "#/app/clients", i: "#/app/invoices", r: "#/app/reports", s: "#/app/settings",
        };
        const to = jumps[e.key.toLowerCase()];
        if (to) {
          gRef.current = 0;
          navigate(to);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Idle-timer warning.
  const idleWarnMin = useStore((s) => s.prefs.idleWarnMin);
  const timerStartedAt = useStore((s) => s.activeTimer?.startedAt ?? null);
  const { push } = useToast();
  const warnedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!idleWarnMin || !timerStartedAt) return;
    const id = window.setInterval(() => {
      const elapsed = (Date.now() - timerStartedAt) / 60000;
      if (elapsed >= idleWarnMin && warnedFor.current !== timerStartedAt) {
        warnedFor.current = timerStartedAt;
        push({ kind: "info", title: "Timer still running", desc: `${fmtHL(elapsed)} on the clock — punch out when you're done.` });
      }
    }, 20000);
    return () => window.clearInterval(id);
  }, [idleWarnMin, timerStartedAt, push]);

  useAppUpdate();

  return (
    <div className="min-h-screen lg:pl-60">
      {/* ambient workspace backdrop */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        <div className="bg-grid absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
        <div className="glow-amber absolute -top-32 right-[-10%] h-96 w-96" />
        <div
          className="absolute -bottom-40 left-[20%] h-96 w-96 rounded-full"
          style={{ background: "radial-gradient(closest-side, color-mix(in srgb, var(--tv-accent) 7%, transparent), transparent 70%)" }}
        />
      </div>
      <AutoSyncRunner />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <SidebarContent path={path} />
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" onClick={() => setDrawer(false)} />
          <aside className="anim-rise absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-line bg-surface shadow-pop">
            <SidebarContent path={path} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <IconButton label="Open menu" name="menu" className="lg:hidden" onClick={() => setDrawer(true)} />
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold text-ink">{title}</h1>
          <TimerChip />
          <ThemeToggle />
        </div>
      </header>

      <main id="main" className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>

      <DonationToast />
    </div>
  );
}

function SidebarContent({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  const current = path.split("?")[0];
  return (
    <>
      <div className="flex h-14 items-center border-b border-line px-4">
        <a href="#/" aria-label="TimeVault home" onClick={onNavigate}>
          <Logo size={28} withWord />
        </a>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
        {NAV.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-2.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-muted">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = current === item.to;
                return (
                  <li key={item.to}>
                    <a
                      href={item.to}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all",
                        active
                          ? "bg-accent/10 text-accent"
                          : "text-ink2 hover:bg-surface2 hover:text-ink"
                      )}
                    >
                      <I name={item.icon} size={16} className={active ? "text-accent" : "text-muted"} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <a
          href={DONATIONS[0].href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink2 transition-colors hover:bg-amber/10 hover:text-ink"
        >
          <I name="heart" size={16} className="text-amber" />
          <span className="min-w-0 flex-1 truncate">Support TimeVault</span>
          <I name="ext" size={13} className="text-muted" />
        </a>
        <p className="px-2.5 pt-2 font-mono text-[10.5px] text-muted">v1.0.0 · free now</p>
      </div>
    </>
  );
}

function TimerChip() {
  const activeTimer = useStore((s) => s.activeTimer);
  const now = useNow(activeTimer ? 1000 : 60000);
  if (!activeTimer) {
    return (
      <button
        onClick={() => navigate("#/app/timer")}
        className="hidden items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-muted transition-colors hover:border-accent/50 hover:text-ink sm:flex"
      >
        <I name="timer" size={14} />
        Clock is out
      </button>
    );
  }
  const min = Math.max(0, (now - activeTimer.startedAt) / 60000);
  return (
    <button
      onClick={() => navigate("#/app/timer")}
      className="flex items-center gap-2 rounded-lg border border-amber/50 bg-amber/10 px-3 py-1.5 font-mono text-[13px] font-semibold tabular text-amber transition-all hover:bg-amber/15"
    >
      <span className="pulse-dot h-2 w-2 rounded-full bg-amber" />
      {fmtH(min)}
    </button>
  );
}

function ThemeToggle() {
  const theme = useStore((s) => s.prefs.theme);
  const setPrefs = useStore((s) => s.setPrefs);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const isDark = theme === "dark" || (theme === "system" && systemDark);
  return (
    <IconButton
      label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      name={isDark ? "sun" : "moon"}
      onClick={() => setPrefs({ theme: isDark ? "light" : "dark" })}
    />
  );
}

/* ---------------- donation toast: 5th use, 1/session, 7-day cooldown ---------------- */

function DonationToast() {
  const donation = useStore((s) => s.donation);
  const setDonation = useStore((s) => s.setDonation);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("tv-don-bumped")) return;
    sessionStorage.setItem("tv-don-bumped", "1");
    const current = useStore.getState().donation;
    setDonation({ useCount: current.useCount + 1 });
  }, [setDonation]);

  useEffect(() => {
    if (sessionStorage.getItem("tv-don-shown")) return;
    const d = useStore.getState().donation;
    const cooldownOver =
      !d.lastToastAt || Date.now() - new Date(d.lastToastAt).getTime() > 7 * 24 * 60 * 60 * 1000;
    if (d.useCount >= 5 && cooldownOver) {
      const t = window.setTimeout(() => {
        setVisible(true);
        sessionStorage.setItem("tv-don-shown", "1");
        setDonation({ lastToastAt: new Date().toISOString() });
      }, 2500);
      return () => window.clearTimeout(t);
    }
  }, [donation.useCount, setDonation]);

  if (!visible) return null;
  return (
    <div role="status" className="anim-toast fixed bottom-4 left-4 z-[75] w-[min(92vw,350px)] rounded-xl border border-amber/40 bg-surface p-4 shadow-pop">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-[15px] font-bold text-ink">TimeVault is free right now.</p>
        <button
          aria-label="Dismiss donation message"
          onClick={() => setVisible(false)}
          className="rounded-md p-1 text-muted transition-colors hover:bg-surface2 hover:text-ink"
        >
          <I name="x" size={15} />
        </button>
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink2">
        If it's saving you money, consider fueling its development. No pressure — ever.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {DONATIONS.map((d) => (
          <a
            key={d.label}
            href={d.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber px-3 py-1.5 text-[13px] font-semibold text-onamber transition-opacity hover:opacity-88"
          >
            <I name={d.label === "PayPal" ? "wallet" : "coffee"} size={13} />
            {d.label}
          </a>
        ))}
      </div>
    </div>
  );
}
