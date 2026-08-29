/* Invoice engine + PDF generation. jspdf/autotable are imported dynamically
 * inside each generator so the heavy PDF libs never load until a PDF is
 * actually requested. */
import type {
  Business,
  Client,
  Expense,
  Invoice,
  InvoiceDefaults,
  InvoiceItem,
  InvoiceTemplateId,
  Payment,
  Task,
  TimeEntry,
} from "./store";
import { fmtDate, money, round2, todayKey, uid } from "./utils";

export type DisplayStatus = Invoice["status"] | "overdue";

export function entryToItem(e: TimeEntry, tasks: Task[]): InvoiceItem {
  const task = tasks.find((t) => t.id === e.taskId);
  const qty = round2(e.durationMin / 60);
  return {
    id: `it-${e.id}`,
    kind: "time",
    refId: e.id,
    description: e.description || task?.name || "Tracked time",
    date: e.date,
    qty,
    rate: e.rate,
    amount: round2(qty * e.rate),
  };
}

export function expenseToItem(x: Expense): InvoiceItem {
  return {
    id: `it-${x.id}`,
    kind: "expense",
    refId: x.id,
    description: x.notes || `${x.category} expense`,
    date: x.date,
    qty: 1,
    rate: x.amount,
    amount: round2(x.amount),
  };
}

export function computeTotals(
  items: InvoiceItem[],
  taxRate: number,
  discount: number
): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = round2(items.reduce((s, it) => s + it.amount, 0));
  const taxAmount = round2((subtotal * taxRate) / 100);
  const total = Math.max(0, round2(subtotal + taxAmount - discount));
  return { subtotal, taxAmount, total };
}

export interface BuildInvoiceInput {
  number: string;
  clientId: string | null;
  entryIds: string[];
  expenseIds: string[];
  entries: TimeEntry[];
  expenses: Expense[];
  tasks: Task[];
  issueDate: string;
  dueDate: string;
  taxRate: number;
  discount: number;
  currency: string;
  notes?: string;
  terms?: string;
}

export function buildInvoice(input: BuildInvoiceInput): Invoice {
  const chosenEntries = input.entries
    .filter((e) => input.entryIds.includes(e.id))
    .sort((a, b) => a.date.localeCompare(b.date));
  const chosenExpenses = input.expenses
    .filter((x) => input.expenseIds.includes(x.id))
    .sort((a, b) => a.date.localeCompare(b.date));
  const items = [
    ...chosenEntries.map((e) => entryToItem(e, input.tasks)),
    ...chosenExpenses.map(expenseToItem),
  ];
  const now = new Date().toISOString();
  return {
    id: uid(),
    number: input.number,
    clientId: input.clientId,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    status: "draft",
    items,
    taxRate: input.taxRate,
    discount: input.discount,
    currency: input.currency,
    notes: input.notes ?? "",
    terms: input.terms ?? "",
    createdAt: now,
    sentAt: null,
    paidAt: null,
  };
}

export function derivedStatus(inv: Invoice): DisplayStatus {
  if (inv.status === "sent" && inv.dueDate < todayKey()) return "overdue";
  return inv.status;
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

/* ---------------- email templates ---------------- */

export interface EmailVars {
  client_name: string;
  client_company: string;
  client_email: string;
  po_number: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  total: string;
  subtotal: string;
  currency: string;
  business_name: string;
  business_email: string;
  payment_details: string;
}

export function emailVarsFor(
  inv: Invoice,
  client: Client | null,
  business: Business,
  defaults: InvoiceDefaults
): EmailVars {
  const { subtotal, total } = computeTotals(inv.items, inv.taxRate, inv.discount);
  return {
    client_name: client?.name || "there",
    client_company: client?.company || "",
    client_email: client?.email || "",
    po_number: client?.poNumber ?? "",
    invoice_number: inv.number,
    issue_date: fmtDate(inv.issueDate),
    due_date: fmtDate(inv.dueDate),
    total: money(total, inv.currency),
    subtotal: money(subtotal, inv.currency),
    currency: inv.currency,
    business_name: business.name || "us",
    business_email: business.email || "",
    payment_details: inv.paymentDetails ?? defaults.paymentDetails ?? "",
  };
}

export const EMAIL_FIELD_LABELS: Array<[keyof EmailVars, string]> = [
  ["client_name", "Client name"],
  ["po_number", "PO number"],
  ["invoice_number", "Invoice #"],
  ["total", "Total due"],
  ["due_date", "Due date"],
  ["issue_date", "Issue date"],
  ["payment_details", "Payment details"],
  ["business_name", "Your business"],
  ["business_email", "Your email"],
];

export function fillTemplate(tpl: string, vars: EmailVars): string {
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, key: string) => {
    const v = (vars as unknown as Record<string, string | undefined>)[key];
    return v === undefined || v === null ? m : String(v);
  });
}

