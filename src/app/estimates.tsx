import { useEffect, useMemo, useState } from "react";
import { useStore, type Estimate, type InvoiceItem } from "../lib/store";
import { computeTotals } from "../lib/invoice";
import { I } from "../components/icons";
import {
  Badge, Button, ConfirmDialog, EmptyState, IconButton, Input, Menu, Modal, Segmented,
  Select, type BadgeTone, useToast, navigate,
} from "../components/ui";
import { addDays, cx, fmtDate, money, round2, toKey, todayKey, uid } from "../lib/utils";

const STATUS_TONE: Record<Estimate["status"], BadgeTone> = {
  draft: "gray",
  sent: "info",
  accepted: "green",
  declined: "red",
};

const STATUS_LABEL: Record<Estimate["status"], string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
};

export function EstimatesPage() {
  const estimates = useStore((s) => s.estimates);
  const clients = useStore((s) => s.clients);
  const invoices = useStore((s) => s.invoices);
  const updateEstimate = useStore((s) => s.updateEstimate);
  const deleteEstimate = useStore((s) => s.deleteEstimate);
  const convertEstimateToInvoice = useStore((s) => s.convertEstimateToInvoice);
  const { push } = useToast();

  const [filter, setFilter] = useState<"all" | Estimate["status"]>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Estimate | null>(null);

  const visible = useMemo(() => {
    const list = filter === "all" ? estimates : estimates.filter((e) => e.status === filter);
    return list.slice().sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  }, [estimates, filter]);

  const openValue = useMemo(
    () =>
      estimates
        .filter((e) => e.status === "sent")
        .reduce((s, e) => s + computeTotals(e.items, e.taxRate, e.discount).total, 0),
    [estimates]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: estimates.length, draft: 0, sent: 0, accepted: 0, declined: 0 };
    for (const e of estimates) c[e.status]++;
    return c;
  }, [estimates]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented
          label="Filter estimates"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All · ${counts.all}` },
            { value: "draft", label: `Draft · ${counts.draft}` },
            { value: "sent", label: `Sent · ${counts.sent}` },
            { value: "accepted", label: `Won · ${counts.accepted}` },
            { value: "declined", label: `Lost · ${counts.declined}` },
          ]}
        />
        <span className="ml-auto" />
        {openValue > 0 && (
          <span className="font-mono text-[12.5px] font-semibold tabular text-info">
            {money(openValue)} awaiting reply
          </span>
        )}
        <Button icon="plus" onClick={() => setFormOpen(true)}>New estimate</Button>
      </div>

      {estimates.length === 0 ? (
        <EmptyState
          icon="quote"
          title="No estimates yet"
          desc="Quote the work before you do it. Accepted estimates convert to invoices in one click."
        >
          <Button icon="plus" onClick={() => setFormOpen(true)}>Create an estimate</Button>
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon="filter" title="Nothing in this bucket" desc="Try a different status." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((e, i) => {
            const client = clients.find((c) => c.id === e.clientId);
            const { total } = computeTotals(e.items, e.taxRate, e.discount);
            const linkedInvoice = e.invoiceId ? invoices.find((v) => v.id === e.invoiceId) : null;
            return (
              <div
                key={e.id}
                className="anim-rise rounded-xl border border-line bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-pop"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[12px] font-bold tabular text-accent">{e.number}</p>
                    <h3 className="mt-0.5 truncate font-display text-[16px] font-bold text-ink">
                      {client?.name ?? "No client"}
                    </h3>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      Issued {fmtDate(e.issueDate)} · valid until {fmtDate(e.expiryDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg font-semibold tabular text-ink">{money(total, e.currency)}</p>
                    <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                  </div>
                </div>

                <ul className="mt-3.5 space-y-1 border-t border-line/70 pt-3">
                  {e.items.slice(0, 3).map((it) => (
                    <li key={it.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                      <span className="min-w-0 truncate text-ink2">{it.description}</span>
                      <span className="shrink-0 font-mono tabular text-muted">{money(it.amount, e.currency)}</span>
                    </li>
                  ))}
                  {e.items.length > 3 && (
                    <li className="text-[11.5px] text-muted">+ {e.items.length - 3} more lines</li>
                  )}
                </ul>

                {linkedInvoice && (
                  <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ok">
                    <I name="check" size={13} />
                    Invoiced as{" "}
                    <button className="font-mono font-bold hover:underline" onClick={() => navigate(`#/app/invoices/${linkedInvoice.id}`)}>
                      {linkedInvoice.number}
                    </button>
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3.5">
                  {e.status === "draft" && (
                    <Button
                      size="sm"
                      icon="send"
                      onClick={() => {
                        updateEstimate(e.id, { status: "sent" });
                        push({ kind: "ok", title: `${e.number} marked sent` });
                      }}
                    >
                      Send
                    </Button>
                  )}
                  {e.status === "sent" && (
                    <>
                      <Button
                        size="sm"
                        icon="invoice"
                        onClick={() => {
                          const inv = convertEstimateToInvoice(e.id);
                          if (inv) {
                            push({ kind: "ok", title: `Invoice ${inv.number} created`, desc: "From the accepted estimate." });
                            navigate(`#/app/invoices/${inv.id}`);
                          }
                        }}
                      >
                        Convert to invoice
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          updateEstimate(e.id, { status: "declined" });
                          push({ kind: "info", title: `${e.number} marked declined` });
                        }}
                      >
                        Declined
                      </Button>
                    </>
                  )}
                  {(e.status === "accepted" || e.status === "declined") && !linkedInvoice && (
                    <Button
                      size="sm"
                      variant="soft"
                      icon="invoice"
                      onClick={() => {
                        const inv = convertEstimateToInvoice(e.id);
                        if (inv) navigate(`#/app/invoices/${inv.id}`);
                      }}
                    >
                      Convert to invoice
                    </Button>
                  )}
                  <span className="ml-auto" />
                  <IconButton
                    label={`Delete ${e.number}`}
                    name="trash"
                    className="hover:text-danger"
                    onClick={() => setToDelete(e)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EstimateFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={`Delete ${toDelete?.number}?`}
        desc="The estimate is removed. Any invoice already created from it is kept."
        onConfirm={() => {
          if (toDelete) {
            deleteEstimate(toDelete.id);
            push({ kind: "info", title: `${toDelete.number} deleted` });
          }
        }}
      />
    </div>
  );
}

function EstimateFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const clients = useStore((s) => s.clients);
  const invDefaults = useStore((s) => s.invDefaults);
  const addEstimate = useStore((s) => s.addEstimate);
  const { push } = useToast();

  const [clientId, setClientId] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [taxRate, setTaxRate] = useState("0");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr("");
    setClientId(clients[0]?.id ?? "");
    setExpiryDate(toKey(addDays(new Date(), 14)));
    setCurrency(clients[0]?.currency ?? invDefaults.currency);
    setTaxRate(String(invDefaults.taxRate));
    setItems([]);
    setDesc("");
    setQty("1");
    setRate("");
    setNotes("");
  }, [open, clients, invDefaults]);

  const { total } = computeTotals(items, Math.max(0, parseFloat(taxRate) || 0), 0);

  const addItem = () => {
    const q = Math.max(0, parseFloat(qty) || 0);
    const r = Math.max(0, parseFloat(rate) || 0);
    if (!desc.trim() || q <= 0) {
      setErr("Give the line a description and a quantity.");
      return;
    }
    setErr("");
    setItems((xs) => [
      ...xs,
      { id: uid(), kind: "custom", refId: "", description: desc.trim(), date: todayKey(), qty: q, rate: r, amount: round2(q * r) },
    ]);
    setDesc("");
    setQty("1");
    setRate("");
  };

  const save = () => {
    if (items.length === 0) {
      setErr("Add at least one line item.");
      return;
    }
    const est = addEstimate({
      clientId: clientId || null,
      issueDate: todayKey(),
      expiryDate,
      status: "draft",
      items,
      taxRate: Math.max(0, parseFloat(taxRate) || 0),
      discount: 0,
      currency,
      notes: notes.trim() || undefined,
    });
    push({ kind: "ok", title: `${est.number} created`, desc: money(total, currency) });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New estimate"
      wide
      footer={
        <>
          <span className="mr-auto font-mono text-[13px] font-semibold tabular text-ink">
            {money(total, currency)} <span className="font-normal text-muted">estimated</span>
          </span>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon="check" onClick={save}>Create estimate</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Client" value={clientId} onChange={(e) => {
            setClientId(e.target.value);
            const c = clients.find((x) => x.id === e.target.value);
            if (c) setCurrency(c.currency);
          }}>
            <option value="">No client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input label="Valid until" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          <Input label="Tax (%)" type="number" min={0} step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
        </div>

        <div>
          <p className="mb-1.5 text-[12.5px] font-semibold text-ink2">Line items</p>
          {items.length > 0 && (
            <ul className="mb-2 divide-y divide-line/60 overflow-hidden rounded-lg border border-line">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-3 bg-surface px-3.5 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{it.description}</span>
                  <span className="font-mono text-[12px] tabular text-muted">{it.qty} × {money(it.rate, currency)}</span>
                  <span className="w-20 text-right font-mono text-[12.5px] font-semibold tabular text-ink">{money(it.amount, currency)}</span>
                  <IconButton
                    label={`Remove ${it.description}`}
                    name="x"
                    size={13}
                    className="hover:text-danger"
                    onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2.5 rounded-lg border border-dashed border-line bg-surface2/40 p-3">
            <div className="min-w-0 flex-1 basis-44">
              <Input label="Description" value={desc} onChange={(e) => { setDesc(e.target.value); setErr(""); }} placeholder="e.g. Discovery & scope" />
            </div>
            <div className="w-20"><Input label="Qty" type="number" min={0} step="0.25" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div className="w-24"><Input label="Rate" type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
            <Button variant="soft" size="sm" icon="plus" onClick={addItem}>Add</Button>
          </div>
        </div>

        <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Scope assumptions, revision rounds…" />
        {err && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/8 px-3.5 py-2.5 text-[12.5px] font-medium text-danger">{err}</p>}
      </div>
    </Modal>
  );
}

void cx;
