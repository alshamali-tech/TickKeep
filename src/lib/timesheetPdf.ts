import type { Business, Client, Project, Task, TimeEntry } from "./store";
import { addDays, fmtDate, fmtH, hoursAmount, money, parseKey, toKey } from "./utils";

/** A client-facing weekly timesheet PDF — the deliverable clients ask for. */
export async function timesheetPdf(opts: {
  weekStartKey: string;
  entries: TimeEntry[];
  projects: Project[];
  tasks: Task[];
  business: Business;
  client: Client | null;
}): Promise<void> {
  const { weekStartKey, entries, projects, tasks, business, client } = opts;
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 18;
  const ACC: [number, number, number] = [13, 110, 82];
  const INK: [number, number, number] = [21, 30, 25];
  const GRAY: [number, number, number] = [112, 122, 115];

  const start = parseKey(weekStartKey);
  const end = addDays(start, 6);
  const currency = client?.currency ?? "USD";

  const projName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "—";
  const taskName = (id: string | null) => tasks.find((t) => t.id === id)?.name ?? "";

  doc.setFillColor(...ACC);
  doc.rect(0, 0, W, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...INK);
  doc.text(business.name || "Your Business", M, 22);
  doc.setFontSize(20);
  doc.setTextColor(...ACC);
  doc.text("TIMESHEET", W - M, 22, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(`${fmtDate(weekStartKey)} – ${fmtDate(toKey(end))}`, W - M, 29, { align: "right" });
  if (client) {
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(`Prepared for ${client.name}`, W - M, 34, { align: "right" });
  }

  const sorted = entries.slice().sort((a, b) => a.date.localeCompare(b.date));
  autoTable(doc, {
    startY: 42,
    margin: { left: M, right: M },
    head: [["Date", "Project", "Task", "Description", "Hours", "Amount"]],
    body: sorted.map((e) => [
      fmtDate(e.date),
      projName(e.projectId),
      taskName(e.taskId),
      e.description || "—",
      fmtH(e.durationMin),
      e.billable ? money(hoursAmount(e.durationMin, e.rate), currency) : "n/b",
    ]),
    theme: "striped",
    styles: { font: "helvetica", fontSize: 9, textColor: INK, cellPadding: 2.6 },
    headStyles: { fillColor: ACC, textColor: [255, 255, 255], fontSize: 8.5 },
    alternateRowStyles: { fillColor: [245, 247, 244] },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 34 },
      2: { cellWidth: 26 },
      4: { halign: "right", cellWidth: 18 },
      5: { halign: "right", cellWidth: 26 },
    },
  });

  const totalMin = sorted.reduce((s, e) => s + e.durationMin, 0);
  const billMin = sorted.reduce((s, e) => s + (e.billable ? e.durationMin : 0), 0);
  const billAmt = sorted.reduce((s, e) => s + (e.billable ? hoursAmount(e.durationMin, e.rate) : 0), 0);
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const ty = finalY + 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...GRAY);
  doc.text(`Total hours: ${fmtH(totalMin)}   ·   Billable: ${fmtH(billMin)}`, M, ty);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...ACC);
  doc.text(`Billable amount: ${money(billAmt, currency)}`, W - M, ty, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text("Generated with TickKeep — free, offline-first time tracking.", W / 2, 288, { align: "center" });

  doc.save(`timesheet-${weekStartKey}.pdf`);
}
