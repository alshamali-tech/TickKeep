import type { Business, Client, Invoice, InvoiceTemplateId } from "../lib/store";
import { computeTotals, derivedStatus, STATUS_LABEL } from "../lib/invoice";
import { cx, fmtDate, money } from "../lib/utils";

/* The invoice as a real document — three letterhead treatments. */

function Monogram({ name, accent, light }: { name: string; accent: string; light?: boolean }) {
  const initials = (name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg font-display text-[15px] font-extrabold"
      style={{
        background: light ? accent : `${accent}1a`,
        color: light ? "#fff" : accent,
        border: light ? "none" : `1px solid ${accent}44`,
      }}
    >
      {initials}
    </span>
  );
}

function Meta({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9aa39c]">{label}</p>
      <p className={cx("mt-0.5 truncate text-[13px] text-[#1c1917]", strong ? "font-extrabold" : "font-medium")}>{value}</p>
      {sub && <p className="truncate text-[10.5px] text-[#78716c]">{sub}</p>}
    </div>
  );
}

export function InvoiceDocument({
  inv,
  client,
  business,
  templateId,
  accent,
  paymentDetails,
  showStatus = true,
}: {
  inv: Invoice;
  client: Client | null;
  business: Business;
  templateId: InvoiceTemplateId;
  accent: string;
  paymentDetails: string;
  showStatus?: boolean;
}) {
  const { subtotal, taxAmount, total } = computeTotals(inv.items, inv.taxRate, inv.discount);
  const status = derivedStatus(inv);
  const bizLines = [business.address, business.phone, business.email, business.taxId].filter(
    (v): v is string => Boolean(v && v.trim())
  );

  const statusChip = showStatus ? (
    <span
      className={cx(
        "rounded px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em]",
        status === "paid" && "bg-ok/12 text-ok",
        status === "overdue" && "bg-danger/12 text-danger",
        status === "sent" && "bg-info/12 text-info",
        (status === "draft" || status === "void") && "bg-surface2 text-muted"
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  ) : null;

  const body = (
    <>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr style={{ borderBottom: `2px solid ${accent}` }}>
            {["Description", "Date", "Qty", "Rate", "Amount"].map((h, i) => (
              <th
                key={h}
                className={cx("py-2.5 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] first:pl-0 last:pr-0", i >= 2 ? "text-right" : "text-left")}
                style={{ color: accent }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inv.items.map((it, i) => (
            <tr key={it.id} className={cx("border-b border-line/60", i % 2 === 1 && templateId !== "classic" && "bg-surface2/40")}>
              <td className="max-w-0 truncate py-2.5 pr-2 pl-0 font-medium text-ink" style={{ width: "46%" }} title={it.description}>
                {it.description}
                {it.kind === "custom" && (
                  <span className="ml-1.5 rounded bg-surface2 px-1 py-px text-[9.5px] font-bold uppercase tracking-wide text-muted">custom</span>
                )}
              </td>
              <td className="px-2 py-2.5 whitespace-nowrap text-ink2">{fmtDate(it.date)}</td>
              <td className="px-2 py-2.5 text-right font-mono tabular text-ink2">{it.kind === "expense" ? "—" : it.qty.toFixed(2)}</td>
              <td className="px-2 py-2.5 text-right font-mono tabular text-ink2 whitespace-nowrap">{money(it.rate, inv.currency)}</td>
              <td className="py-2.5 pr-0 pl-2 text-right font-mono font-semibold tabular text-ink whitespace-nowrap">{money(it.amount, inv.currency)}</td>
            </tr>
          ))}
          {inv.items.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-muted">No line items</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-5 flex justify-end">
        <dl className="w-full max-w-64 space-y-1.5 text-[13px]">
          <div className="flex justify-between gap-6">
            <dt className="text-muted">Subtotal</dt>
            <dd className="font-mono tabular text-ink">{money(subtotal, inv.currency)}</dd>
          </div>
          {inv.discount > 0 && (
            <div className="flex justify-between gap-6">
              <dt className="text-muted">Discount</dt>
              <dd className="font-mono tabular text-danger">−{money(inv.discount, inv.currency)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-6">
            <dt className="text-muted">Tax ({inv.taxRate}%)</dt>
            <dd className="font-mono tabular text-ink">{money(taxAmount, inv.currency)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-6 border-t-2 pt-2" style={{ borderColor: accent }}>
            <dt className="font-display text-[15px] font-extrabold" style={{ color: accent }}>Total due</dt>
            <dd className="font-mono text-lg font-bold tabular" style={{ color: accent }}>{money(total, inv.currency)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-8 grid gap-6 border-t border-line pt-6 text-[12px] sm:grid-cols-2">
        {paymentDetails.trim() && (
          <div>
            <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>Payment details</h4>
            <p className="whitespace-pre-line leading-relaxed text-ink2">{paymentDetails}</p>
          </div>
        )}
        {inv.notes?.trim() && (
          <div>
            <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>Notes</h4>
            <p className="whitespace-pre-line leading-relaxed text-ink2">{inv.notes}</p>
          </div>
        )}
        {inv.terms?.trim() && (
          <div className="sm:col-span-2">
            <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>Terms</h4>
            <p className="whitespace-pre-line leading-relaxed text-muted">{inv.terms}</p>
          </div>
        )}
      </div>

      <p className="mt-8 border-t border-line/70 pt-4 text-center text-[10.5px] text-muted">
        Generated with TimeVault — free, offline-first invoicing.
      </p>
    </>
  );

  if (templateId === "classic") {
    return (
      <article className="relative rounded-xl border border-line bg-white p-8 text-left shadow-card sm:p-10" style={{ colorScheme: "light" }}>
        <div className="text-center">
          <div className="mx-auto h-[3px] w-full" style={{ background: accent }} aria-hidden="true" />
          <div className="mx-auto mt-[3px] h-px w-full" style={{ background: `${accent}66` }} aria-hidden="true" />
          {business.logo && <img src={business.logo} alt="" className="mx-auto mt-5 h-12 object-contain" />}
          <h3 className="mt-4 font-display text-[26px] font-extrabold tracking-tight text-[#1c1917]">
            {business.name || "Your Business"}
          </h3>
          <p className="mx-auto mt-1.5 max-w-md text-[11px] leading-snug text-[#78716c]">{bizLines.join("  ·  ")}</p>
          <p className="mt-5 text-[15px] font-bold uppercase tracking-[0.42em]" style={{ color: accent }}>Invoice</p>
          <p className="mt-1 font-mono text-[13px] font-semibold tabular text-[#1c1917]">{inv.number}</p>
          <p className="mt-1 text-[11px] text-[#78716c]">
            Issued {fmtDate(inv.issueDate)} · Due {fmtDate(inv.dueDate)} {statusChip && <span className="ml-1 align-middle">{statusChip}</span>}
          </p>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-dashed border-[#d6d3d1] p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a8a29e]">Billed to</p>
            <p className="mt-1 text-[13px] font-bold text-[#1c1917]">{client?.name || "Client"}</p>
            <p className="text-[11px] leading-snug text-[#78716c]">
              {[client?.company, client?.poNumber ? `PO: ${client.poNumber}` : "", client?.email, client?.address].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <div className="rounded-lg border border-dashed border-[#d6d3d1] p-3.5 text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a8a29e]">From</p>
            <p className="mt-1 text-[13px] font-bold text-[#1c1917]">{business.name || "Your Business"}</p>
            <p className="text-[11px] leading-snug text-[#78716c]">{[business.email, business.phone].filter(Boolean).join(" · ") || "—"}</p>
          </div>
        </div>
        <div className="mt-6">{body}</div>
      </article>
    );
  }

  if (templateId === "bold") {
    return (
      <article className="relative overflow-hidden rounded-xl border border-line bg-white text-left shadow-card" style={{ colorScheme: "light" }}>
        <header className="flex flex-wrap items-center justify-between gap-4 bg-[#121b16] px-6 py-6 sm:px-10">
          <div className="flex min-w-0 items-center gap-3.5">
            {business.logo ? (
              <img src={business.logo} alt="" className="h-11 w-11 rounded-lg bg-white/95 object-contain p-1" />
            ) : (
              <Monogram name={business.name} accent={accent} light />
            )}
            <div className="min-w-0">
              <h3 className="truncate font-display text-lg font-extrabold text-white">{business.name || "Your Business"}</h3>
              <p className="mt-0.5 max-w-64 text-[11px] leading-snug text-[#a9b5ad]">{bizLines.join(" · ")}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2.5">
              {statusChip}
              <p className="font-display text-[26px] font-extrabold leading-none tracking-tight" style={{ color: accent }}>INVOICE</p>
            </div>
            <p className="mt-1 font-mono text-[13px] font-semibold tabular text-white">{inv.number}</p>
            <p className="mt-0.5 text-[11px] text-[#a9b5ad]">Issued {fmtDate(inv.issueDate)} · Due {fmtDate(inv.dueDate)}</p>
          </div>
        </header>
        <div className="h-1.5" style={{ background: accent }} aria-hidden="true" />
        <div className="p-8 sm:p-10">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Meta label="Bill to" value={client?.name || "Client"} sub={[client?.company, client?.email].filter(Boolean).join(" · ")} strong />
            <Meta label="Address" value={client?.address || "—"} />
            {client?.poNumber && <Meta label="PO number" value={client.poNumber} strong />}
            <Meta label="Issued" value={fmtDate(inv.issueDate)} />
            <Meta label="Due" value={fmtDate(inv.dueDate)} />
          </div>
          <div className="mt-7">{body}</div>
        </div>
      </article>
    );
  }

  // ledger (default)
  return (
    <article className="relative overflow-hidden rounded-xl border border-line bg-white p-8 text-left shadow-card sm:p-10" style={{ colorScheme: "light" }}>
      <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: accent }} aria-hidden="true" />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {business.logo ? (
            <img src={business.logo} alt="" className="h-11 w-11 rounded-lg object-contain" />
          ) : (
            <Monogram name={business.name} accent={accent} />
          )}
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-extrabold text-[#15201a]">{business.name || "Your Business"}</h3>
            <p className="mt-0.5 max-w-56 text-[11px] leading-snug text-[#707a73]">{bizLines.join(" · ")}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-[26px] font-extrabold leading-none tracking-tight" style={{ color: accent }}>INVOICE</p>
          <p className="mt-1 font-mono text-[13px] font-semibold tabular text-[#15201a]">{inv.number}</p>
          <div className="mt-1.5 flex items-center justify-end gap-2 text-[11px] text-[#707a73]">{statusChip}</div>
        </div>
      </header>
      <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Meta label="Bill to" value={client?.name || "Client"} sub={[client?.company, client?.email].filter(Boolean).join(" · ")} strong />
        <Meta label="Address" value={client?.address || "—"} />
        {client?.poNumber && <Meta label="PO number" value={client.poNumber} strong />}
        <Meta label="Issued" value={fmtDate(inv.issueDate)} />
        <Meta label="Due" value={fmtDate(inv.dueDate)} />
      </div>
      <div className="mt-7">{body}</div>
    </article>
  );
}
