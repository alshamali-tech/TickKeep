import { useEffect, useMemo, useState } from "react";
import {
  ACCENT_SWATCHES, INVOICE_TEMPLATES, PAYMENT_METHODS,
  billedEntryIds, billedExpenseIds, entryAmount, invoiceBalance, invoicePaidAmount, minutesSum,
  useStore,
  type Invoice, type InvoiceItem, type InvoiceTemplateId, type PaymentMethod, type RecurFrequency, type RecurringTemplate,
} from "../lib/store";
import {
  computeTotals, derivedStatus, emailVarsFor, entryToItem, expenseToItem, fillTemplate,
  invoicePdf, EMAIL_FIELD_LABELS,
} from "../lib/invoice";
import { I } from "../components/icons";
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, Input, Menu, Modal, Pagination, Segmented,
  Select, Textarea, statusBadge, useToast, navigate,
} from "../components/ui";
import { InvoiceDocument } from "./invoiceDoc";
import {
  addDays, cx, daysBetween, downloadFile, fmtDate, fmtH, fmtHL, money, parseKey, round2, toKey, todayKey, uid,
} from "../lib/utils";

const safeDecode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function InvoicesPage({ path }: { path: string }) {
  // Tolerant: older invoice IDs contained ":" and "." — capture the whole segment.
  const m = path.match(/^#\/app\/invoices\/([^/?#]+)\/?$/);
  if (m) return <InvoiceDetail id={safeDecode(m[1])} />;
  return <InvoicesRoot />;
}

function InvoicesRoot() {
  const [view, setView] = useState<"invoices" | "recurring">("invoices");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold text-ink sm:text-2xl">
          {view === "invoices" ? "Invoices" : "Recurring profiles"}
        </h2>
        <Segmented
          label="Invoices view"
          value={view}
          onChange={setView}
          options={[
            { value: "invoices", label: "Invoices" },
            { value: "recurring", label: "Recurring" },
          ]}
        />
      </div>
      {view === "invoices" ? <InvoiceList /> : <RecurringView />}
    </div>
  );
}

/* ================= list ================= */

