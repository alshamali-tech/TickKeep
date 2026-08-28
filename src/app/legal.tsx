import { useEffect, useRef } from "react";
import { I, Logo } from "../components/icons";
import { cx } from "../lib/utils";

function RevealBlock({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("is-in")),
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={cx("reveal")} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

const PRIVACY = [
  {
    h: "The short version",
    ps: [
      "TimeVault collects nothing. No analytics, no cookies, no tracking pixels, no accounts, no telemetry. There is no server for us to store anything on — the entire application is static files.",
    ],
  },
  {
    h: "Where your data lives",
    ps: [
      "Everything you enter — time entries, clients, projects, invoices, expenses, settings — is stored exclusively in your browser's local storage (IndexedDB/localStorage). It never leaves your device unless you explicitly export or sync it.",
      "If you connect a sync destination (a Drive folder, OneDrive folder, or your own server), the backup file is written to that storage, which you control. TimeVault never reads it back into any server of ours, because we have none.",
    ],
  },
  {
    h: "External requests",
    ps: [
      "The only third-party call TimeVault can make is to open.er-api.com for exchange rates, and only when you open a currency-aware view (like the Expenses report). It sends no personal data — just a request for public rates — and is attributed in Settings → About. If you never use multi-currency features, zero external calls are ever made.",
    ],
  },
  {
    h: "Export, import, delete",
    ps: [
      "Your data is portable by design. Settings → Data lets you export everything as JSON, import it back on any device, or permanently clear the ledger. Clearing your browser data also clears TimeVault, so keep a backup you trust.",
    ],
  },
  {
    h: "Children",
    ps: [
      "TimeVault collects no data from anyone, so there is no age restriction and no COPPA concern.",
    ],
  },
  {
    h: "Changes to this policy",
    ps: [
      "If this page ever changes, the updated version is posted here with a date. Given the architecture (no data collection), dramatic changes are unlikely.",
    ],
  },
];

const TERMS = [
  {
    h: "What this is",
    ps: [
      "TimeVault is a free, open-source time tracking and invoicing tool that runs entirely in your web browser. No account is required. These terms govern your use of the software.",
    ],
  },
  {
    h: "No account, your responsibility",
    ps: [
      "Because there are no accounts, you are solely responsible for your data: making backups, exporting before clearing browser data, and verifying invoices before sending them to clients. TimeVault cannot recover data that is deleted from your device, because it never had a copy.",
    ],
  },
  {
    h: "Provided as-is",
    ps: [
      'TimeVault is provided "as is" and "as available", without warranty of any kind, express or implied — including accuracy of calculations, fitness for a particular purpose, or uninterrupted availability. Verify totals on invoices before relying on them.',
    ],
  },
  {
    h: "Donations",
    ps: [
      "Donations via Ko-fi, Buy Me a Coffee or PayPal are voluntary gifts. They confer no rights, unlock nothing, are non-refundable, and are never required. There is no feature gating, trial pressure or obligation of any kind.",
    ],
  },
  {
    h: "Changes to these terms",
    ps: [
      "We may update these terms from time to time. When we do, the revised version is posted on this page. Your data is always yours: nothing in these terms ever lets us access, claim or delete the time entries, clients or invoices stored on your device.",
    ],
  },
  {
    h: "Intellectual property",
    ps: [
      "TimeVault is original software licensed under the TimeVault End-User License Agreement (EULA); all rights are reserved by the Licensor. It is not affiliated with, endorsed by, or connected to any other time tracking product. References to alternatives are for identification only.",
    ],
  },
  {
    h: "Limitation of liability",
    ps: [
      "To the maximum extent permitted by law, TimeVault and its authors are not liable for indirect, incidental or consequential damages, including lost data, lost revenue or lost profits, arising from the use of the software.",
    ],
  },
  {
    h: "The rest",
    ps: [
      "These terms are the entire agreement regarding your use of TimeVault. If any provision is unenforceable, the remainder stays in effect. Amendments are posted on this page. And that's genuinely all of it — no page forty-seven.",
    ],
  },
];

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const sections = kind === "privacy" ? PRIVACY : TERMS;
  const title = kind === "privacy" ? "Privacy Policy" : "Terms of Service";
  const intro =
    kind === "privacy"
      ? "TimeVault is built local-first, which makes this policy unusually short: there is no server, so there is nothing for us to collect, store, sell or leak."
      : "Plain-language terms for a plain-language tool. The gist: it's free, it's yours, it runs on your machine, and we promise very little because we can barely break anything.";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <a href="#/" aria-label="TimeVault home" className="transition-opacity hover:opacity-85">
            <Logo size={30} withWord />
          </a>
          <a
            href="#/app"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-semibold text-onaccent transition-all hover:opacity-92"
          >
            Open the app <I name="chevR" size={14} />
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <RevealBlock>
          <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-accent">Legal</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-ink">{title}</h1>
          <p className="mt-3 font-mono text-[12.5px] text-muted">Last updated: January 2026</p>
          <p className="mt-5 text-[15.5px] leading-relaxed text-ink2">{intro}</p>
        </RevealBlock>

        <div className="mt-10 space-y-8">
          {sections.map((s, i) => (
            <RevealBlock key={s.h} delay={i * 40}>
              <h2 className="flex items-baseline gap-3 font-display text-xl font-bold text-ink">
                <span className="font-mono text-[12px] font-semibold tabular text-accent">{String(i + 1).padStart(2, "0")}</span>
                {s.h}
              </h2>
              {s.ps.map((p) => (
                <p key={p.slice(0, 40)} className="mt-3 text-[14.5px] leading-relaxed text-ink2">{p}</p>
              ))}
            </RevealBlock>
          ))}
        </div>

        <p className="mt-12 border-t border-line pt-6 text-[13px] text-muted">
          Questions? The honest answer is probably already above. TimeVault · free to use · All Rights Reserved.
        </p>
      </main>
    </div>
  );
}
