import { lazy, Suspense, useEffect, useState } from "react";
import { Button, ToastProvider } from "./components/ui";
import { Logo } from "./components/icons";
import { useStore } from "./lib/store";
import Landing from "./app/landing";
import { Shell } from "./app/shell";
import { DashboardPage } from "./app/dashboard";
import { EntriesPage, TimerPage } from "./app/timer";
import { LegalPage } from "./app/legal";

/* Secondary routes are code-split: landing, shell, dashboard and the timer
 * stay in the initial chunk; everything else loads on first visit. */
const ProjectsPage = lazy(() => import("./app/projects").then((m) => ({ default: m.ProjectsPage })));
const ClientsPage = lazy(() => import("./app/clients").then((m) => ({ default: m.ClientsPage })));
const InvoicesPage = lazy(() => import("./app/invoices").then((m) => ({ default: m.InvoicesPage })));
const ExpensesPage = lazy(() => import("./app/expenses").then((m) => ({ default: m.ExpensesPage })));
const EstimatesPage = lazy(() => import("./app/estimates").then((m) => ({ default: m.EstimatesPage })));
const ReportsPage = lazy(() => import("./app/reports").then((m) => ({ default: m.ReportsPage })));
const ReviewPage = lazy(() => import("./app/review").then((m) => ({ default: m.ReviewPage })));
const SettingsPage = lazy(() => import("./app/settings").then((m) => ({ default: m.SettingsPage })));
const SyncPage = lazy(() => import("./app/sync").then((m) => ({ default: m.SyncPage })));
const ImportPage = lazy(() => import("./app/import").then((m) => ({ default: m.ImportPage })));
const TeamPage = lazy(() => import("./app/team").then((m) => ({ default: m.TeamPage })));
const TestsPage = lazy(() => import("./app/tests").then((m) => ({ default: m.TestsPage })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-label="Loading page">
      <span className="pulse-dot h-3 w-3 rounded-full bg-accent" />
      <span className="pulse-dot ml-2 h-3 w-3 rounded-full bg-accent/70" style={{ animationDelay: "0.2s" }} />
      <span className="pulse-dot ml-2 h-3 w-3 rounded-full bg-accent/40" style={{ animationDelay: "0.4s" }} />
    </div>
  );
}

function useHashPath(): string {
  const [path, setPath] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onHash = () => setPath(window.location.hash || "#/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return path;
}

function AppPages({ path }: { path: string }) {
  if (path.startsWith("#/app/timer")) return <TimerPage />;
  if (path.startsWith("#/app/entries")) return <EntriesPage />;
  if (path.startsWith("#/app/projects")) return <ProjectsPage path={path} />;
  if (path.startsWith("#/app/clients")) return <ClientsPage />;
  if (path.startsWith("#/app/invoices")) return <InvoicesPage path={path} />;
  if (path.startsWith("#/app/expenses")) return <ExpensesPage />;
  if (path.startsWith("#/app/estimates")) return <EstimatesPage />;
  if (path.startsWith("#/app/reports")) return <ReportsPage />;
  if (path.startsWith("#/app/review")) return <ReviewPage />;
  if (path.startsWith("#/app/team")) return <TeamPage />;
  if (path.startsWith("#/app/sync")) return <SyncPage />;
  if (path.startsWith("#/app/import")) return <ImportPage />;
  if (path.startsWith("#/app/tests")) return <TestsPage />;
  if (path.startsWith("#/app/settings")) return <SettingsPage />;
  return <DashboardPage />;
}

function NotFound() {
  return (
    <div className="bg-grid flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo size={44} />
      <p className="mt-6 font-mono text-[13px] font-semibold uppercase tracking-[0.2em] text-muted">Error 404</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold text-ink">This hour was never logged.</h1>
      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-ink2">
        The page you're after doesn't exist — but your ledger is exactly where you left it.
      </p>
      <div className="mt-7 flex gap-3">
        <Button onClick={() => (window.location.hash = "#/app")} icon="grid">
          Open the app
        </Button>
        <Button variant="outline" onClick={() => (window.location.hash = "#/")}>
          Landing page
        </Button>
      </div>
    </div>
  );
}

/* Applies the theme to <html> and persists it for the no-flash bootstrap
 * script in index.html. Runs everywhere (landing, app, legal). */
function useThemeApplier() {
  const theme = useStore((s) => s.prefs.theme);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    };
    apply();
    try {
      localStorage.setItem("tv-theme", theme);
    } catch {
      /* private mode */
    }
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}

export default function App() {
  const path = useHashPath();
  useThemeApplier();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [path]);

  let content;
  if (path.startsWith("#/app")) {
    content = (
      <Shell path={path}>
        <Suspense fallback={<PageLoader />}>
          <AppPages path={path} />
        </Suspense>
      </Shell>
    );
  } else if (path.startsWith("#/privacy")) {
    content = <LegalPage kind="privacy" />;
  } else if (path.startsWith("#/terms")) {
    content = <LegalPage kind="terms" />;
  } else if (path === "#/" || path === "#" || path === "") {
    content = <Landing />;
  } else {
    content = <NotFound />;
  }

  return (
    <ToastProvider>
      <button
        onClick={() => {
          const el = document.getElementById("main");
          if (el) {
            el.tabIndex = -1;
            el.focus();
            el.scrollIntoView();
          } else {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-onaccent"
      >
        Skip to content
      </button>
      {content}
    </ToastProvider>
  );
}
