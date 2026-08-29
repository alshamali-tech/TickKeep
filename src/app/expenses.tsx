import { useEffect, useMemo, useRef, useState } from "react";
import { EXPENSE_CATEGORIES, useStore, type Expense } from "../lib/store";
import { compressReceipt, kb } from "../lib/image";
import { I } from "../components/icons";
import {
  Badge, Button, ConfirmDialog, EmptyState, IconButton, Input, Menu, Modal, Pagination,
  Select, Segmented, Toggle, useToast, navigate,
} from "../components/ui";
import { downloadFile, fmtDate, money, round2, toCSV, todayKey } from "../lib/utils";

const PAGE_SIZE = 10;

export function ExpensesPage() {
  const expenses = useStore((s) => s.expenses);
  const projects = useStore((s) => s.projects);
  const deleteExpense = useStore((s) => s.deleteExpense);
  const restoreExpense = useStore((s) => s.restoreExpense);
  const loadSample = useStore((s) => s.loadSample);
  const { push } = useToast();

  const [projectFilter, setProjectFilter] = useState("");
  const [billable, setBillable] = useState<"all" | "billable" | "non">("all");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [toDelete, setToDelete] = useState<Expense | null>(null);
  const [receiptView, setReceiptView] = useState<Expense | null>(null);

  const visible = useMemo(
    () =>
      expenses
        .filter((x) => {
          if (projectFilter && x.projectId !== projectFilter) return false;
          if (billable === "billable" && !x.billable) return false;
          if (billable === "non" && x.billable) return false;
          return true;
        })
        .sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, projectFilter, billable]
  );

  const totalsByCurrency = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of visible) m.set(x.currency, round2((m.get(x.currency) ?? 0) + x.amount));
    return [...m.entries()];
  }, [visible]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportCsv = () => {
    const rows: Array<Array<string | number | boolean>> = [
      ["Date", "Project", "Category", "Notes", "Amount", "Currency", "Billable"],
      ...visible.map((x) => [
        x.date,
        projects.find((p) => p.id === x.projectId)?.name ?? "",
        x.category,
        x.notes ?? "",
        x.amount,
        x.currency,
        x.billable ? "Yes" : "No",
      ]),
    ];
    downloadFile(`tickkeep-expenses-${todayKey()}.csv`, toCSV(rows), "text/csv");
    push({ kind: "ok", title: "CSV exported", desc: `${visible.length} expenses` });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="w-48 min-w-0">
          <Select value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setPage(1); }} aria-label="Filter by project">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <Segmented
          label="Filter by billable"
          value={billable}
          onChange={(v) => { setBillable(v); setPage(1); }}
          options={[
            { value: "all", label: "All" },
            { value: "billable", label: "Billable" },
            { value: "non", label: "Non-bill." },
          ]}
        />
        <span className="ml-auto" />
        <Button variant="outline" icon="download" onClick={exportCsv} disabled={visible.length === 0}>
          CSV
        </Button>
        <Button icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>
          Add expense
        </Button>
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="No expenses logged"
          desc="Track software, travel, materials — billable ones flow straight onto client invoices."
        >
          <Button icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>Log an expense</Button>
          <Button variant="ghost" icon="box" onClick={() => { loadSample(); push({ kind: "ok", title: "Sample data loaded" }); }}>
            Load sample data
          </Button>
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon="filter" title="No expenses match" desc="Try widening the filters." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1 font-mono text-[12.5px] text-muted">
            <span>{visible.length} {visible.length === 1 ? "expense" : "expenses"}</span>
            {totalsByCurrency.map(([cur, amt]) => (
              <span key={cur} className="font-semibold text-ink2">{money(amt, cur)}</span>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-surface2/50">
                  <th className="px-5 py-3 text-[12px] font-semibold uppercase tracking-wide text-muted" scope="col">Date</th>
                  <th className="px-5 py-3 text-[12px] font-semibold uppercase tracking-wide text-muted" scope="col">Project</th>
                  <th className="px-5 py-3 text-[12px] font-semibold uppercase tracking-wide text-muted" scope="col">Category</th>
                  <th className="px-5 py-3 text-[12px] font-semibold uppercase tracking-wide text-muted" scope="col">Notes</th>
                  <th className="px-5 py-3 text-right text-[12px] font-semibold uppercase tracking-wide text-muted" scope="col">Amount</th>
                  <th className="px-5 py-3 text-[12px] font-semibold uppercase tracking-wide text-muted" scope="col">Billing</th>
                  <th className="w-20 px-2 py-3" scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {paged.map((x) => {
                  const project = projects.find((p) => p.id === x.projectId);
                  return (
                    <tr key={x.id} className="border-b border-line/70 transition-colors last:border-0 hover:bg-surface2/40">
                      <td className="px-5 py-3.5 text-sm text-ink2 whitespace-nowrap">{fmtDate(x.date)}</td>
                      <td className="max-w-40 truncate px-5 py-3.5 text-sm text-ink">
                        <span className="inline-flex min-w-0 items-center gap-2">
                          {project && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: project.color }} />}
                          <span className="truncate">{project?.name ?? "No project"}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3.5"><Badge tone="gray">{x.category}</Badge></td>
                      <td className="max-w-52 truncate px-5 py-3.5 text-sm text-ink2">{x.notes || "—"}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-sm font-semibold tabular text-ink whitespace-nowrap">
                        {money(x.amount, x.currency)}
                      </td>
                      <td className="px-5 py-3.5">
                        {x.billable ? <Badge tone="accent">billable</Badge> : <Badge tone="gray">own cost</Badge>}
                      </td>
                      <td className="flex items-center justify-end gap-1 px-2 py-3.5">
                        {x.receipt && (
                          <IconButton
                            label={`View receipt for ${fmtDate(x.date)} expense`}
                            name="clip"
                            size={15}
                            className="text-accent"
                            onClick={() => setReceiptView(x)}
                          />
                        )}
                        <Menu
                          label={`Actions for expense on ${fmtDate(x.date)}`}
                          items={[
                            { label: "Edit", icon: "pencil", onClick: () => { setEditing(x); setFormOpen(true); } },
                            { label: "Delete", icon: "trash", danger: true, onClick: () => setToDelete(x) },
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
              <Pagination page={safePage} pages={totalPages} onPage={setPage} summary="expenses" />
            </div>
          )}
        </>
      )}

      <ExpenseFormModal open={formOpen} onClose={() => setFormOpen(false)} expense={editing} />
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Delete this expense?"
        desc={`${toDelete ? money(toDelete.amount, toDelete.currency) : ""} — ${toDelete?.notes || toDelete?.category || "expense"}. You can undo right after.`}
        onConfirm={() => {
          if (toDelete) {
            const snapshot = toDelete;
            deleteExpense(toDelete.id);
            push({
              kind: "info",
              title: "Expense deleted",
              action: { label: "Undo", onClick: () => restoreExpense(snapshot) },
            });
          }
        }}
      />

      <Modal
        open={receiptView !== null}
        onClose={() => setReceiptView(null)}
        title={`Receipt — ${receiptView ? fmtDate(receiptView.date) : ""}`}
        footer={
          <>
            <span className="mr-auto font-mono text-[13px] font-semibold tabular text-ink">
              {receiptView ? money(receiptView.amount, receiptView.currency) : ""}
            </span>
            <Button variant="ghost" onClick={() => setReceiptView(null)}>Close</Button>
          </>
        }
      >
        {receiptView?.receipt ? (
          <img
            src={receiptView.receipt}
            alt={`Receipt for ${money(receiptView.amount, receiptView.currency)} expense on ${fmtDate(receiptView.date)}`}
            className="mx-auto max-h-[60vh] rounded-lg border border-line object-contain"
          />
        ) : (
          <p className="py-6 text-center text-sm text-muted">No receipt attached.</p>
        )}
      </Modal>
    </div>
  );
}

function ExpenseFormModal({
  open,
  onClose,
  expense,
}: {
  open: boolean;
  onClose: () => void;
  expense: Expense | null;
}) {
  const projects = useStore((s) => s.projects);
  const clients = useStore((s) => s.clients);
  const invDefaults = useStore((s) => s.invDefaults);
  const addExpense = useStore((s) => s.addExpense);
  const updateExpense = useStore((s) => s.updateExpense);
  const { push } = useToast();

  const [date, setDate] = useState(todayKey());
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [billable, setBillable] = useState(true);
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const receiptRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");

  const currencyFor = (pid: string | null): string | null => {
    const p = projects.find((x) => x.id === pid);
    const c = clients.find((x) => x.id === p?.clientId);
    return c?.currency ?? null;
  };

  useEffect(() => {
    if (!open) return;
    setErr("");
    if (expense) {
      setDate(expense.date);
      setProjectId(expense.projectId ?? "");
      setCategory(expense.category);
      setAmount(String(expense.amount));
      setCurrency(expense.currency);
      setBillable(expense.billable);
      setNotes(expense.notes ?? "");
      setReceipt(expense.receipt ?? null);
    } else {
      setDate(todayKey());
      const firstActive = projects.find((p) => p.active);
      setProjectId(firstActive?.id ?? "");
      setCategory(EXPENSE_CATEGORIES[0]);
      setAmount("");
      setCurrency(currencyFor(firstActive?.id ?? null) ?? invDefaults.currency);
      setBillable(true);
      setNotes("");
      setReceipt(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense]);

  const submit = () => {
    const amt = parseFloat(amount);
    if (Number.isNaN(amt) || amt <= 0) {
      setErr("Enter an amount greater than zero.");
      return;
    }
    const payload = {
      date,
      projectId: projectId || null,
      category,
      amount: round2(amt),
      currency,
      billable,
      notes: notes.trim(),
      receipt: receipt ?? undefined,
    };
    if (expense) {
      updateExpense(expense.id, payload);
      push({ kind: "ok", title: "Expense updated" });
    } else {
      addExpense(payload);
      push({ kind: "ok", title: `Expense logged — ${money(round2(amt), currency)}` });
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? "Edit expense" : "Log an expense"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon="check" onClick={submit}>{expense ? "Save changes" : "Log expense"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Select
            label="Project"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              const cur = currencyFor(e.target.value || null);
              if (cur && !expense) setCurrency(cur);
            }}
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <Input
            label="Amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setErr(""); }}
            error={err || undefined}
          />
          <Select label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY", "INR", "SEK", "NOK"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
        <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Figma plugin — annual license" />
        <div>
          <p className="mb-1.5 block text-[13px] font-semibold text-ink2">Receipt</p>
          {receipt ? (
            <div className="flex items-center gap-3 rounded-lg border border-line bg-surface2/40 p-2.5">
              <img src={receipt} alt="Receipt preview" className="h-14 w-14 rounded object-cover" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink2">Attached — stored on this device</span>
              <Button variant="ghost" size="sm" icon="x" onClick={() => setReceipt(null)}>Remove</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" icon="clip" onClick={() => receiptRef.current?.click()}>
              Attach image
            </Button>
          )}
          <input
            ref={receiptRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Attach receipt image"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (!f.type.startsWith("image/")) {
                push({ kind: "err", title: "Receipt must be an image file" });
                return;
              }
              if (f.size > 8 * 1024 * 1024) {
                push({ kind: "err", title: "Image too large", desc: "Receipts up to 8 MB are accepted — they'll be compressed." });
                return;
              }
              void compressReceipt(f).then((r) => {
                setReceipt(r.dataUrl);
                if (r.originalBytes > r.bytes * 1.1) {
                  push({ kind: "ok", title: `Receipt compressed to ${kb(r.bytes)}`, desc: `Was ${kb(r.originalBytes)} — stored smaller to protect your storage quota.` });
                }
              });
            }}
          />
        </div>
        <Toggle
          checked={billable}
          onChange={setBillable}
          label="Billable to client"
          hint="Billable expenses appear when invoicing this client"
        />
      </div>
    </Modal>
  );
}

void navigate;
