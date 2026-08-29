import { useEffect, useRef, useState } from "react";
import { ACCENT_SWATCHES, INVOICE_TEMPLATES, useStore, type InvoiceTemplateId } from "../lib/store";
import { EMAIL_FIELD_LABELS } from "../lib/invoice";
import { I } from "../components/icons";
import {
  Button, Card, ConfirmDialog, Input, Segmented, Select, Tabs, Textarea, Toggle, useToast, navigate,
} from "../components/ui";
import { CURRENCIES, bytesLabel, cx, downloadFile, todayKey } from "../lib/utils";

type TabKey = "business" | "invoices" | "prefs" | "data" | "about";

export function SettingsPage() {
  const [tab, setTab] = useState<TabKey>("business");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Tabs
        active={tab}
        onChange={(t) => setTab(t as TabKey)}
        items={[
          { id: "business", label: "Business", icon: "briefcase" },
          { id: "invoices", label: "Invoices", icon: "invoice" },
          { id: "prefs", label: "Preferences", icon: "gear" },
          { id: "data", label: "Data", icon: "db" },
          { id: "about", label: "About", icon: "info" },
        ]}
      />
      {tab === "business" && <BusinessTab />}
      {tab === "invoices" && <InvoiceTab />}
      {tab === "prefs" && <PrefsTab />}
      {tab === "data" && <DataTab />}
      {tab === "about" && <AboutTab />}
    </div>
  );
}

/* ---------------- business ---------------- */

function BusinessTab() {
  const business = useStore((s) => s.business);
  const setBusiness = useStore((s) => s.setBusiness);
  const { push } = useToast();
  const logoRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(business.name);
  const [email, setEmail] = useState(business.email);
  const [phone, setPhone] = useState(business.phone);
  const [taxId, setTaxId] = useState(business.taxId);
  const [address, setAddress] = useState(business.address);

  useEffect(() => {
    setName(business.name);
    setEmail(business.email);
    setPhone(business.phone);
    setTaxId(business.taxId);
    setAddress(business.address);
  }, [business]);

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-ink">Business profile</h2>
      <p className="mt-1 text-sm text-muted">Appears in the header of every invoice and timesheet.</p>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setBusiness({ name: name.trim(), email: email.trim(), phone: phone.trim(), taxId: taxId.trim(), address: address.trim() });
          push({ kind: "ok", title: "Business profile saved" });
        }}
      >
        <div className="flex items-center gap-4">
          {business.logo ? (
            <img src={business.logo} alt="Business logo" className="h-14 w-14 rounded-xl border border-line object-contain" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface2 text-muted">
              <I name="briefcase" size={22} />
            </span>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" icon="upload" onClick={() => logoRef.current?.click()}>
              {business.logo ? "Replace logo" : "Upload logo"}
            </Button>
            {business.logo && (
              <Button type="button" variant="ghost" size="sm" icon="x" onClick={() => setBusiness({ logo: undefined })}>
                Remove
              </Button>
            )}
          </div>
          <input
            ref={logoRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Upload business logo"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (!f.type.startsWith("image/")) {
                push({ kind: "err", title: "Logo must be an image" });
                return;
              }
              if (f.size > 400 * 1024) {
                push({ kind: "err", title: "Image too large", desc: "Keep the logo under 400 KB." });
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                setBusiness({ logo: String(reader.result) });
                push({ kind: "ok", title: "Logo attached" });
              };
              reader.readAsDataURL(f);
            }}
          />
        </div>
        <Input label="Business name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Juniper Studio" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <Input label="Tax ID / VAT" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="Optional" />
        <Textarea label="Address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city — shown on invoices" />
        <div className="flex justify-end">
          <Button type="submit" icon="check">Save profile</Button>
        </div>
      </form>
    </Card>
  );
}

/* ---------------- invoice defaults ---------------- */

