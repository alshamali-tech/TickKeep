import { useEffect, useRef, useState } from "react";
import { useStore, minutesSum } from "../lib/store";
import { I, Logo, type IconName } from "../components/icons";
import { Badge, useNow, useToast } from "../components/ui";
import { cx, fmtHL, todayKey, toKey, addDays } from "../lib/utils";
import { DONATIONS } from "./shell";

/* scroll reveal */
function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("is-in")),
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={cx("reveal", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

const TICKER = [
  "Free now", "No sign-up", "100% on-device", "Offline-first", "PDF invoices",
  "Budgets & billable rates", "CSV + JSON export", "Undo-friendly", "Personal & commercial use",
  "Sync via Drive, OneDrive or your server",
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <Hero />
      <Ticker />
      <Features />
      <HowItWorks />
      <Comparison />
      <TheMath />
      <FAQ />
      <DonationBand />
      <Footer />
    </div>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#/" aria-label="TickKeep home"><Logo size={30} withWord /></a>
        <nav className="hidden items-center gap-6 text-sm font-medium text-ink2 md:flex" aria-label="Landing">
          {(
            [
              ["features", "Features"],
              ["how", "How it works"],
              ["compare", "Compare"],
              ["faq", "FAQ"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="group relative transition-colors hover:text-ink"
            >
              {label}
              <span className="absolute -bottom-1 left-0 h-px w-0 bg-accent transition-all duration-300 group-hover:w-full" aria-hidden="true" />
            </button>
          ))}
        </nav>
        <a
          href="#/app"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-semibold text-onaccent transition-all hover:opacity-92 active:scale-[0.98]"
        >
          Open the app <I name="chevR" size={14} />
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="bg-grid absolute inset-0 opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="glow-amber absolute -left-24 top-10 h-96 w-96" />
        <div
          className="absolute -right-20 top-40 h-80 w-80 rounded-full"
          style={{ background: "radial-gradient(closest-side, color-mix(in srgb, var(--tv-accent) 12%, transparent), transparent 70%)" }}
        />
      </div>
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
        <Reveal>
          <p className="inline-flex items-center gap-2 rounded-full border border-ok/35 bg-ok/10 px-3 py-1 text-[12.5px] font-bold text-ok">
            <I name="shield" size={13} /> No account · No cloud · No subscription
          </p>
          <h1 className="mt-5 font-display text-[44px] font-extrabold leading-[1.04] tracking-tight text-ink sm:text-[64px]">
            Your hours.
            <br />
            Your invoices.
            <br />
            <span className="text-accent">Your device.</span>
          </h1>
          <p className="mt-6 max-w-lg text-[16.5px] leading-relaxed text-ink2">
            TickKeep is the offline-first time tracker and invoice generator for people who bill by
            the hour. Everything lives in your browser — nothing uploads anywhere, and nobody can
            raise the price on you.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#/app"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-accent px-6 text-[15px] font-bold text-onaccent shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop active:translate-y-0"
            >
              Start free <I name="chevR" size={16} />
            </a>
            <a
              href="#how"
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-line bg-surface px-5 text-[15px] font-semibold text-ink transition-colors hover:border-accent/50"
            >
              See how it works
            </a>
          </div>
          <p className="mt-5 font-mono text-[12px] text-muted">
            Free to use right now · works fully offline once loaded
          </p>
        </Reveal>
        <Reveal delay={140}>
          <DemoPunchClock />
        </Reveal>
      </div>
    </section>
  );
}

function DemoPunchClock() {
  const entries = useStore((s) => s.entries);
  const startTimer = useStore((s) => s.startTimer);
  const stopTimer = useStore((s) => s.stopTimer);
  const activeTimer = useStore((s) => s.activeTimer);
  const { push } = useToast();
  const now = useNow(activeTimer ? 500 : 30000);
  const [startedAt, setStartedAt] = useState<number | null>(activeTimer?.startedAt ?? null);

  useEffect(() => setStartedAt(activeTimer?.startedAt ?? null), [activeTimer?.startedAt]);

  const sec = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const display = `${Math.floor(sec / 3600)}:${String(Math.floor(sec / 60) % 60).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  const todayMin = minutesSum(entries.filter((e) => e.date === todayKey()));
  const weekKeys = Array.from({ length: 7 }, (_, i) => toKey(addDays(new Date(), -i)));
  const weekMin = minutesSum(entries.filter((e) => weekKeys.includes(e.date)));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-pop sm:p-8">
      {activeTimer && <div className="glow-amber anim-breathe pointer-events-none absolute -right-20 -top-20 h-60 w-60" aria-hidden="true" />}
      <div className="relative">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11.5px] font-bold uppercase tracking-[0.18em] text-muted">Live demo — real ledger</p>
          {activeTimer ? <Badge tone="amber">on the clock</Badge> : <Badge tone="green">ready</Badge>}
        </div>
        <p
          role="timer"
          aria-live="off"
          aria-label={activeTimer ? `Elapsed ${display}` : "Demo clock stopped"}
          className={cx(
            "mt-6 text-center font-mono text-[52px] font-semibold leading-none tabular tracking-tight sm:text-[64px]",
            activeTimer ? "text-ink" : "text-muted/60"
          )}
        >
          {activeTimer ? display : "0:00:00"}
        </p>
        <div className="mt-7 flex justify-center">
          {activeTimer ? (
            <button
              onClick={() => {
                const e = stopTimer();
                setStartedAt(null);
                if (e) push({ kind: "ok", title: `Saved ${fmtHL(e.durationMin)}`, desc: "Real entry, in your real ledger." });
              }}
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-amber px-7 text-[15px] font-bold text-onamber shadow-card transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              <I name="stop" size={16} /> Punch out
            </button>
          ) : (
            <button
              onClick={() => {
                startTimer(null, null, "Demo session");
                setStartedAt(Date.now());
              }}
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-accent px-7 text-[15px] font-bold text-onaccent shadow-card transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              <I name="play" size={16} /> Punch in
            </button>
          )}
        </div>
        <div className="rule-dash mt-7 grid grid-cols-2 gap-4 border-t border-line pt-5 text-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Today</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular text-ink">{fmtHL(todayMin)}</p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-muted">This week</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular text-ink">{fmtHL(weekMin)}</p>
          </div>
        </div>
        <p className="mt-4 text-center text-[11.5px] text-muted">
          This clock writes to the same ledger the app uses. Punch out and it's yours.
        </p>
      </div>
    </div>
  );
}

function Ticker() {
  const items = [...TICKER, ...TICKER];
  return (
    <div className="marquee border-y border-line bg-surface py-3.5" aria-hidden="true">
      <div className="marquee-track gap-8">
        {items.map((t, i) => (
          <span key={i} className="flex items-center gap-8 whitespace-nowrap font-mono text-[12.5px] font-semibold text-ink2">
            {t}
            <I name="clock" size={12} className="text-accent" />
          </span>
        ))}
      </div>
    </div>
  );
}

const FEATURES: Array<{ icon: IconName; title: string; desc: string }> = [
  { icon: "timer", title: "A timer that survives", desc: "Punch in, close the tab, come back tomorrow — the clock is still running. Entries persist on-device, always." },
  { icon: "invoice", title: "Invoices from hours", desc: "Select unbilled time and expenses, pick one of three letterheads, and download a branded PDF with one click." },
  { icon: "chart", title: "Reports that answer questions", desc: "Billable vs non-billable, client → project → task rollups, un-invoiced money on the table — plus a drag-and-drop custom builder." },
  { icon: "briefcase", title: "Budgets with a forecast", desc: "Hour budgets per project with burn-rate projections, so you know before the month ends — not after." },
  { icon: "sync", title: "Sync on your terms", desc: "One JSON snapshot through a Drive folder, OneDrive folder, or your own server. No relay, no account access." },
  { icon: "shield", title: "Private by architecture", desc: "There is no server to breach. Data lives in your browser; export it, back it up, or delete it whenever you like." },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
      <Reveal>
        <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-accent">The ledger, upgraded</p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-extrabold tracking-tight text-ink sm:text-[40px] sm:leading-[1.1]">
          Everything the big tools do. None of what they do <em className="not-italic text-amber">to you</em>.
        </h2>
      </Reveal>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={i * 60}>
            <article className="group h-full rounded-xl border border-line bg-surface p-5.5 shadow-card transition-all hover:-translate-y-1 hover:border-accent/40 hover:shadow-pop sm:p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10 text-accent transition-transform group-hover:scale-105">
                <I name={f.icon} size={21} />
              </span>
              <h3 className="mt-4 font-display text-[17px] font-bold text-ink">{f.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink2">{f.desc}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps: Array<{ n: string; title: string; desc: string; icon: IconName }> = [
    { n: "01", title: "Punch in", desc: "Start the timer — or type an entry the way you'd write it in a notebook. '1h 30m' parses itself.", icon: "timer" },
    { n: "02", title: "Watch it bill", desc: "Hours roll into projects with budgets. Unbilled time sits in a tray, waiting for an invoice.", icon: "wallet" },
    { n: "03", title: "Send the paper", desc: "One click builds a branded PDF with your letterhead, totals, tax and payment details.", icon: "send" },
  ];
  return (
    <section id="how" className="border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <Reveal>
          <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-accent">Three steps</p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-[40px]">Track → bill → get paid.</h2>
        </Reveal>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 100}>
              <div className="relative">
                <p className="font-mono text-[13px] font-bold tabular text-accent">{s.n}</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-bg text-ink2">
                    <I name={s.icon} size={19} />
                  </span>
                  <h3 className="font-display text-lg font-bold text-ink">{s.title}</h3>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-ink2">{s.desc}</p>
                {i < 2 && (
                  <I name="chevR" size={18} className="absolute -right-5 top-12 hidden text-muted md:block" />
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const COMPARE: Array<[string, string, string]> = [
  ["Price", "Free. Right now.", "$11+ per seat, per month — and it can rise overnight"],
  ["Account required", "None. Open the tab and track.", "Email, password, verification"],
  ["Your data", "In your browser's IndexedDB", "On their servers, subject to their policies"],
  ["Works offline", "Entirely, once loaded", "No — it phones home"],
  ["Invoicing", "Built in, PDF + email composer", "Paid add-on on some plans"],
  ["Price changes", "Nothing to change — it's $0", "480–1500% hikes reported after acquisition"],
];

function Comparison() {
  return (
    <section id="compare" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.3fr]">
        <Reveal>
          <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-accent">Side by side</p>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-[40px] sm:leading-[1.1]">
            The rent is due every month.
            <br />
            <span className="text-accent">Yours never is.</span>
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink2">
            Paid time trackers are fine software with an uncomfortable business model: your timesheet
            is the product, and the price is whatever the new owners decide. TickKeep has no owners
            to appease — just a ledger that lives on your machine.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-surface2/60">
                  <th className="px-5 py-3.5 text-[11.5px] font-bold uppercase tracking-wide text-muted" scope="col"> </th>
                  <th className="px-5 py-3.5 text-[11.5px] font-bold uppercase tracking-wide text-accent" scope="col">TickKeep</th>
                  <th className="px-5 py-3.5 text-[11.5px] font-bold uppercase tracking-wide text-muted" scope="col">A typical paid tracker</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(([k, a, b]) => (
                  <tr key={k} className="border-b border-line/60 transition-colors last:border-0 hover:bg-accent/4">
                    <td className="px-5 py-3.5 text-[13px] font-bold text-ink">{k}</td>
                    <td className="px-5 py-3.5 text-[13px] font-medium text-accent">{a}</td>
                    <td className="px-5 py-3.5 text-[13px] text-muted">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function TheMath() {
  const [seats, setSeats] = useState(3);
  const [years, setYears] = useState(3);
  const [price, setPrice] = useState<11 | 16>(11);
  const monthly = seats * price;
  const yearly = monthly * 12;
  const total = yearly * years;
  return (
    <section id="math" className="border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <div className="grid items-start gap-12 lg:grid-cols-2">
          <Reveal>
            <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-amber">After the price hikes</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-[40px] sm:leading-[1.1]">
              Run the numbers yourself.
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink2">
              Paid trackers charge per seat, per month — and several jumped their prices by
              <strong className="text-ink"> 480–1500%</strong> after private-equity acquisitions.
              Slide to your team's shape and see what staying free is worth.
            </p>
            <div className="mt-8 space-y-6 rounded-xl border border-line bg-bg p-5 shadow-card sm:p-6">
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <label htmlFor="seats" className="text-[13px] font-semibold text-ink2">Seats on your team</label>
                  <span className="font-mono text-lg font-bold tabular text-ink">{seats}</span>
                </div>
                <input id="seats" type="range" min={1} max={25} value={seats} onChange={(e) => setSeats(Number(e.target.value))} className="w-full accent-[var(--tv-amber)]" />
              </div>
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <label htmlFor="years" className="text-[13px] font-semibold text-ink2">Years you'll keep tracking</label>
                  <span className="font-mono text-lg font-bold tabular text-ink">{years}</span>
                </div>
                <input id="years" type="range" min={1} max={10} value={years} onChange={(e) => setYears(Number(e.target.value))} className="w-full accent-[var(--tv-amber)]" />
              </div>
              <div>
                <p className="mb-2 text-[13px] font-semibold text-ink2">Typical paid-tracker seat price</p>
                <div className="flex gap-2">
                  {([11, 16] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPrice(p)}
                      aria-pressed={price === p}
                      className={cx(
                        "rounded-full border px-4 py-1.5 font-mono text-[13px] font-bold tabular transition-all",
                        price === p ? "border-amber bg-amber/15 text-amber" : "border-line text-muted hover:border-amber/50 hover:text-ink"
                      )}
                    >
                      ${p}/mo
                    </button>
                  ))}
                </div>
              </div>
              <div className="rule-dash border-t border-line pt-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="font-mono text-[12px] uppercase tracking-wide text-muted">You'd spend</p>
                    <p key={total} className="anim-rise font-mono text-4xl font-bold tabular leading-tight text-danger sm:text-[44px]">
                      ${total.toLocaleString()}
                    </p>
                    <p className="mt-1 font-mono text-[12.5px] tabular text-muted">${monthly}/mo · ${yearly.toLocaleString()}/yr</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[12px] uppercase tracking-wide text-muted">With TickKeep</p>
                    <p className="font-mono text-4xl font-bold tabular leading-tight text-accent sm:text-[44px]">$0</p>
                    <p className="mt-1 font-mono text-[12.5px] tabular text-muted">today</p>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-accent">No feature gates</p>
            <h3 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              What they lock. What you get.
            </h3>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink2">
              Reviewers constantly complain that the basics are paywalled elsewhere.
              Every one of these is included in TickKeep today:
            </p>
            <div className="mt-7 overflow-hidden rounded-xl border border-line bg-bg shadow-card">
              <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 border-b border-line bg-surface2/60 px-5 py-3">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Feature</span>
                <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Elsewhere</span>
              </div>
              {[
                ["Timer rounding rules", "$6–12/user/mo tier"],
                ["Timesheet locking (compliance)", "Admin add-on"],
                ["Advanced reports & exports", "Pro tier"],
                ["Invoice reminders & payments", "Paid plans"],
                ["Unlimited clients & projects", "Free-plan cap"],
                ["Full data export, always", "Often gated"],
              ].map(([feat, cost]) => (
                <div key={feat} className="grid grid-cols-[1fr_auto] items-center gap-x-4 border-b border-line/60 px-5 py-3.5 transition-colors last:border-0 hover:bg-accent/5">
                  <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
                    <I name="check" size={15} className="shrink-0 text-ok" />
                    {feat}
                  </span>
                  <span className="font-mono text-[12px] tabular text-muted line-through decoration-danger/60">{cost}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-muted">
              <I name="heart" size={15} className="mt-0.5 shrink-0 text-amber" />
              Donations are just a thank-you — everything above is included.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

const FAQS = [
  { q: "Is TickKeep actually free?", a: "Yes — TickKeep is free to use right now, for everyone, with every feature included. There's no account, no card, and no trial clock. Development is funded by optional donations, which are purely a thank-you." },
  { q: "Do I need an account?", a: "No. There is no sign-up, no email, no password, no onboarding tour. Open the app and start tracking. Your data is yours alone — we couldn't read it if we tried, because it never leaves your browser." },
  { q: "Where is my data stored?", a: "In your browser's local storage — a durable, on-device database. Time entries, clients, invoices and settings never touch a TickKeep server. The trade-off: clearing your browser data clears TickKeep, so use Settings → Data to export a JSON backup regularly — or connect the Sync page to a Drive or OneDrive folder." },
  { q: "Does it work offline?", a: "Yes. Once loaded, the entire app runs without a connection: the timer, manual entries, invoices, reports. A service worker keeps the shell cached so it even opens offline." },
  { q: "Can I send real invoices to clients?", a: "You can build invoices from unbilled time and expenses, add tax, discounts, notes and payment terms, then download a polished PDF with your business branding. Track status from draft to sent to paid — overdue is flagged automatically." },
  { q: "I already use another time tracker. Can I move?", a: "Yes. The Import page accepts TickKeep JSON backups and the standard CSV columns most trackers export (date, client, project, task, hours, billable, rate). Your history comes with you." },
  { q: "Can I use it on more than one device?", a: "Yes — the Sync page moves one backup file between this browser and a folder you control (a Google Drive or OneDrive desktop-sync folder works great). Pulling never overwrites your data without asking." },
  { q: "So what's the catch?", a: "There isn't one, but here's the deal in full: TickKeep is free to use for personal and commercial work, donation-funded, and built for independent people. If it saves you money and you feel like buying the developer a coffee, there's a Ko-fi link for that. No pressure, ever. The full terms live in the EULA." },
  { q: "Found a bug or want a feature?", a: "Tell me directly — email mamoonalshamali@gmail.com or reach out on LinkedIn. Bug reports and ideas from real users shape what gets built next." },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:py-24">
      <Reveal>
        <p className="text-center font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-accent">Straight answers</p>
        <h2 className="mt-3 text-center font-display text-3xl font-extrabold tracking-tight text-ink sm:text-[40px]">Questions, answered.</h2>
      </Reveal>
      <div className="mt-10 space-y-2.5">
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <Reveal key={f.q} delay={i * 40}>
              <div className={cx("overflow-hidden rounded-xl border transition-colors", isOpen ? "border-accent/50 bg-surface shadow-card" : "border-line bg-surface/60")}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="font-display text-[15.5px] font-bold text-ink">{f.q}</span>
                  <I name={isOpen ? "chevU" : "chevD"} size={17} className={cx("shrink-0 transition-colors", isOpen ? "text-accent" : "text-muted")} />
                </button>
                {isOpen && (
                  <p className="anim-rise px-5 pb-5 text-[14px] leading-relaxed text-ink2">{f.a}</p>
                )}
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

function DonationBand() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Reveal>
        <div className="relative overflow-hidden rounded-2xl border border-amber/40 bg-amber/10 px-6 py-10 sm:px-10">
          <div className="glow-amber pointer-events-none absolute -right-20 -top-20 h-70 w-70" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-amber">Donation-funded</p>
            <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-[36px] sm:leading-[1.12]">
              Free to use — that's the deal right now.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink2">
              No investors to answer to, no pricing page to optimize. If TickKeep earns you money
              and you'd like to keep it humming, a coffee goes a long way. If not — use it free.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {DONATIONS.map((d) => (
                <a
                  key={d.label}
                  href={d.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-amber px-4.5 text-sm font-semibold text-onamber shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
                >
                  <I name="coffee" size={16} />
                  {d.label}
                  <I name="ext" size={13} />
                </a>
              ))}
            </div>
            <p className="mt-4 text-[13px] text-muted">No obligation. No guilt. Just an open tip jar.</p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  const cols: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
    {
      title: "Product",
      links: [
        { label: "Dashboard", href: "#/app" },
        { label: "Timer", href: "#/app/timer" },
        { label: "Invoices", href: "#/app/invoices" },
        { label: "Reports", href: "#/app/reports" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Import your data", href: "#/app/import" },
        { label: "Sync across devices", href: "#/app/sync" },
        { label: "Calendar import", href: "#/app/calendar" },
      ],
    },
    {
      title: "Contact — bugs & ideas",
      links: [
        { label: "mamoonalshamali@gmail.com", href: "mailto:mamoonalshamali@gmail.com?subject=TickKeep%20%E2%80%94%20bug%20or%20feature%20idea" },
        { label: "LinkedIn ↗", href: "https://www.linkedin.com/in/mammon-alshamali-366b10406/" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy policy", href: "#/privacy" },
        { label: "Terms of service", href: "#/terms" },
      ],
    },
  ];
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr_1fr]">
        <div>
          <a href="#/" aria-label="TickKeep home"><Logo size={30} withWord /></a>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            The offline-first time tracker and invoice generator for independent people.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="green">Free now</Badge>
            <Badge tone="gray">EULA licensed</Badge>
          </div>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-muted">{c.title}</p>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    {...(l.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="text-sm font-medium break-all text-ink2 transition-colors hover:text-accent"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <p className="font-mono text-[11.5px] text-muted">© {new Date().getFullYear()} TickKeep · free to use · All Rights Reserved</p>
          <a href={DONATIONS[0].href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber transition-opacity hover:opacity-80">
            <I name="heart" size={14} /> Support TickKeep on Ko-fi
          </a>
        </div>
      </div>
    </footer>
  );
}
