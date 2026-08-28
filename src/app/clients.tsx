import { useEffect, useMemo, useState } from "react";
import { billedEntryIds, invoiceBalance, useStore, type Client } from "../lib/store";
import { statementPdf } from "../lib/invoice";
import { I } from "../components/icons";
import {
  Button, ConfirmDialog, EmptyState, Input, Menu, Modal, Pagination, Select, Textarea,
  Tooltip, useToast, navigate,
} from "../components/ui";
import { CURRENCIES, cx, fmtHL, money, todayKey } from "../lib/utils";

const PAGE_SIZE = 8;

export function ClientsPage() {
  const clients = useStore((s) => s.clients);
  const projects = useStore((s) => s.projects);
  const entries = useStore((s) => s.entries);
  const invoices = useStore((s) => s.invoices);
  const business = useStore((s) => s.business);
  const deleteClient = useStore((s) => s.deleteClient);
  const loadSample = useStore((s) => s.loadSample);
  const { push } = useToast();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [toDelete, setToDelete] = useState<Client | null>(null);

  const billed = useMemo(() => billedEntryIds(invoices), [invoices]);

  const stats = useMemo(() => {
    const projectClient = new Map<string, string>();
    for (const p of projects) if (p.clientId) projectClient.set(p.id, p.clientId);
    const map = new Map<string, { min: number; unbilled: number; outstanding: number }>();
    for (const e of entries) {
      const cid = e.projectId ? projectClient.get(e.projectId) : undefined;
      if (!cid) continue;
      const cur = map.get(cid) ?? { min: 0, unbilled: 0, outstanding: 0 };
      cur.min += e.durationMin;
      if (e.billable && !billed.has(e.id)) cur.unbilled += (e.durationMin / 60) * e.rate;
      map.set(cid, cur);
    }
    for (const inv of invoices) {
      if (inv.clientId && inv.status !== "void" && inv.status !== "paid") {
        const cur = map.get(inv.clientId) ?? { min: 0, unbilled: 0, outstanding: 0 };
        cur.outstanding += invoiceBalance(inv);
        map.set(inv.clientId, cur);
      }
    }
    return map;
  }, [projects, entries, invoices, billed]);

  const q = search.trim().toLowerCase();
  const visible = clients.filter(
    (c) => !q || `${c.name} ${c.email ?? ""} ${c.company ?? ""}`.toLowerCase().includes(q)
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-0 flex-1 basis-56">
          <I name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search clients…"
            aria-label="Search clients"
            className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted/80 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <Button icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>
          New client
        </Button>
      </div>

      {clients.length === 0 ? (
        <EmptyState
          icon="users"
          title="No clients yet"
          desc="Clients give your projects a home, a currency and a billing address for invoices."
        >
          <Button icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>Add your first client</Button>
          <Button variant="ghost" icon="box" onClick={() => { loadSample(); push({ kind: "ok", title: "Sample data loaded" }); }}>
            Load sample data
          </Button>
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon="filter" title="No clients match" desc="Try a different search." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-surface2/50">
                  {["Client", "Contact", "Currency", "Rate", "Tracked", "Unbilled", "Outstanding", ""].map((h, i) => (
                    <th
                      key={h || "actions"}
                      scope="col"
                      className={cx(
                        "px-5 py-3 text-[12px] font-semibold uppercase tracking-wide text-muted",
                        ["Rate", "Tracked", "Unbilled", "Outstanding"].includes(h) && "text-right",
                        i === 7 && "w-12 px-2"
                      )}
                    >
                      {h || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((c) => {
                  const st = stats.get(c.id);
                  return (
                    <tr key={c.id} className="border-b border-line/70 transition-colors last:border-0 hover:bg-surface2/40">
                      <td className="px-5 py-3.5">
                        <div className="max-w-44">
                          <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                          {c.company && <p className="truncate text-[12.5px] text-muted">{c.company}</p>}
                          {c.poNumber && (
                            <p className="mt-0.5 inline-block rounded bg-surface2 px-1.5 py-px font-mono text-[10.5px] font-semibold text-ink2">
                              PO {c.poNumber}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="max-w-44 truncate px-5 py-3.5 text-sm text-ink2">{c.email || "—"}</td>
                      <td className="px-5 py-3.5"><span className="rounded bg-surface2 px-2 py-0.5 font-mono text-[12px] font-semibold text-ink2">{c.currency}</span></td>
                      <td className="px-5 py-3.5 text-right font-mono text-sm tabular text-ink">{money(c.defaultRate, c.currency)}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-sm tabular text-ink">{st ? fmtHL(st.min) : "0m"}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-sm font-semibold tabular text-accent">
                        {st && st.unbilled > 0.005 ? money(st.unbilled, c.currency) : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {st && st.outstanding > 0.005 ? (
                          <Tooltip tip="Open invoice balance for this client">
                            <span className="font-mono text-sm font-semibold tabular text-amber">{money(st.outstanding, c.currency)}</span>
                          </Tooltip>
                        ) : (
                          <span className="font-mono text-sm tabular text-muted">—</span>
                        )}
                      </td>
                      <td className="px-2 py-3.5">
                        <Menu
                          label={`Actions for ${c.name}`}
                          items={[
                            {
                              label: "Statement (PDF)",
                              icon: "file",
                              onClick: async () => {
                                const theirs = invoices.filter((i) => i.clientId === c.id && i.status !== "void");
                                if (theirs.length === 0) {
                                  push({ kind: "info", title: "No invoices for this client yet" });
                                  return;
                                }
                                await statementPdf(c, theirs, business);
                                push({ kind: "ok", title: "Statement downloaded", desc: `${theirs.length} invoices` });
                              },
                            },
                            {
                              label: "New invoice",
                              icon: "invoice",
                              onClick: () => navigate("#/app/invoices"),
                            },
                            { label: "Edit", icon: "pencil", onClick: () => { setEditing(c); setFormOpen(true); } },
                            { label: "Delete", icon: "trash", danger: true, onClick: () => setToDelete(c) },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="font-mono text-[12px] text-muted">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, visible.length)} of {visible.length}
              </p>
              <Pagination page={safePage} pages={totalPages} onPage={setPage} summary="clients" />
            </div>
          )}
        </>
      )}

      <ClientFormModal open={formOpen} onClose={() => setFormOpen(false)} client={editing} />
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={`Delete “${toDelete?.name}”?`}
        desc="Their projects become unassigned and existing invoices keep their snapshot. Time entries are untouched."
        onConfirm={() => {
          if (toDelete) {
            deleteClient(toDelete.id);
            push({ kind: "info", title: `Deleted “${toDelete.name}”` });
          }
        }}
      />
    </div>
  );
}

function ClientFormModal({
  open,
  onClose,
  client,
}: {
  open: boolean;
  onClose: () => void;
  client: Client | null;
}) {
  const addClient = useStore((s) => s.addClient);
  const updateClient = useStore((s) => s.updateClient);
  const { push } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [rate, setRate] = useState("90");
  const [address, setAddress] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr("");
    setName(client?.name ?? "");
    setEmail(client?.email ?? "");
    setCompany(client?.company ?? "");
    setCurrency(client?.currency ?? "USD");
    setRate(String(client?.defaultRate ?? 90));
    setAddress(client?.address ?? "");
    setPoNumber(client?.poNumber ?? "");
  }, [open, client]);

  const submit = () => {
    if (!name.trim()) {
      setErr("Clients need at least a name.");
      return;
    }
    const payload = {
      name: name.trim(),
      email: email.trim(),
      company: company.trim(),
      currency,
      defaultRate: Math.max(0, parseFloat(rate) || 0),
      address: address.trim(),
      poNumber: poNumber.trim() || undefined,
    };
    if (client) {
      updateClient(client.id, payload);
      push({ kind: "ok", title: "Client updated" });
    } else {
      addClient(payload);
      push({ kind: "ok", title: `Client “${payload.name}” added` });
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? "Edit client" : "New client"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon="check" onClick={submit}>{client ? "Save changes" : "Add client"}</Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input label="Name" value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} error={err || undefined} placeholder="e.g. Fjord & Frame" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="billing@client.com" />
          <Input label="Company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Optional" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <Input label="Default hourly rate" type="number" min={0} step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <Input
          label="Purchase Order (PO) number"
          value={poNumber}
          onChange={(e) => setPoNumber(e.target.value)}
          placeholder="e.g. PO-2026-0114 — optional"
          hint="Printed on every invoice for this client, and available as {{po_number}} in email templates."
        />
        <Textarea label="Billing address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Shown on invoices" />
        <button type="submit" className="sr-only">Save client</button>
      </form>
    </Modal>
  );
}

void todayKey;