function InvoiceList() {
  const invoices = useStore((s) => s.invoices);
  const clients = useStore((s) => s.clients);
  const entries = useStore((s) => s.entries);
  const expenses = useStore((s) => s.expenses);
  const deleteInvoice = useStore((s) => s.deleteInvoice);
  const loadSample = useStore((s) => s.loadSample);
  const invDefaults = useStore((s) => s.invDefaults);
  const { push } = useToast();

  const [filter, setFilter] = useState<"all" | "draft" | "sent" | "paid" | "overdue" | "void">("all");
  const [page, setPage] = useState(1);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Invoice | null>(null);

  const billedE = useMemo(() => billedEntryIds(invoices), [invoices]);
  const billedX = useMemo(() => billedExpenseIds(invoices), [invoices]);
  const unbilledCount =
    entries.filter((e) => e.billable && !billedE.has(e.id)).length +
    expenses.filter((x) => x.billable && !billedX.has(x.id)).length;

  /* Pagination: keeps the table light even with thousands of invoices. */
  const PAGE_SIZE = 25;

  const rows = useMemo(() => {
    const list = invoices
      .map((inv) => ({ inv, ds: derivedStatus(inv) }))
      .filter((r) => filter === "all" || r.ds === filter)
      .sort((a, b) => b.inv.issueDate.localeCompare(a.inv.issueDate));
    return list;
  }, [invoices, filter]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rows, safePage]
  );

  const moneySnapshot = useMemo(() => {
    let outstanding = 0;
    let collected = 0;
    let taxYtd = 0;
    const year = String(new Date().getFullYear());
    for (const inv of invoices) {
      if (inv.status === "void") continue;
      const { total, taxAmount } = computeTotals(inv.items, inv.taxRate, inv.discount);
      outstanding += invoiceBalance(inv);
      collected += invoicePaidAmount(inv);
      if (inv.issueDate.startsWith(year)) taxYtd += taxAmount;
      void total;
    }
    return { outstanding, collected, taxYtd, cur: invDefaults.currency };
  }, [invoices, invDefaults.currency]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: invoices.length, draft: 0, sent: 0, paid: 0, overdue: 0, void: 0 };
    for (const { ds } of invoices.map((inv) => ({ ds: derivedStatus(inv) }))) c[ds]++;
    return c;
  }, [invoices]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented
          label="Filter invoices"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: `All · ${counts.all}` },
            { value: "draft", label: `Draft · ${counts.draft}` },
            { value: "sent", label: `Sent · ${counts.sent}` },
            { value: "paid", label: `Paid · ${counts.paid}` },
            { value: "overdue", label: `Overdue · ${counts.overdue}` },
            { value: "void", label: `Void · ${counts.void}` },
          ]}
        />
        <span className="ml-auto" />
        <Button icon="plus" onClick={() => setWizardOpen(true)}>New invoice</Button>
      </div>

      {invoices.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: "Outstanding", value: money(moneySnapshot.outstanding, moneySnapshot.cur), icon: "wallet" as const, cls: "text-amber" },
            { label: "Collected", value: money(moneySnapshot.collected, moneySnapshot.cur), icon: "check" as const, cls: "text-ok" },
            { label: `Tax · ${new Date().getFullYear()} YTD`, value: money(moneySnapshot.taxYtd, moneySnapshot.cur), icon: "invoice" as const, cls: "text-info" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3.5 rounded-xl border border-line bg-surface px-4.5 py-3.5 shadow-card">
              <I name={s.icon} size={19} className={cx("shrink-0", s.cls)} />
              <div className="min-w-0">
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{s.label}</p>
                <p className="truncate font-mono text-[19px] font-semibold tabular leading-tight text-ink">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {unbilledCount > 0 && filter === "all" && (
        <button
          onClick={() => setWizardOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-accent/50 bg-accent/6 px-4.5 py-3.5 text-left transition-all hover:border-accent hover:bg-accent/10"
        >
          <I name="zap" size={17} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1 text-[13.5px] font-medium text-ink2">
            <strong className="font-bold text-ink">{unbilledCount}</strong> unbilled {unbilledCount === 1 ? "item is" : "items are"} waiting on an invoice.
          </span>
          <span className="shrink-0 text-[13px] font-bold text-accent">Invoice them →</span>
        </button>
      )}

      {invoices.length === 0 ? (
        <EmptyState
          icon="invoice"
          title="No invoices yet"
          desc="Turn tracked, billable time into a branded PDF your client can actually pay."
        >
          <Button icon="plus" onClick={() => setWizardOpen(true)}>Create your first invoice</Button>
          <Button variant="ghost" icon="box" onClick={() => { loadSample(); push({ kind: "ok", title: "Sample data loaded" }); }}>
            Load sample data
          </Button>
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon="filter" title="Nothing in this bucket" desc="Try a different status filter." />
      ) : (
        <>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-surface2/50">
                {["Number", "Client", "Issued", "Due", "Status", "Total", "Balance", ""].map((h, i) => (
                  <th
                    key={h || "actions"}
                    scope="col"
                    className={cx(
                      "px-5 py-3 text-[12px] font-semibold uppercase tracking-wide text-muted",
                      ["Total", "Balance"].includes(h) && "text-right",
                      i === 7 && "w-12 px-2"
                    )}
                  >
                    {h || <span className="sr-only">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map(({ inv, ds }) => {
                const client = clients.find((c) => c.id === inv.clientId);
                const { total } = computeTotals(inv.items, inv.taxRate, inv.discount);
                const balance = invoiceBalance(inv);
                const sb = statusBadge(ds);
                return (
                  <tr
                    key={inv.id}
                    className="cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-surface2/40"
                    onClick={() => navigate(`#/app/invoices/${inv.id}`)}
                  >
                    <td className="px-5 py-3.5 font-mono text-[13px] font-bold tabular text-accent">{inv.number}</td>
                    <td className="max-w-40 truncate px-5 py-3.5 text-sm font-medium text-ink">{client?.name ?? "—"}</td>
                    <td className="px-5 py-3.5 text-[13px] text-ink2 whitespace-nowrap">{fmtDate(inv.issueDate)}</td>
                    <td className={cx("px-5 py-3.5 text-[13px] whitespace-nowrap", ds === "overdue" ? "font-semibold text-danger" : "text-ink2")}>
                      {fmtDate(inv.dueDate)}
                      {ds === "overdue" && (
                        <span className="ml-2 rounded bg-danger/10 px-1.5 py-0.5 font-mono text-[10.5px] font-bold tabular text-danger">
                          {daysBetween(inv.dueDate, todayKey())}d late
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5"><Badge tone={sb.tone}>{sb.label}</Badge></td>
                    <td className="px-5 py-3.5 text-right font-mono text-sm font-semibold tabular text-ink">{money(total, inv.currency)}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-sm tabular">
                      {balance > 0.005 ? <span className="font-semibold text-amber">{money(balance, inv.currency)}</span> : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-2 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <Menu
                        label={`Actions for ${inv.number}`}
                        items={[
                          { label: "Open", icon: "invoice", onClick: () => navigate(`#/app/invoices/${inv.id}`) },
                          { label: "Delete", icon: "trash", danger: true, onClick: () => setToDelete(inv) },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div className="mt-3 flex justify-end">
            <Pagination page={safePage} pages={pageCount} onPage={setPage} summary="invoices" />
          </div>
        )}
        </>
      )}

      <InvoiceWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={`Delete ${toDelete?.number}?`}
        desc="The invoice is removed. The time entries it referenced become unbilled again."
        onConfirm={() => {
          if (toDelete) {
            deleteInvoice(toDelete.id);
            push({ kind: "info", title: `${toDelete.number} deleted` });
          }
        }}
      />
    </div>
  );
}

/* ================= wizard ================= */

function InvoiceWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const entries = useStore((s) => s.entries);
  const expenses = useStore((s) => s.expenses);
  const invoices = useStore((s) => s.invoices);
  const clients = useStore((s) => s.clients);
  const tasks = useStore((s) => s.tasks);
  const invDefaults = useStore((s) => s.invDefaults);
  const createInvoice = useStore((s) => s.createInvoice);
  const { push } = useToast();

  const billedE = useMemo(() => billedEntryIds(invoices), [invoices]);
  const billedX = useMemo(() => billedExpenseIds(invoices), [invoices]);
  const unbilledEntries = useMemo(() => entries.filter((e) => e.billable && !billedE.has(e.id)).sort((a, b) => b.date.localeCompare(a.date)), [entries, billedE]);
  const unbilledExpenses = useMemo(() => expenses.filter((x) => x.billable && !billedX.has(x.id)).sort((a, b) => b.date.localeCompare(a.date)), [expenses, billedX]);

  const [selE, setSelE] = useState<Set<string>>(new Set());
  const [selX, setSelX] = useState<Set<string>>(new Set());
  const [clientId, setClientId] = useState("");
  const [issueDate, setIssueDate] = useState(todayKey());
  const [dueDate, setDueDate] = useState("");
  const [taxRate, setTaxRate] = useState("0");

  useEffect(() => {
    if (!open) return;
    setSelE(new Set());
    setSelX(new Set());
    setClientId(clients[0]?.id ?? "");
    setIssueDate(todayKey());
    setDueDate(toKey(addDays(new Date(), invDefaults.paymentDays)));
    setTaxRate(String(invDefaults.taxRate));
  }, [open, clients, invDefaults]);

  const chosenTotal = useMemo(() => {
    let t = 0;
    for (const e of unbilledEntries) if (selE.has(e.id)) t += entryAmount(e);
    for (const x of unbilledExpenses) if (selX.has(x.id)) t += x.amount;
    const tax = Math.max(0, parseFloat(taxRate) || 0);
    return round2(t * (1 + tax / 100));
  }, [unbilledEntries, unbilledExpenses, selE, selX, taxRate]);

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const create = () => {
    if (selE.size === 0 && selX.size === 0) {
      push({ kind: "err", title: "Pick at least one item" });
      return;
    }
    const inv = createInvoice({
      clientId: clientId || null,
      entryIds: [...selE],
      expenseIds: [...selX],
      issueDate,
      dueDate,
      taxRate: Math.max(0, parseFloat(taxRate) || 0),
      discount: 0,
      currency: invDefaults.currency,
    });
    push({ kind: "ok", title: `${inv.number} created`, desc: `${selE.size + selX.size} items · draft` });
    onClose();
    navigate(`#/app/invoices/${inv.id}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New invoice"
      wide
      footer={
        <>
          <span className="mr-auto font-mono text-[13px] font-semibold tabular text-ink">
            {money(chosenTotal, invDefaults.currency)} <span className="font-normal text-muted">total</span>
          </span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon="invoice" onClick={create} disabled={selE.size + selX.size === 0}>Create draft</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-4">
          <Select label="Client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">No client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="Issue date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Input label="Tax (%)" type="number" min={0} step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
        </div>

        <div>
          <p className="mb-1.5 text-[12.5px] font-semibold text-ink2">
            Unbilled time <span className="font-mono text-muted">({unbilledEntries.length})</span>
          </p>
          {unbilledEntries.length === 0 ? (
            <p className="rounded-lg bg-surface2/60 px-3.5 py-3 text-[12.5px] text-muted">All billable time is already invoiced. 🎉</p>
          ) : (
            <ul className="max-h-56 divide-y divide-line/60 overflow-y-auto rounded-lg border border-line">
              {unbilledEntries.map((e) => (
                <li key={e.id}>
                  <button
                    role="checkbox"
                    aria-checked={selE.has(e.id)}
                    aria-label={`Select entry: ${e.description || "time entry"}`}
                    onClick={() => toggle(selE, e.id, setSelE)}
                    className={cx(
                      "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                      selE.has(e.id) ? "bg-accent/8" : "hover:bg-surface2/50"
                    )}
                  >
                    <span className={cx(
                      "flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border",
                      selE.has(e.id) ? "border-accent bg-accent text-onaccent" : "border-line bg-surface"
                    )}>
                      {selE.has(e.id) && <I name="check" size={11} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{e.description || "Untitled"}</span>
                    <span className="font-mono text-[11.5px] tabular text-muted">{fmtDate(e.date)}</span>
                    <span className="w-12 text-right font-mono text-[12px] tabular text-ink2">{fmtH(e.durationMin)}</span>
                    <span className="w-18 text-right font-mono text-[12px] font-semibold tabular text-ink">{money(entryAmount(e), invDefaults.currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {unbilledExpenses.length > 0 && (
          <div>
            <p className="mb-1.5 text-[12.5px] font-semibold text-ink2">
              Unbilled expenses <span className="font-mono text-muted">({unbilledExpenses.length})</span>
            </p>
            <ul className="max-h-40 divide-y divide-line/60 overflow-y-auto rounded-lg border border-line">
              {unbilledExpenses.map((x) => (
                <li key={x.id}>
                  <button
                    role="checkbox"
                    aria-checked={selX.has(x.id)}
                    aria-label={`Select expense: ${x.notes || x.category}`}
                    onClick={() => toggle(selX, x.id, setSelX)}
                    className={cx(
                      "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                      selX.has(x.id) ? "bg-accent/8" : "hover:bg-surface2/50"
                    )}
                  >
                    <span className={cx(
                      "flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border",
                      selX.has(x.id) ? "border-accent bg-accent text-onaccent" : "border-line bg-surface"
                    )}>
                      {selX.has(x.id) && <I name="check" size={11} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{x.notes || x.category}</span>
                    <span className="font-mono text-[11.5px] tabular text-muted">{fmtDate(x.date)}</span>
                    <span className="w-18 text-right font-mono text-[12px] font-semibold tabular text-ink">{money(x.amount, x.currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ================= detail ================= */

function InvoiceDetail({ id }: { id: string }) {
  const inv = useStore((s) => s.invoices.find((i) => i.id === id));
  const client = useStore((s) => s.clients.find((c) => c.id === inv?.clientId));
  const business = useStore((s) => s.business);
  const invDefaults = useStore((s) => s.invDefaults);
  const updateInvoice = useStore((s) => s.updateInvoice);
  const setInvoiceStatus = useStore((s) => s.setInvoiceStatus);
  const duplicateInvoice = useStore((s) => s.duplicateInvoice);
  const { push } = useToast();

  const [emailOpen, setEmailOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const templateId = (inv?.templateId ?? invDefaults.templateId) as InvoiceTemplateId;
  const accent = inv?.accent ?? invDefaults.accent;
  const paymentDetails = inv?.paymentDetails ?? invDefaults.paymentDetails;

  if (!inv) {
    return (
      <EmptyState icon="invoice" title="Invoice not found" desc="It may have been deleted on another device.">
        <Button onClick={() => navigate("#/app/invoices")}>Back to invoices</Button>
      </EmptyState>
    );
  }

  const ds = derivedStatus(inv);
  const { total } = computeTotals(inv.items, inv.taxRate, inv.discount);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="ghost" size="sm" icon="chevL" onClick={() => navigate("#/app/invoices")}>Invoices</Button>
        <span className="font-mono text-[13px] font-bold tabular text-accent">{inv.number}</span>
        <Badge tone={statusBadge(ds).tone}>{statusBadge(ds).label}</Badge>
        <span className="ml-auto" />
        <Button variant="outline" icon="download" size="sm" onClick={async () => {
          await invoicePdf(inv, client ?? null, business, templateId, accent, paymentDetails);
          push({ kind: "ok", title: "PDF downloaded", desc: `${inv.number}.pdf` });
        }}>
          PDF
        </Button>
        <Button variant="outline" icon="print" size="sm" onClick={() => window.print()}>Print</Button>
        <Button variant="outline" icon="mail" size="sm" onClick={() => setEmailOpen(true)}>Send by email</Button>
        {ds === "draft" && (
          <Button icon="send" size="sm" onClick={() => { setInvoiceStatus(inv.id, "sent"); push({ kind: "ok", title: `${inv.number} marked sent` }); }}>
            Mark sent
          </Button>
        )}
        {ds !== "paid" && ds !== "void" && (
          <Button variant="soft" size="sm" icon="wallet" onClick={() => setPayOpen(true)}>Record payment</Button>
        )}
        <Menu
          label={`More actions for ${inv.number}`}
          items={[
            {
              label: "Duplicate",
              icon: "copy",
              onClick: () => {
                const copy = duplicateInvoice(inv.id);
                if (copy) {
                  push({ kind: "ok", title: `Duplicated as ${copy.number}` });
                  navigate(`#/app/invoices/${copy.id}`);
                }
              },
            },
            ...(ds !== "void"
              ? [{ label: "Void invoice", icon: "x" as const, onClick: () => { setInvoiceStatus(inv.id, "void"); push({ kind: "info", title: `${inv.number} voided` }); } }]
              : []),
          ]}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="print-area min-w-0 lg:col-span-2">
          <InvoiceDocument
            inv={inv}
            client={client ?? null}
            business={business}
            templateId={templateId}
            accent={accent}
            paymentDetails={paymentDetails}
          />
        </div>

        <div className="space-y-4">
          <Card className="p-4.5 sm:p-5">
            <h3 className="font-display text-[15px] font-bold text-ink">Customize</h3>
            <div className="mt-3.5 space-y-3.5">
              <div>
                <p className="mb-1.5 text-[12.5px] font-semibold text-ink2">Template</p>
                <div className="flex gap-2">
                  {INVOICE_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => updateInvoice(inv.id, { templateId: t.id })}
                      aria-pressed={templateId === t.id}
                      className={cx(
                        "flex-1 rounded-lg border px-2 py-2 text-[12px] font-bold transition-all",
                        templateId === t.id ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:border-accent/50 hover:text-ink"
                      )}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[12.5px] font-semibold text-ink2">Accent</p>
                <div className="flex flex-wrap gap-2">
                  {ACCENT_SWATCHES.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateInvoice(inv.id, { accent: c })}
                      aria-label={`Accent color ${c}`}
                      className={cx("h-7 w-7 rounded-full transition-transform hover:scale-110", accent === c && "ring-2 ring-ink ring-offset-2 ring-offset-surface")}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Issue date" type="date" value={inv.issueDate} onChange={(e) => updateInvoice(inv.id, { issueDate: e.target.value })} />
                <Input label="Due date" type="date" value={inv.dueDate} onChange={(e) => updateInvoice(inv.id, { dueDate: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Tax (%)" type="number" min={0} step="0.1" value={String(inv.taxRate)} onChange={(e) => updateInvoice(inv.id, { taxRate: Math.max(0, parseFloat(e.target.value) || 0) })} />
                <Input label={`Discount (${inv.currency})`} type="number" min={0} step="0.01" value={String(inv.discount)} onChange={(e) => updateInvoice(inv.id, { discount: Math.max(0, parseFloat(e.target.value) || 0) })} />
              </div>
              <Textarea label="Notes" value={inv.notes ?? ""} onChange={(e) => updateInvoice(inv.id, { notes: e.target.value })} />
              <Textarea label="Payment details" value={paymentDetails} onChange={(e) => updateInvoice(inv.id, { paymentDetails: e.target.value })} />
            </div>
          </Card>

          <PaymentsCard inv={inv} onRecord={() => setPayOpen(true)} />
        </div>
      </div>

      <RecordPaymentModal open={payOpen} onClose={() => setPayOpen(false)} inv={inv} />
      <EmailComposer open={emailOpen} onClose={() => setEmailOpen(false)} inv={inv} />
      <span className="sr-only">{money(total, inv.currency)}</span>
    </div>
  );
}

function PaymentsCard({ inv, onRecord }: { inv: Invoice; onRecord: () => void }) {
  const removePayment = useStore((s) => s.removePayment);
  const { push } = useToast();
  const payments = inv.payments ?? [];
  const { total } = computeTotals(inv.items, inv.taxRate, inv.discount);
  const paid = invoicePaidAmount(inv);
  const balance = invoiceBalance(inv);
  const fullyPaid = balance <= 0.005;

  return (
    <Card className="p-4.5 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-[15px] font-bold text-ink">Payments</h3>
          <p className="mt-0.5 font-mono text-[12px] tabular text-muted">
            {money(paid, inv.currency)} of {money(total, inv.currency)} collected
          </p>
        </div>
        <span className={cx(
          "rounded-md px-2.5 py-1 font-mono text-[12px] font-bold tabular",
          fullyPaid ? "bg-ok/12 text-ok" : "bg-amber/12 text-amber"
        )}>
          {fullyPaid ? "Paid in full" : `${money(balance, inv.currency)} due`}
        </span>
      </div>

      <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-surface2" aria-hidden="true">
        <div className="h-full rounded-full bg-ok transition-all duration-500" style={{ width: `${total > 0 ? Math.min(100, (paid / total) * 100) : 0}%` }} />
      </div>

      {payments.length === 0 ? (
        <p className="mt-3.5 text-center text-[12.5px] text-muted">No payments recorded yet.</p>
      ) : (
        <ul className="mt-3.5 divide-y divide-line/60">
          {payments.map((p) => {
            const method = PAYMENT_METHODS.find((mm) => mm.id === p.method)?.label ?? p.method;
            return (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ok/10 text-ok">
                  <I name="check" size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold tabular text-ink">{money(p.amount, inv.currency)}</p>
                  <p className="text-[11.5px] text-muted">{fmtDate(p.date)} · {method}{p.note ? ` · ${p.note}` : ""}</p>
                </div>
                <IconButton
                  label={`Remove payment of ${money(p.amount, inv.currency)}`}
                  name="trash"
                  size={14}
                  className="hover:text-danger"
                  onClick={() => { removePayment(inv.id, p.id); push({ kind: "info", title: "Payment removed" }); }}
                />
              </li>
            );
          })}
        </ul>
      )}

      {inv.status !== "void" && (
        <Button size="sm" variant="soft" icon="plus" className="mt-3.5 w-full" onClick={onRecord}>Record payment</Button>
      )}
    </Card>
  );
}

function RecordPaymentModal({ open, onClose, inv }: { open: boolean; onClose: () => void; inv: Invoice }) {
  const addPayment = useStore((s) => s.addPayment);
  const { push } = useToast();
  const balance = invoiceBalance(inv);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayKey());
  const [method, setMethod] = useState<PaymentMethod>("bank");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount(balance > 0 ? String(round2(balance)) : "");
    setDate(todayKey());
    setMethod("bank");
    setNote("");
  }, [open, balance]);

  const save = () => {
    const amt = parseFloat(amount);
    if (Number.isNaN(amt) || amt <= 0) {
      push({ kind: "err", title: "Enter an amount greater than zero" });
      return;
    }
    const before = invoiceBalance(inv);
    addPayment(inv.id, { date, amount: round2(amt), method, note: note.trim() || undefined });
    push({
      kind: "ok",
      title: `Payment of ${money(amt, inv.currency)} recorded`,
      desc: before - amt <= 0.005 ? "Invoice is now fully paid 🎉" : undefined,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Record payment — ${inv.number}`}
      footer={
        <>
          <span className="mr-auto font-mono text-[12.5px] tabular text-muted">
            Balance due: <strong className="text-ink">{money(balance, inv.currency)}</strong>
          </span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon="check" onClick={save}>Record payment</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={`Amount (${inv.currency})`} type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label="Date received" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {PAYMENT_METHODS.map((mm) => <option key={mm.id} value={mm.id}>{mm.label}</option>)}
        </Select>
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Ref #4821" />
        <p className="rounded-lg bg-surface2/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink2">
          Partial payments are supported. The invoice flips to <strong className="text-ok">Paid</strong> once collected covers the total.
        </p>
      </div>
    </Modal>
  );
}

function EmailComposer({ open, onClose, inv }: { open: boolean; onClose: () => void; inv: Invoice }) {
  const client = useStore((s) => s.clients.find((c) => c.id === inv.clientId));
  const business = useStore((s) => s.business);
  const invDefaults = useStore((s) => s.invDefaults);
  const setInvoiceStatus = useStore((s) => s.setInvoiceStatus);
  const { push } = useToast();

  const vars = emailVarsFor(inv, client ?? null, business, invDefaults);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [markSent, setMarkSent] = useState(true);

  useEffect(() => {
    if (!open) return;
    setTo(client?.email ?? "");
    setSubject(fillTemplate(invDefaults.emailSubject, vars));
    setBody(fillTemplate(invDefaults.emailBody, vars));
    setMarkSent(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const buildPdfFile = async (): Promise<File> => {
    const blob = (await invoicePdf(
      inv, client ?? null, business,
      inv.templateId ?? invDefaults.templateId,
      inv.accent ?? invDefaults.accent,
      inv.paymentDetails ?? invDefaults.paymentDetails,
      true
    )) as Blob;
    return new File([blob], `${inv.number}.pdf`, { type: "application/pdf" });
  };

  /** Attach the PDF via the Web Share API where the platform supports it
   *  (mobile + some desktop). Falls back to download + open mail app. */
  const sendWithAttachment = async () => {
    try {
      const file = await buildPdfFile();
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] }) && typeof nav.share === "function") {
        await nav.share({
          files: [file],
          title: subject,
          text: body,
        });
        if (markSent && inv.status === "draft") setInvoiceStatus(inv.id, "sent");
        push({ kind: "ok", title: "Invoice shared with attachment", desc: `${inv.number}.pdf` });
        return;
      }
    } catch (e) {
      // user dismissed the share sheet — don't fall through to mailto
      if ((e as DOMException)?.name === "AbortError") return;
    }
    // Fallback: download the PDF, then open the mail app.
    await downloadInvoice();
    const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    if (markSent && inv.status === "draft") setInvoiceStatus(inv.id, "sent");
    push({ kind: "ok", title: "PDF downloaded — attach it in your mail app", desc: `${inv.number}.pdf is in your Downloads folder.` });
  };

  const downloadInvoice = async () => {
    await invoicePdf(
      inv, client ?? null, business,
      inv.templateId ?? invDefaults.templateId,
      inv.accent ?? invDefaults.accent,
      inv.paymentDetails ?? invDefaults.paymentDetails
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
      push({ kind: "ok", title: "Email copied to clipboard" });
    } catch {
      push({ kind: "err", title: "Couldn't copy", desc: "Select and copy manually." });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Send ${inv.number} by email`}
      wide
      footer={
        <>
          <Button variant="ghost" size="sm" icon="download" className="mr-auto" onClick={() => void downloadInvoice()}>
            PDF
          </Button>
          <Button variant="outline" icon="copy" onClick={() => void copy()}>Copy email</Button>
          <Button icon="send" onClick={() => void sendWithAttachment()}>Attach & send</Button>
        </>
      }
    >
      <div className="space-y-4">
        {!client?.email && (
          <p className="flex items-center gap-2 rounded-lg border border-amber/40 bg-amber/8 px-3.5 py-2.5 text-[12.5px] text-ink2">
            <I name="alert" size={15} className="shrink-0 text-amber" />
            This client has no email on file — add one below or on the client.
          </p>
        )}
        <Input label="To" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" />
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] font-semibold text-ink2">Subject</span>
            {EMAIL_FIELD_LABELS.slice(0, 4).map(([key, label]) => (
              <button
                type="button"
                key={key}
                onClick={() => setSubject((s) => s + `{{${key}}}`)}
                className="rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-[10.5px] font-semibold text-ink2 transition-all hover:border-accent/60 hover:text-accent active:scale-95"
              >
                +{label}
              </button>
            ))}
          </div>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-label="Email subject"
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] font-semibold text-ink2">Body</span>
            {EMAIL_FIELD_LABELS.map(([key, label]) => (
              <button
                type="button"
                key={key}
                onClick={() => setBody((b) => b + `{{${key}}}`)}
                className="rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-[10.5px] font-semibold text-ink2 transition-all hover:border-accent/60 hover:text-accent active:scale-95"
              >
                +{label}
              </button>
            ))}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            aria-label="Email body"
            className="w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-sm leading-relaxed text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <label className="flex items-center gap-2.5 text-[13px] font-medium text-ink2">
          <input type="checkbox" checked={markSent} onChange={(e) => setMarkSent(e.target.checked)} className="h-4 w-4 accent-[var(--tv-accent)]" />
          Mark invoice as <strong className="text-ink">Sent</strong> when I send
        </label>
        <p className="flex items-start gap-2 rounded-lg bg-surface2/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted">
          <I name="clip" size={14} className="mt-0.5 shrink-0 text-accent" />
          <span>
            <strong className="text-ink2">Attach &amp; send</strong> hands the PDF to your system's share sheet where it's
            attached automatically. If your browser can't attach files, the PDF is downloaded and your mail app opens — just
            drop the file in before sending.
          </span>
        </p>
      </div>
    </Modal>
  );
}

/* ================= recurring ================= */

const FREQ_LABEL: Record<RecurFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

function RecurringView() {
  const templates = useStore((s) => s.recurringTemplates);
  const clients = useStore((s) => s.clients);
  const updateRecurring = useStore((s) => s.updateRecurring);
  const deleteRecurring = useStore((s) => s.deleteRecurring);
  const processRecurring = useStore((s) => s.processRecurring);
  const { push } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<RecurringTemplate | null>(null);

  const runNow = (r: RecurringTemplate) => {
    updateRecurring(r.id, { nextRun: todayKey(), active: true });
    const n = processRecurring();
    push({
      kind: n > 0 ? "ok" : "err",
      title: n > 0 ? `Created ${n} draft ${n === 1 ? "invoice" : "invoices"}` : "Nothing generated",
      desc: n > 0 ? "Find it under Invoices — review, then send." : "No active templates were due.",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon="repeat" onClick={() => setFormOpen(true)}>New recurring profile</Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon="repeat"
          title="No recurring invoices yet"
          desc="Retainers and subscriptions on autopilot — TimeVault drafts the invoice on schedule, you review and send."
        >
          <Button icon="repeat" onClick={() => setFormOpen(true)}>Create a profile</Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.map((r) => {
            const client = clients.find((c) => c.id === r.clientId);
            const total = computeTotals(r.items, r.taxRate, r.discount).total;
            return (
              <Card key={r.id} className={cx("anim-rise p-4.5 sm:p-5", !r.active && "opacity-70")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 truncate font-display text-[15px] font-bold text-ink">
                      <I name="repeat" size={15} className="shrink-0 text-accent" />
                      <span className="truncate">{r.name}</span>
                    </h3>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {client?.name ?? "No client"} · {FREQ_LABEL[r.frequency]}
                      {r.frequency === "monthly" && ` on day ${r.dayOfMonth}`}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-[15px] font-semibold tabular text-ink">{money(total, r.currency)}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink2">
                  <span><span className="text-muted">Next run</span> <strong className="font-semibold text-ink">{fmtDate(r.nextRun)}</strong></span>
                  <span><span className="text-muted">Last run</span> <strong className="font-semibold text-ink">{r.lastRun ? fmtDate(r.lastRun) : "never"}</strong></span>
                  <span><span className="text-muted">Items</span> <strong className="font-semibold text-ink">{r.items.length}</strong></span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3.5">
                  <Button size="sm" icon="play" onClick={() => runNow(r)}>Run now</Button>
                  <label className="ml-auto flex cursor-pointer items-center gap-2.5">
                    <span className="text-[12.5px] font-semibold text-ink2">Active</span>
                    <button
                      role="switch"
                      aria-checked={r.active}
                      aria-label={`Toggle ${r.name} active`}
                      onClick={() => {
                        updateRecurring(r.id, { active: !r.active });
                        push({ kind: "info", title: !r.active ? "Profile activated" : "Profile paused" });
                      }}
                      className={cx(
                        "relative h-6 w-11 rounded-full transition-colors",
                        r.active ? "bg-accent" : "bg-line"
                      )}
                    >
                      <span className={cx(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                        r.active ? "left-[22px]" : "left-0.5"
                      )} />
                    </button>
                  </label>
                  <IconButton label={`Delete ${r.name}`} name="trash" className="hover:text-danger" onClick={() => setToDelete(r)} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <RecurringFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={`Delete “${toDelete?.name}”?`}
        desc="Already-generated invoices are kept. No further drafts will be created."
        onConfirm={() => {
          if (toDelete) {
            deleteRecurring(toDelete.id);
            push({ kind: "info", title: "Recurring profile deleted" });
          }
        }}
      />
    </div>
  );
}

function RecurringFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const clients = useStore((s) => s.clients);
  const invDefaults = useStore((s) => s.invDefaults);
  const addRecurring = useStore((s) => s.addRecurring);
  const { push } = useToast();

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [frequency, setFrequency] = useState<RecurFrequency>("monthly");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [currency, setCurrency] = useState("USD");
  const [taxRate, setTaxRate] = useState("0");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr("");
    setName("");
    setClientId(clients[0]?.id ?? "");
    setFrequency("monthly");
    setDayOfMonth("1");
    setCurrency(invDefaults.currency);
    setTaxRate(String(invDefaults.taxRate));
    setItems([]);
    setDesc("");
    setQty("1");
    setRate("");
  }, [open, clients, invDefaults]);

  const addItem = () => {
    const q = Math.max(0, parseFloat(qty) || 0);
    const r = Math.max(0, parseFloat(rate) || 0);
    if (!desc.trim() || q <= 0) {
      setErr("Give the line a description and a quantity.");
      return;
    }
    setErr("");
    setItems((xs) => [...xs, { id: uid(), kind: "custom", refId: "", description: desc.trim(), date: todayKey(), qty: q, rate: r, amount: round2(q * r) }]);
    setDesc("");
    setQty("1");
    setRate("");
  };

  const total = computeTotals(items, Math.max(0, parseFloat(taxRate) || 0), 0).total;

  const save = () => {
    if (!name.trim()) { setErr("Name the profile, e.g. “Retainer — monthly”."); return; }
    if (items.length === 0) { setErr("Add at least one line item."); return; }
    const dom = Math.min(28, Math.max(1, parseInt(dayOfMonth, 10) || 1));
    const start = new Date();
    const next =
      frequency === "monthly"
        ? toKey(new Date(start.getFullYear(), start.getMonth() + 1, dom))
        : toKey(start);
    addRecurring({
      name: name.trim(),
      clientId: clientId || null,
      items,
      taxRate: Math.max(0, parseFloat(taxRate) || 0),
      discount: 0,
      currency,
      frequency,
      dayOfMonth: dom,
      active: true,
      nextRun: next,
    });
    push({ kind: "ok", title: "Recurring profile created", desc: `First draft on ${fmtDate(next)}` });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New recurring profile"
      wide
      footer={
        <>
          <span className="mr-auto font-mono text-[13px] font-semibold tabular text-ink">
            {money(total, currency)} <span className="font-normal text-muted">per run</span>
          </span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon="check" onClick={save}>Create profile</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Profile name" value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} placeholder="e.g. Retainer — monthly" />
          <Select label="Client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">No client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Select label="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as RecurFrequency)}>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </Select>
          {frequency === "monthly" && (
            <Input label="Day of month" type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
          )}
          <Input label="Tax (%)" type="number" min={0} step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
          <div>
            <p className="mb-1 block text-[12px] font-semibold text-ink2">Currency</p>
            <p className="flex h-10 items-center rounded-lg border border-line bg-surface2/50 px-3 font-mono text-[13px] font-bold text-ink2">{currency}</p>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[12.5px] font-semibold text-ink2">Line items (copied onto every generated invoice)</p>
          {items.length > 0 && (
            <ul className="mb-2 divide-y divide-line/60 overflow-hidden rounded-lg border border-line">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 bg-surface px-3.5 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{it.description}</span>
                  <span className="font-mono text-[12px] tabular text-muted">{it.qty} × {money(it.rate, currency)}</span>
                  <span className="w-20 text-right font-mono text-[12.5px] font-semibold tabular text-ink">{money(it.amount, currency)}</span>
                  <IconButton label={`Remove ${it.description}`} name="x" size={13} className="hover:text-danger"
                    onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))} />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2.5 rounded-lg border border-dashed border-line bg-surface2/40 p-3">
            <div className="min-w-0 flex-1 basis-44">
              <Input label="Description" value={desc} onChange={(e) => { setDesc(e.target.value); setErr(""); }} placeholder="e.g. Retainer — 20h block" />
            </div>
            <div className="w-20"><Input label="Qty" type="number" min={0} step="0.25" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div className="w-24"><Input label="Rate" type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
            <Button variant="soft" size="sm" icon="plus" onClick={addItem}>Add</Button>
          </div>
        </div>

        {err && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/8 px-3.5 py-2.5 text-[12.5px] font-medium text-danger">{err}</p>}
      </div>
    </Modal>
  );
}

void entryToItem;
void expenseToItem;
void minutesSum;
void parseKey;
void downloadFile;