/* ---------------- shared PDF constants ---------------- */

const INK: [number, number, number] = [21, 30, 25];
const GRAY: [number, number, number] = [112, 122, 115];
const PAPER: [number, number, number] = [245, 247, 244];

const pdfMoney = (n: number, code: string): string => `${code} ${n.toFixed(2)}`;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [13, 110, 82];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ---------------- invoice PDF (three letterhead treatments) ---------------- */

export async function invoicePdf(
  inv: Invoice,
  client: Client | null,
  business: Business,
  templateId: InvoiceTemplateId = "ledger",
  accentHex: string = "#0D6E52",
  paymentDetails: string = "",
  asBlob?: boolean
): Promise<Blob | void> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 18;
  const ACC = hexToRgb(accentHex);
  const { subtotal, taxAmount, total } = computeTotals(inv.items, inv.taxRate, inv.discount);
  const serif = templateId === "classic";
  const font = serif ? "times" : "helvetica";

  if (templateId === "bold") {
    doc.setFillColor(...INK);
    doc.rect(0, 0, W, 42, "F");
    doc.setFillColor(...ACC);
    doc.rect(0, 42, W, 2.2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont(font, "bold");
    doc.setFontSize(20);
    doc.text(business.name || "Your Business", M, 18);
    doc.setFont(font, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(190, 197, 191);
    doc.text(
      [business.email, business.phone, business.taxId].filter((v): v is string => Boolean(v && v.trim())),
      M, 24
    );
    doc.setTextColor(...ACC);
    doc.setFont(font, "bold");
    doc.setFontSize(24);
    doc.text("INVOICE", W - M, 20, { align: "right" });
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text(inv.number, W - M, 28, { align: "right" });
    doc.setFontSize(8.5);
    doc.setTextColor(190, 197, 191);
    doc.text(`Issued ${fmtDate(inv.issueDate)}  ·  Due ${fmtDate(inv.dueDate)}`, W - M, 34, { align: "right" });
  } else if (serif) {
    doc.setDrawColor(...ACC);
    doc.setLineWidth(0.9);
    doc.line(M, 14, W - M, 14);
    doc.setLineWidth(0.3);
    doc.line(M, 15.4, W - M, 15.4);
    doc.setTextColor(...INK);
    doc.setFont("times", "bold");
    doc.setFontSize(21);
    doc.text(business.name || "Your Business", W / 2, 25, { align: "center" });
    doc.setFont("times", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    doc.text([business.address, business.email].filter(Boolean).join("  ·  "), W / 2, 30, { align: "center" });
    doc.setFont("times", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...ACC);
    doc.text("I N V O I C E", W / 2, 42, { align: "center" });
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(inv.number, W / 2, 48, { align: "center" });
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(`Issued ${fmtDate(inv.issueDate)}   ·   Due ${fmtDate(inv.dueDate)}`, W / 2, 53, { align: "center" });
  } else {
    doc.setFillColor(...ACC);
    doc.rect(0, 0, W, 4, "F");
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text(business.name || "Your Business", M, 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    doc.text(
      [business.email, business.phone, business.taxId].filter((v): v is string => Boolean(v && v.trim())),
      M, 30
    );
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...ACC);
    doc.text("INVOICE", W - M, 24, { align: "right" });
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(inv.number, W - M, 31, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(`Issued:  ${fmtDate(inv.issueDate)}`, W - M, 40, { align: "right" });
    doc.text(`Due:     ${fmtDate(inv.dueDate)}`, W - M, 45, { align: "right" });
  }

  /* bill to */
  const billY = templateId === "bold" ? 56 : 62;
  doc.setFont(font, serif ? "bolditalic" : "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("BILL TO", M, billY);
  doc.setFont(font, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(client?.name || "Client", M, billY + 6);
  doc.setFont(font, "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  const clientLines = [
    client?.company,
    client?.poNumber ? `PO: ${client.poNumber}` : "",
    client?.email,
    client?.address,
  ]
    .filter((v): v is string => Boolean(v && v.trim()))
    .flatMap((v) => doc.splitTextToSize(v, 90) as string[]);
  if (clientLines.length) doc.text(clientLines, M, billY + 11);

  autoTable(doc, {
    startY: billY + 24,
    margin: { left: M, right: M },
    head: [["Description", "Date", "Qty (h)", "Rate", "Amount"]],
    body: inv.items.map((it) => [
      it.description,
      fmtDate(it.date),
      it.kind === "expense" ? "—" : it.qty.toFixed(2),
      pdfMoney(it.rate, inv.currency),
      pdfMoney(it.amount, inv.currency),
    ]),
    theme: templateId === "classic" ? "plain" : "striped",
    styles: { font, fontSize: 9, textColor: INK, cellPadding: 2.6 },
    headStyles:
      templateId === "classic"
        ? { fillColor: [255, 255, 255], textColor: ACC, fontSize: 8.5, fontStyle: "bold" }
        : { fillColor: ACC, textColor: [255, 255, 255], fontSize: 8.5 },
    alternateRowStyles: { fillColor: PAPER },
    columnStyles: {
      0: { cellWidth: 82 },
      2: { halign: "right", cellWidth: 22 },
      3: { halign: "right", cellWidth: 28 },
      4: { halign: "right", cellWidth: 30 },
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const totalsX = W - M - 52;
  let ty = finalY + 10;

  doc.setFont(font, "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...GRAY);
  doc.text("Subtotal", totalsX, ty);
  doc.setTextColor(...INK);
  doc.text(pdfMoney(subtotal, inv.currency), W - M, ty, { align: "right" });
  ty += 6;
  doc.setTextColor(...GRAY);
  doc.text(`Tax (${inv.taxRate}%)`, totalsX, ty);
  doc.setTextColor(...INK);
  doc.text(pdfMoney(taxAmount, inv.currency), W - M, ty, { align: "right" });
  if (inv.discount > 0) {
    ty += 6;
    doc.setTextColor(...GRAY);
    doc.text("Discount", totalsX, ty);
    doc.setTextColor(...INK);
    doc.text(`-${pdfMoney(inv.discount, inv.currency)}`, W - M, ty, { align: "right" });
  }
  ty += 4;
  doc.setDrawColor(...ACC);
  doc.setLineWidth(0.5);
  doc.line(totalsX, ty, W - M, ty);
  ty += 7;
  doc.setFont(font, "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...ACC);
  doc.text("Total due", totalsX, ty);
  doc.text(pdfMoney(total, inv.currency), W - M, ty, { align: "right" });

  let ny = ty + 16;
  const section = (title: string, body: string) => {
    if (!body.trim()) return;
    doc.setFont(font, serif ? "bolditalic" : "bold");
    doc.setFontSize(8);
    doc.setTextColor(...ACC);
    doc.text(title.toUpperCase(), M, ny);
    doc.setFont(font, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(body, 118) as string[];
    doc.text(lines, M, ny + 5);
    ny += 5 + lines.length * 4.4 + 6;
  };
  section("Payment details", paymentDetails);
  section("Notes", inv.notes ?? "");
  section("Terms", inv.terms ?? "");

  doc.setFont(font, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text("Generated with TickKeep — free, offline-first invoicing.", W / 2, 288, { align: "center" });

  if (asBlob) return doc.output("blob");
  doc.save(`${inv.number}.pdf`);
}

/* ---------------- client statement PDF ---------------- */

export async function statementPdf(
  client: Client,
  invoices: Invoice[],
  business: Business
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 18;

  doc.setFillColor(13, 110, 82);
  doc.rect(0, 0, W, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...INK);
  doc.text(business.name || "Your Business", M, 22);
  doc.setFontSize(20);
  doc.setTextColor(13, 110, 82);
  doc.text("STATEMENT", W - M, 22, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(`For ${client.name}`, W - M, 29, { align: "right" });
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text(`As of ${fmtDate(todayKey())}`, W - M, 34, { align: "right" });

  const paidOf = (inv: Invoice) => (inv.payments ?? []).reduce((s, p) => s + p.amount, 0);
  const rows = invoices
    .slice()
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate))
    .map((inv) => {
      const { total } = computeTotals(inv.items, inv.taxRate, inv.discount);
      const paid = paidOf(inv);
      return [
        inv.number,
        fmtDate(inv.issueDate),
        fmtDate(inv.dueDate),
        pdfMoney(total, inv.currency),
        pdfMoney(paid, inv.currency),
        pdfMoney(Math.max(0, total - paid), inv.currency),
      ];
    });

  autoTable(doc, {
    startY: 42,
    margin: { left: M, right: M },
    head: [["Invoice", "Issued", "Due", "Total", "Paid", "Balance"]],
    body: rows,
    theme: "striped",
    styles: { font: "helvetica", fontSize: 9, textColor: INK, cellPadding: 2.6 },
    headStyles: { fillColor: [13, 110, 82], textColor: [255, 255, 255], fontSize: 8.5 },
    alternateRowStyles: { fillColor: PAPER },
    columnStyles: {
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
  });

  const currency = invoices[0]?.currency ?? "USD";
  const outstanding = invoices.reduce((s, inv) => {
    const { total } = computeTotals(inv.items, inv.taxRate, inv.discount);
    return s + Math.max(0, total - paidOf(inv));
  }, 0);
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(13, 110, 82);
  doc.text(`Outstanding: ${pdfMoney(outstanding, currency)}`, W - M, finalY + 10, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text("Generated with TickKeep.", W / 2, 288, { align: "center" });

  doc.save(`statement-${client.name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

/* ---------------- shareable standalone HTML invoice ---------------- */

export function invoiceHtml(
  inv: Invoice,
  client: Client | null,
  business: Business,
  accent: string,
  paymentDetails: string
): string {
  const { subtotal, taxAmount, total } = computeTotals(inv.items, inv.taxRate, inv.discount);
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const itemRows = inv.items
    .map(
      (it) => `<tr>
        <td>${esc(it.description)}</td><td>${fmtDate(it.date)}</td>
        <td class="r">${it.kind === "expense" ? "—" : it.qty.toFixed(2)}</td>
        <td class="r">${money(it.rate, inv.currency)}</td><td class="r">${money(it.amount, inv.currency)}</td>
      </tr>`
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(inv.number)} — ${esc(business.name || "Invoice")}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#f2f4f0;color:#131f19;margin:0;padding:32px 16px}
  .doc{max-width:760px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgb(8 18 13 / .12)}
  .band{height:6px;background:${accent}}
  .in{padding:40px}
  h1{font-size:28px;margin:0;color:${accent}}
  .muted{color:#7d8b81;font-size:13px}
  .grid{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;margin:20px 0 32px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${accent};border-bottom:2px solid ${accent};padding:8px 6px}
  td{padding:9px 6px;border-bottom:1px solid #e6eae4}
  .r{text-align:right;font-variant-numeric:tabular-nums}
  .totals{margin-left:auto;width:280px;margin-top:20px;font-size:14px}
  .totals div{display:flex;justify-content:space-between;padding:4px 0;color:#46564d}
  .totals .grand{border-top:2px solid ${accent};margin-top:6px;padding-top:10px;font-weight:800;color:${accent};font-size:17px}
  .sec{margin-top:28px;font-size:13px;color:#46564d}
  .sec b{display:block;color:${accent};font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
  footer{margin-top:32px;padding-top:14px;border-top:1px solid #e6eae4;font-size:11px;color:#9aa79e;text-align:center}
  @media print{body{background:#fff;padding:0}.doc{box-shadow:none;border-radius:0}}
</style></head><body><div class="doc"><div class="band"></div><div class="in">
<div class="grid">
  <div><h1>INVOICE</h1><div class="muted">${esc(inv.number)} · Issued ${fmtDate(inv.issueDate)} · Due ${fmtDate(inv.dueDate)}</div></div>
  <div style="text-align:right"><strong>${esc(business.name || "Your Business")}</strong><div class="muted">${esc([business.email, business.phone].filter(Boolean).join(" · "))}</div></div>
</div>
<div class="grid">
  <div><div class="muted" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">Bill to</div>
  <strong>${esc(client?.name || "Client")}</strong><div class="muted">${esc([client?.company, client?.poNumber ? `PO: ${client.poNumber}` : "", client?.address].filter(Boolean).join(" · "))}</div></div>
</div>
<table><thead><tr><th>Description</th><th>Date</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
<tbody>${itemRows}</tbody></table>
<div class="totals">
  <div><span>Subtotal</span><span>${money(subtotal, inv.currency)}</span></div>
  <div><span>Tax (${inv.taxRate}%)</span><span>${money(taxAmount, inv.currency)}</span></div>
  ${inv.discount > 0 ? `<div><span>Discount</span><span>−${money(inv.discount, inv.currency)}</span></div>` : ""}
  <div class="grand"><span>Total due</span><span>${money(total, inv.currency)}</span></div>
</div>
${paymentDetails ? `<div class="sec"><b>Payment details</b>${esc(paymentDetails)}</div>` : ""}
${inv.notes ? `<div class="sec"><b>Notes</b>${esc(inv.notes)}</div>` : ""}
${inv.terms ? `<div class="sec"><b>Terms</b>${esc(inv.terms)}</div>` : ""}
<footer>Generated with TickKeep — free, offline-first invoicing.</footer>
</div></div></body></html>`;
}

export type { Payment };
