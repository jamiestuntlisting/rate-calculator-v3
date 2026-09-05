import { buildPdf, PdfPage, PAGE_H, PAGE_W } from "@/lib/pdf";
import type { Audit } from "@/lib/repos/audits";

/**
 * The audit package, as it will look: one section per performer with
 * the days, what each came to, what was paid and the gap, then the
 * show's totals. Today it is a sample — the layout James can react to
 * — drawn from the audit's cards as far as they are transcribed, with
 * dashes where the pricing and the paycheck matching are not built.
 */
export interface PackageDay {
  performer: string;
  workDate: string;
  callTime: string;
  wrap: string;
  owed: number | null;
  paid: number | null;
}

const MARGIN = 54;
const RIGHT = PAGE_W - MARGIN;

const money = (n: number | null) =>
  n === null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function auditPackagePdf(audit: Audit, days: PackageDay[], generatedOn: string): Uint8Array {
  const pages: PdfPage[] = [];
  const byPerformer = new Map<string, PackageDay[]>();
  for (const d of days) byPerformer.set(d.performer, [...(byPerformer.get(d.performer) ?? []), d]);
  const performers = [...byPerformer.keys()].sort();
  if (performers.length === 0) performers.push("(no performer named yet)");

  // Cover: the show, who, and the shape of what follows.
  const cover = new PdfPage();
  let y = PAGE_H - MARGIN;
  cover.text(MARGIN, y, "Audit package — sample", { size: 22, font: "helveticaBold" });
  cover.text(RIGHT - 150, y + 2, "StuntListing Bookkeeper", { size: 9, gray: 0.5 });
  y -= 30;
  cover.text(MARGIN, y, audit.showName, { size: 16, font: "helveticaBold" });
  y -= 18;
  cover.text(MARGIN, y, `Generated ${generatedOn}`, { size: 10, gray: 0.45 });
  y -= 28;
  cover.rule(MARGIN, y, RIGHT, y, 0.2, 1);
  y -= 22;
  cover.text(MARGIN, y, "What this package holds", { size: 12, font: "helveticaBold" });
  y -= 18;
  for (const line of [
    "One section per performer: every day on the run, from the Exhibit Gs,",
    "what the agreement says each day comes to, what the paycheck paid, and the gap.",
    "Then the show's totals. Dashes mark what is not built yet: pricing every day",
    "and matching paychecks. The days and times are real once transcribed.",
  ]) {
    cover.text(MARGIN, y, line, { size: 10.5 });
    y -= 15;
  }
  y -= 12;
  cover.text(MARGIN, y, "Performers", { size: 12, font: "helveticaBold" });
  y -= 16;
  for (const p of performers) {
    cover.text(MARGIN, y, `${p} — ${byPerformer.get(p)?.length ?? 0} day${(byPerformer.get(p)?.length ?? 0) === 1 ? "" : "s"}`, { size: 10.5 });
    y -= 14;
  }
  if (audit.notes.trim()) {
    y -= 12;
    cover.text(MARGIN, y, "Notes", { size: 12, font: "helveticaBold" });
    y -= 16;
    for (const line of audit.notes.split(/\r?\n/).slice(0, 12)) {
      cover.text(MARGIN, y, line.slice(0, 95), { size: 10 });
      y -= 13;
    }
  }
  pages.push(cover);

  // One page per performer.
  for (const p of performers) {
    const page = new PdfPage();
    let py = PAGE_H - MARGIN;
    page.text(MARGIN, py, p, { size: 16, font: "helveticaBold" });
    page.text(RIGHT - 150, py + 2, audit.showName, { size: 9, gray: 0.5 });
    py -= 26;
    page.rule(MARGIN, py, RIGHT, py, 0.2, 1);
    py -= 16;
    page.text(MARGIN, py, "Day", { size: 8.5, gray: 0.5 });
    page.text(MARGIN + 90, py, "Call", { size: 8.5, gray: 0.5 });
    page.text(MARGIN + 150, py, "Wrap", { size: 8.5, gray: 0.5 });
    page.text(RIGHT - 230, py, "Owed", { size: 8.5, gray: 0.5 });
    page.text(RIGHT - 140, py, "Paid", { size: 8.5, gray: 0.5 });
    page.text(RIGHT - 50, py, "Gap", { size: 8.5, gray: 0.5 });
    py -= 6;
    page.rule(MARGIN, py, RIGHT, py, 0.75, 0.6);
    py -= 14;
    const rows = (byPerformer.get(p) ?? []).sort((a, b) => a.workDate.localeCompare(b.workDate));
    let owedTotal = 0;
    let paidTotal = 0;
    for (const d of rows) {
      page.text(MARGIN, py, d.workDate || "—", { size: 10.5 });
      page.text(MARGIN + 90, py, d.callTime || "—", { size: 10.5 });
      page.text(MARGIN + 150, py, d.wrap || "—", { size: 10.5 });
      page.figure(RIGHT - 170, py, money(d.owed), { size: 10.5 });
      page.figure(RIGHT - 80, py, money(d.paid), { size: 10.5 });
      const gap = d.owed !== null && d.paid !== null ? d.owed - d.paid : null;
      page.figure(RIGHT, py, gap === null ? "—" : money(gap), { size: 10.5, bold: gap !== null && gap > 0 });
      owedTotal += d.owed ?? 0;
      paidTotal += d.paid ?? 0;
      py -= 15;
      if (py < MARGIN + 60) break;
    }
    if (rows.length === 0) {
      page.text(MARGIN, py, "No days transcribed yet.", { size: 10.5, gray: 0.45 });
      py -= 15;
    }
    py -= 4;
    page.rule(MARGIN, py, RIGHT, py, 0.75, 0.6);
    py -= 16;
    page.text(MARGIN, py, "Total", { size: 11, font: "helveticaBold" });
    page.figure(RIGHT - 170, py, rows.some((r) => r.owed !== null) ? money(owedTotal) : "—", { size: 11, bold: true });
    page.figure(RIGHT - 80, py, rows.some((r) => r.paid !== null) ? money(paidTotal) : "—", { size: 11, bold: true });
    page.figure(RIGHT, py, rows.some((r) => r.owed !== null && r.paid !== null) ? money(owedTotal - paidTotal) : "—", { size: 11, bold: true });
    py -= 30;
    page.text(MARGIN, py, "Owed is the agreement's figure for the day as transcribed; Paid is from the matched", { size: 9, gray: 0.5 });
    py -= 12;
    page.text(MARGIN, py, "paycheck; the Gap is what the production still owes. Both are placeholders in this sample.", { size: 9, gray: 0.5 });
    pages.push(page);
  }
  return buildPdf(pages);
}
