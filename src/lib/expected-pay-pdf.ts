import {
  buildPdf,
  PdfPage,
  readJpeg,
  PAGE_W,
  PAGE_H,
  type JpegImage,
} from "@/lib/pdf";
import { formatCurrency } from "@/lib/time-utils";
import type { PayStubLine } from "@/lib/pay-stub";

/**
 * The expected-pay statement: one page saying who worked, when, on
 * what, the key times off the Exhibit G, and the working line by line —
 * the breakdown of the check, not just its total — with the G's
 * photograph on a second page when there is one. This is the document
 * to hand payroll next to a short check.
 */

export interface ExpectedPayDocument {
  performerName: string;
  showName: string;
  /** Already displayed, e.g. "Thu 8/20/2026". */
  workDateLabel: string;
  characterName?: string;
  agreementLabel: string;
  /** The day's key times, in reading order, already displayed. */
  times: Array<{ label: string; value: string }>;
  /** The working: what for, hours, money. */
  lines: PayStubLine[];
  total: number;
  /** "Wed 9/2" — when the check is due, when known. */
  dueByLabel?: string | null;
  /** The weekly/3-day asterisk note, when the figure approximates. */
  approximationNote?: string | null;
  /** The Exhibit G photograph (JPEG only) and its stored quarter-turns. */
  gPhoto?: { bytes: Uint8Array; rotation?: number } | null;
}

const MARGIN = 54;
const RIGHT = PAGE_W - MARGIN;

export function expectedPayPdf(doc: ExpectedPayDocument): Uint8Array {
  const page = new PdfPage();
  let y = PAGE_H - 64;

  page.text(MARGIN, y, "Expected pay", { size: 22, font: "helveticaBold" });
  page.text(RIGHT - 150, y + 2, "StuntListing Bookkeeper", {
    size: 9,
    gray: 0.45,
  });
  y -= 16;
  page.text(MARGIN, y, "What this work day comes to under the agreement", {
    size: 10,
    gray: 0.35,
  });
  y -= 14;
  page.rule(MARGIN, y, RIGHT, y, 0.2, 1);
  y -= 24;

  const info: Array<[string, string]> = [
    ["Performer", doc.performerName],
    ["Show", doc.showName],
    ["Work date", doc.workDateLabel],
    ...(doc.characterName
      ? ([["Character", doc.characterName]] as Array<[string, string]>)
      : []),
    ["Agreement", doc.agreementLabel],
  ];
  for (const [label, value] of info) {
    page.text(MARGIN, y, label, { size: 10, gray: 0.45 });
    page.text(MARGIN + 90, y, value, { size: 11 });
    y -= 17;
  }
  y -= 10;

  page.text(MARGIN, y, "The day, as recorded on the Exhibit G", {
    size: 12,
    font: "helveticaBold",
  });
  y -= 8;
  page.rule(MARGIN, y, RIGHT, y, 0.75, 0.6);
  y -= 17;
  // Two columns of times.
  const shown = doc.times.filter((t) => t.value);
  const half = Math.ceil(shown.length / 2);
  const columnX = [MARGIN, MARGIN + (RIGHT - MARGIN) / 2 + 10];
  const startY = y;
  shown.forEach((time, index) => {
    const column = index < half ? 0 : 1;
    const cy = startY - (index - column * half) * 16;
    page.text(columnX[column], cy, time.label, { size: 10, gray: 0.45 });
    page.text(columnX[column] + 118, cy, time.value, {
      size: 10,
      font: "courier",
    });
  });
  y = startY - half * 16 - 12;

  page.text(MARGIN, y, "The working", { size: 12, font: "helveticaBold" });
  y -= 8;
  page.rule(MARGIN, y, RIGHT, y, 0.75, 0.6);
  y -= 15;
  page.text(MARGIN, y, "For", { size: 8.5, gray: 0.5 });
  page.text(RIGHT - 170, y, "Hours", { size: 8.5, gray: 0.5 });
  page.text(RIGHT - 60, y, "Amount", { size: 8.5, gray: 0.5 });
  y -= 15;
  for (const line of doc.lines) {
    page.text(MARGIN, y, line.label, { size: 10.5 });
    if (line.hours != null) {
      page.figure(RIGHT - 140, y, line.hours.toFixed(2), { size: 10.5 });
    }
    page.figure(RIGHT, y, formatCurrency(line.amount), { size: 10.5 });
    y -= 16;
  }
  y -= 2;
  page.rule(MARGIN, y, RIGHT, y, 0.75, 0.6);
  y -= 16;
  page.text(MARGIN, y, "Expected pay", { size: 12, font: "helveticaBold" });
  page.figure(RIGHT, y, formatCurrency(doc.total), { size: 12, bold: true });
  y -= 20;
  if (doc.approximationNote) {
    page.text(MARGIN, y, `* ${doc.approximationNote}`, { size: 9, gray: 0.4 });
    y -= 14;
  }
  if (doc.dueByLabel) {
    page.text(
      MARGIN,
      y,
      `Payment due by ${doc.dueByLabel} - the second Wednesday after the work week.`,
      { size: 9.5, gray: 0.3 }
    );
    y -= 14;
  }

  page.text(
    MARGIN,
    46,
    "Estimates based on SAG-AFTRA rates. Verify with your union contract and payroll.",
    { size: 8.5, gray: 0.5 }
  );

  const pages = [page];
  const images: JpegImage[] = [];

  // The G itself, full-page, when the photo is a JPEG we can carry.
  if (doc.gPhoto) {
    const jpeg = readJpeg(doc.gPhoto.bytes);
    if (jpeg) {
      const rotation = ((doc.gPhoto.rotation ?? 0) % 360) as 0 | 90 | 180 | 270;
      const rotated = rotation % 180 !== 0;
      const naturalW = rotated ? jpeg.height : jpeg.width;
      const naturalH = rotated ? jpeg.width : jpeg.height;
      const boxW = PAGE_W - 2 * MARGIN;
      const boxH = PAGE_H - 150;
      const scale = Math.min(boxW / naturalW, boxH / naturalH);
      const w = naturalW * scale;
      const h = naturalH * scale;
      const gPage = new PdfPage();
      gPage.text(MARGIN, PAGE_H - 64, "The Exhibit G", {
        size: 14,
        font: "helveticaBold",
      });
      gPage.text(
        MARGIN,
        PAGE_H - 80,
        `${doc.showName} - ${doc.workDateLabel} - ${doc.performerName}`,
        { size: 9.5, gray: 0.4 }
      );
      images.push(jpeg);
      gPage.jpeg(
        0,
        MARGIN + (boxW - w) / 2,
        PAGE_H - 100 - h,
        w,
        h,
        rotation
      );
      pages.push(gPage);
    }
  }

  return buildPdf(pages, images);
}