function TemplateThumb({ id, accent }: { id: InvoiceTemplateId; accent: string }) {
  if (id === "classic")
    return (
      <svg viewBox="0 0 120 64" className="w-full rounded-md border border-line bg-white" aria-hidden="true">
        <line x1="14" y1="10" x2="106" y2="10" stroke={accent} strokeWidth="2" />
        <rect x="42" y="16" width="36" height="5" rx="1" fill="#1c1917" />
        <rect x="48" y="24" width="24" height="3" rx="1" fill="#a8a29e" />
        {[36, 42, 48, 54].map((y) => (
          <rect key={y} x="14" y={y} width="92" height="3.5" rx="1" fill={y % 12 === 0 ? accent : "#e7e5e4"} opacity={y === 36 ? 0.9 : 1} />
        ))}
      </svg>
    );
  if (id === "bold")
    return (
      <svg viewBox="0 0 120 64" className="w-full rounded-md border border-line" aria-hidden="true">
        <rect width="120" height="22" fill="#121b16" />
        <rect y="22" width="120" height="2.5" fill={accent} />
        <rect x="10" y="8" width="30" height="6" rx="1" fill="#fff" />
        <rect x="80" y="8" width="30" height="6" rx="1" fill={accent} />
        {[32, 40, 48].map((y) => (
          <rect key={y} x="10" y={y} width="100" height="4" rx="1" fill="#e7e5e4" />
        ))}
      </svg>
    );
  return (
    <svg viewBox="0 0 120 64" className="w-full rounded-md border border-line bg-white" aria-hidden="true">
      <rect width="120" height="5" fill={accent} />
      <rect x="10" y="12" width="34" height="6" rx="1" fill="#15201a" />
      <rect x="82" y="12" width="28" height="6" rx="1" fill={accent} />
      {[28, 36, 44].map((y, i) => (
        <rect key={y} x="10" y={y} width="100" height="4.5" rx="1" fill={i % 2 ? "#f1f5f0" : "#e2e8e0"} />
      ))}
      <rect x="70" y="52" width="40" height="5" rx="1" fill={accent} opacity="0.85" />
    </svg>
  );
}

