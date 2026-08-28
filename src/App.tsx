import { useEffect, useState } from "react";
import { Button, ToastProvider } from "./components/ui";
import { Logo } from "./components/icons";
import Landing from "./app/landing";
import { Shell } from "./app/shell";
import { DashboardPage } from "./app/dashboard";
import { EntriesPage, TimerPage } from "./app/timer";
import { ProjectsPage } from "./app/projects";
import { ClientsPage } from "./app/clients";
import { InvoicesPage } from "./app/invoices";
import { ExpensesPage } from "./app/expenses";
import { EstimatesPage } from "./app/estimates";
import { ReportsPage } from "./app/reports";
import { ReviewPage } from "./app/review";
import { SettingsPage } from "./app/settings";
import { SyncPage } from "./app/sync";
import { ImportPage } from "./app/import";
import { TeamPage } from "./app/team";
import { LegalPage } from "./app/legal";

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

export default function App() {
  const path = useHashPath();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [path]);

  let content;
  if (path.startsWith("#/app")) {
    content = (
      <Shell path={path}>
        <AppPages path={path} />
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