function InvoiceTab() {
  const d = useStore((s) => s.invDefaults);
  const setInvDefaults = useStore((s) => s.setInvDefaults);
  const { push } = useToast();

  const [prefix, setPrefix] = useState(d.prefix);
  const [nextNumber, setNextNumber] = useState(String(d.nextNumber));
  const [taxRate, setTaxRate] = useState(String(d.taxRate));
  const [currency, setCurrency] = useState(d.currency);
  const [paymentDays, setPaymentDays] = useState(String(d.paymentDays));
  const [terms, setTerms] = useState(d.terms);
  const [notes, setNotes] = useState(d.notes);
  const [templateId, setTemplateId] = useState(d.templateId);
  const [accent, setAccent] = useState(d.accent);
  const [paymentDetails, setPaymentDetails] = useState(d.paymentDetails);
  const [emailSubject, setEmailSubject] = useState(d.emailSubject);
  const [emailBody, setEmailBody] = useState(d.emailBody);

  useEffect(() => {
    setPrefix(d.prefix);
    setNextNumber(String(d.nextNumber));
    setTaxRate(String(d.taxRate));
    setCurrency(d.currency);
    setPaymentDays(String(d.paymentDays));
    setTerms(d.terms);
    setNotes(d.notes);
    setTemplateId(d.templateId);
    setAccent(d.accent);
    setPaymentDetails(d.paymentDetails);
    setEmailSubject(d.emailSubject);
    setEmailBody(d.emailBody);
  }, [d]);

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-ink">Template & brand</h2>
        <p className="mt-1 text-sm text-muted">The letterhead every new invoice starts with — override per invoice anytime.</p>
        <div className="mt-4 grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Default invoice template">
          {INVOICE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={templateId === t.id}
              onClick={() => setTemplateId(t.id)}
              className={cx(
                "rounded-lg border p-2.5 text-left transition-all active:scale-95",
                templateId === t.id ? "border-accent bg-accent/8 ring-2 ring-accent/30" : "border-line hover:border-accent/50"
              )}
            >
              <TemplateThumb id={t.id} accent={accent} />
              <span className={cx("mt-2 block text-[12.5px] font-bold", templateId === t.id ? "text-accent" : "text-ink")}>{t.name}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">{t.desc}</span>
            </button>
          ))}
        </div>
        <p className="mb-1.5 mt-4 text-[12.5px] font-semibold text-ink2">Accent color</p>
        <div className="flex flex-wrap gap-2">
          {ACCENT_SWATCHES.map((c) => (
            <button
              key={c}
              onClick={() => setAccent(c)}
              aria-label={`Accent color ${c}`}
              className={cx("h-8 w-8 rounded-full transition-transform hover:scale-110 active:scale-95", accent === c && "ring-2 ring-ink ring-offset-2 ring-offset-surface")}
              style={{ background: c }}
            />
          ))}
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-ink">Numbering & defaults</h2>
        <p className="mt-1 text-sm text-muted">The small print for new invoices.</p>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setInvDefaults({
              prefix: prefix.trim() || "INV-",
              nextNumber: Math.max(1, parseInt(nextNumber, 10) || 1),
              taxRate: Math.max(0, parseFloat(taxRate) || 0),
              currency,
              paymentDays: Math.max(0, parseInt(paymentDays, 10) || 14),
              terms: terms.trim(),
              notes: notes.trim(),
              templateId,
              accent,
              paymentDetails: paymentDetails.trim(),
              emailSubject: emailSubject.trim() || "Invoice {{invoice_number}}",
              emailBody,
            });
            push({ kind: "ok", title: "Invoice defaults saved" });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Number prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} hint="e.g. INV- → INV-0007" />
            <Input label="Next number" type="number" min={1} value={nextNumber} onChange={(e) => setNextNumber(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Default tax (%)" type="number" min={0} step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            <Select label="Default currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input label="Payment terms (days)" type="number" min={0} value={paymentDays} onChange={(e) => setPaymentDays(e.target.value)} />
          </div>
          <Textarea label="Default payment details" value={paymentDetails} onChange={(e) => setPaymentDetails(e.target.value)} placeholder="Bank account, IBAN, payment reference…" />
          <Textarea label="Default terms" value={terms} onChange={(e) => setTerms(e.target.value)} />
          <Textarea label="Default notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

          <div className="rounded-xl border border-line bg-surface2/40 p-4">
            <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
              <I name="mail" size={15} className="text-accent" /> Email template
            </h3>
            <p className="mt-0.5 text-[12px] text-muted">Pre-fills the “Send by email” composer. Merge fields fill themselves per invoice.</p>
            <div className="mt-3 space-y-3">
              <Input label="Subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[12px] font-semibold text-ink2">Body</span>
                  {EMAIL_FIELD_LABELS.map(([key, label]) => (
                    <button
                      type="button"
                      key={key}
                      onClick={() => setEmailBody((b) => b + `{{${key}}}`)}
                      className="rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-[10.5px] font-semibold text-ink2 transition-all hover:border-accent/60 hover:text-accent active:scale-95"
                    >
                      +{label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={7}
                  aria-label="Default email body"
                  className="w-full rounded-lg border border-line bg-surface px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[12.5px] text-muted">
              Next invoice: <span className="font-semibold text-ink">{(prefix.trim() || "INV-")}{String(Math.max(1, parseInt(nextNumber, 10) || 1)).padStart(4, "0")}</span>
            </p>
            <Button type="submit" icon="check">Save defaults</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/* ---------------- preferences ---------------- */

function PrefsTab() {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const { push } = useToast();

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-ink">Preferences</h2>
      <p className="mt-1 text-sm text-muted">Applied instantly, stored on this device.</p>
      <div className="mt-5 space-y-6">
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink2">Theme</p>
          <Segmented
            label="Theme"
            value={prefs.theme}
            onChange={(v) => {
              setPrefs({ theme: v });
              push({ kind: "info", title: `Theme: ${v}` });
            }}
            options={[
              { value: "light", label: "Light" },
              { value: "system", label: "System" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink2">Week starts on</p>
          <Segmented
            label="Week start"
            value={String(prefs.weekStart) as "0" | "1"}
            onChange={(v) => setPrefs({ weekStart: v === "0" ? 0 : 1 })}
            options={[
              { value: "1", label: "Monday" },
              { value: "0", label: "Sunday" },
            ]}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Toggle checked={prefs.compact} onChange={(v) => setPrefs({ compact: v })} label="Compact entry rows" hint="Tighter spacing in time entry lists" />
          <Toggle checked={prefs.timerSound} onChange={(v) => setPrefs({ timerSound: v })} label="Timer chime" hint="A soft two-note chime on punch in/out" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="mb-1 block text-[12px] font-semibold text-ink2">Timer rounding</p>
            <select
              aria-label="Timer rounding"
              value={String(prefs.roundingMin)}
              onChange={(e) => setPrefs({ roundingMin: Number(e.target.value) as 0 | 5 | 15 | 30 })}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="0">Off</option>
              <option value="5">Round up to 5 min</option>
              <option value="15">Round up to 15 min</option>
              <option value="30">Round up to 30 min</option>
            </select>
          </div>
          <div>
            <p className="mb-1 block text-[12px] font-semibold text-ink2">Idle timer warning</p>
            <input
              type="number"
              min={0}
              step={15}
              value={prefs.idleWarnMin}
              onChange={(e) => setPrefs({ idleWarnMin: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              aria-label="Warn when the timer runs longer than this many minutes"
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-[11.5px] text-muted">Minutes before a nudge (0 = off).</p>
          </div>
          <div>
            <p className="mb-1 block text-[12px] font-semibold text-ink2">Idle auto-stop</p>
            <select
              aria-label="Offer to trim the timer after this many idle minutes"
              value={String(prefs.autoStopMin)}
              onChange={(e) => setPrefs({ autoStopMin: Number(e.target.value) })}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="0">Off</option>
              <option value="15">After 15 min away</option>
              <option value="30">After 30 min away</option>
              <option value="60">After 1 hour away</option>
              <option value="120">After 2 hours away</option>
            </select>
          </div>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink2">Required fields</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle checked={prefs.requireProject} onChange={(v) => setPrefs({ requireProject: v })} label="Every entry needs a project" hint="Blocks saving entries without one" />
            <Toggle checked={prefs.requireDescription} onChange={(v) => setPrefs({ requireDescription: v })} label="Every entry needs a description" hint="Keeps the ledger readable for invoices" />
          </div>
        </div>
        <div className="max-w-sm">
          <p className="mb-1 block text-[12px] font-semibold text-ink2">Timesheet lock</p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={prefs.lockBeforeDate ?? ""}
              onChange={(e) => setPrefs({ lockBeforeDate: e.target.value || null })}
              aria-label="Lock entries before this date"
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
            />
            {prefs.lockBeforeDate && (
              <Button variant="ghost" size="sm" icon="x" onClick={() => setPrefs({ lockBeforeDate: null })}>
                Unlock
              </Button>
            )}
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-muted">
            Entries dated before this day become read-only — compliance-safe history, free of charge.
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- data ---------------- */

function DataTab() {
  const exportData = useStore((s) => s.exportData);
  const importData = useStore((s) => s.importData);
  const clearLedger = useStore((s) => s.clearLedger);
  const loadSample = useStore((s) => s.loadSample);
  const { push } = useToast();

  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; data: unknown } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmSample, setConfirmSample] = useState(false);

  const size = bytesLabel(new Blob([exportData()]).size);

  const onFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setPending({ name: file.name, data: JSON.parse(String(reader.result)) });
      } catch {
        push({ kind: "err", title: "Couldn't read that file", desc: "It isn't valid JSON." });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-ink">Your data</h2>
        <p className="mt-1 text-sm text-muted">
          Everything lives in this browser's storage — currently about <strong className="font-semibold text-ink">{size}</strong>.
          Export regularly; clearing browser data clears TickKeep.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Button
            icon="download"
            onClick={() => {
              downloadFile(`tickkeep-backup-${todayKey()}.json`, exportData(), "application/json");
              push({ kind: "ok", title: "Backup downloaded", desc: "Keep it somewhere safe." });
            }}
          >
            Export JSON backup
          </Button>
          <Button variant="outline" icon="upload" onClick={() => fileRef.current?.click()}>
            Import backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Import backup file"
            onChange={(e) => {
              onFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <Button variant="ghost" icon="upload" onClick={() => navigate("#/app/import")}>
            Import time CSV…
          </Button>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-ink">Sample & reset</h2>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button variant="soft" icon="box" onClick={() => setConfirmSample(true)}>Load sample data</Button>
          <Button variant="danger" icon="trash" onClick={() => setConfirmClear(true)}>Clear all data</Button>
        </div>
        <p className="mt-3 text-[13px] text-muted">
          Clearing removes clients, projects, entries, invoices, expenses and estimates. Preferences survive.
        </p>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={`Import “${pending?.name}”?`}
        desc="Importing replaces your current ledger with the backup's contents."
        confirmLabel="Replace data"
        onConfirm={() => {
          if (!pending) return;
          const err = importData(pending.data);
          if (err) push({ kind: "err", title: "Import failed", desc: err });
          else push({ kind: "ok", title: "Backup imported", desc: "Welcome back — everything's here." });
          setPending(null);
        }}
      />
      <ConfirmDialog
        open={confirmSample}
        onClose={() => setConfirmSample(false)}
        title="Load sample data?"
        desc="This replaces your current ledger with two demo clients, four projects and two weeks of entries."
        confirmLabel="Load sample"
        onConfirm={() => {
          loadSample();
          push({ kind: "ok", title: "Sample data loaded" });
        }}
      />
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear ALL TickKeep data?"
        desc="Every client, project, entry, invoice and expense on this device will be permanently deleted. Export a backup first if you're unsure."
        confirmLabel="Delete everything"
        onConfirm={() => {
          clearLedger();
          push({ kind: "info", title: "All data cleared", desc: "A fresh ledger awaits." });
        }}
      />
    </div>
  );
}

/* ---------------- about ---------------- */

const DONATIONS = [
  { label: "Ko-fi", href: "https://ko-fi.com/mammonalshamali" },
];

/* Detects PWA install state so we can show the right affordance (Problem 14). */
function InstallStateCard() {
  const [installed, setInstalled] = useState(false);
  const [promptEvt, setPromptEvt] = useState<unknown>(null);

  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvt(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed) {
    return (
      <Card className="flex items-center gap-3 border-accent/30 bg-accent/5 p-4">
        <I name="check" size={18} className="text-accent" />
        <p className="text-sm text-ink2">
          <strong className="text-ink">Running as an installed app.</strong> TickKeep works fully offline from your home screen / app list.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-wrap items-center gap-3 p-4">
      <I name="download" size={18} className="text-accent" />
      <p className="min-w-0 flex-1 text-sm text-ink2">
        <strong className="text-ink">Install TickKeep</strong> for one-tap, offline access — it runs like a native app.
      </p>
      {promptEvt ? (
        <Button
          size="sm"
          icon="download"
          onClick={() => {
            const evt = promptEvt as { prompt: () => void };
            evt.prompt();
            setPromptEvt(null);
          }}
        >
          Install now
        </Button>
      ) : (
        <span className="text-[12px] text-muted">
          On Safari iOS: Share → “Add to Home Screen”. On desktop Chrome/Edge: the install icon in the address bar.
        </span>
      )}
    </Card>
  );
}

function AboutTab() {
  return (
    <div className="space-y-4">
      <InstallStateCard />
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">About TickKeep</h2>
            <p className="mt-1 font-mono text-[12.5px] text-muted">v1.0.0 · EULA licensed · static, serverless, yours</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-ok/10 px-3 py-1 text-[12.5px] font-semibold text-ok">
            <I name="shield" size={14} /> No telemetry
          </span>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink2">
          TickKeep is a free, offline-first time tracker and invoice generator for freelancers and tiny studios.
          All data stays in your browser; exports are one click away.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-ink2">
          <li className="flex items-center gap-2.5">
            <I name="file" size={15} className="shrink-0 text-accent" />
            <button onClick={() => navigate("#/privacy")} className="font-semibold text-accent hover:underline">Privacy policy</button>
            <span className="text-muted">— we can't spy on you; there's no server.</span>
          </li>
          <li className="flex items-center gap-2.5">
            <I name="file" size={15} className="shrink-0 text-accent" />
            <button onClick={() => navigate("#/terms")} className="font-semibold text-accent hover:underline">Terms of service</button>
            <span className="text-muted">— short, honest, no gotchas.</span>
          </li>
          <li className="flex items-center gap-2.5">
            <I name="info" size={15} className="shrink-0 text-accent" />
            <span>Currency conversion rates, when used, come from <span className="font-mono text-[13px]">open.er-api.com</span> with gratitude.</span>
          </li>
        </ul>
      </Card>

      <Card className="border-amber/40 bg-amber/8 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber/20 text-amber">
            <I name="heart" size={22} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-ink">Keep the lights on</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink2">
              TickKeep is free to use and has no investors. If it's earning you money, consider chipping in.
              If not, keep using it — that's the whole deal.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {DONATIONS.map((dn) => (
                <a
                  key={dn.label}
                  href={dn.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber px-4 text-sm font-semibold text-onamber shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
                >
                  <I name="coffee" size={15} />
                  {dn.label}
                  <I name="ext" size={12} />
                </a>
              ))}
            </div>
            <p className="mt-3 text-[12.5px] text-muted">No obligation, no guilt. Just an open tip jar.</p>
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
            <I name="mail" size={21} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-ink">Bugs & feature ideas</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink2">
              Found something broken, or wish TickKeep did one more thing? Tell me directly — it shapes what gets built next.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href="mailto:mamoonalshamali@gmail.com?subject=TickKeep%20%E2%80%94%20bug%20or%20feature%20idea"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink transition-all hover:border-accent/60 hover:text-accent active:scale-[0.98]"
              >
                <I name="mail" size={15} />
                mamoonalshamali@gmail.com
              </a>
              <a
                href="https://www.linkedin.com/in/mammon-alshamali-366b10406/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink transition-all hover:border-accent/60 hover:text-accent active:scale-[0.98]"
              >
                <I name="users" size={15} />
                LinkedIn
                <I name="ext" size={12} />
              </a>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
