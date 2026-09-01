import { describe, expect, it } from "vitest";
import { expectedPayPdf } from "@/lib/expected-pay-pdf";
import { buildPdf, PdfPage, readJpeg } from "@/lib/pdf";

/**
 * The PDF writer emits uncompressed content streams on purpose, so a
 * test can read the document's own text — no PDF parser needed to know
 * the statement says what it must.
 */

const text = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

const DOC = {
  performerName: "Jamie Northrup",
  showName: "Grown Ups 3",
  workDateLabel: "Thu, Aug 20, 2026",
  characterName: "Stunt Double",
  agreementLabel: "Theatrical / Television ($1,183/day)",
  times: [
    { label: "Call (makeup/wardrobe)", value: "6:12 AM" },
    { label: "1st meal", value: "1:05 PM - 1:35 PM" },
    { label: "Dismissed on set", value: "5:15 PM" },
    { label: "Wrapped", value: "5:30 PM" },
  ],
  lines: [
    { label: "Straight Time (8 hours)", hours: 8, amount: 1183 },
    { label: "Time-and-a-Half", hours: 2.5, amount: 554.53 },
    { label: "Meal penalties", hours: null, amount: 85 },
  ],
  total: 1822.53,
  dueByLabel: "Wed, Sep 2, 2026",
};

describe("expectedPayPdf", () => {
  it("is a well-formed PDF carrying the whole statement", () => {
    const bytes = expectedPayPdf(DOC);
    const raw = text(bytes);
    expect(raw.startsWith("%PDF-1.4")).toBe(true);
    expect(raw.trimEnd().endsWith("%%EOF")).toBe(true);
    for (const needle of [
      "Expected pay",
      "Jamie Northrup",
      "Grown Ups 3",
      "Thu, Aug 20, 2026",
      "Stunt Double",
      "6:12 AM",
      "5:30 PM",
      "Straight Time \\(8 hours\\)",
      "$1,822.53",
      "Meal penalties",
      "Payment due by Wed, Sep 2, 2026",
    ]) {
      expect(raw).toContain(needle);
    }
    // The xref offset at the tail points at the actual xref table.
    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(raw)![1]);
    expect(text(bytes.slice(startxref, startxref + 4))).toBe("xref");
  });

  it("adds a second page with the Exhibit G when the photo is a JPEG", () => {
    // A minimal but honest JPEG header: SOI + SOF0 with 100x80 RGB.
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x50, 0x00, 0x64, 0x03,
      0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xff, 0xd9,
    ]);
    const parsed = readJpeg(jpeg);
    expect(parsed).toMatchObject({ width: 100, height: 80, components: 3 });

    const bytes = expectedPayPdf({ ...DOC, gPhoto: { bytes: jpeg, rotation: 90 } });
    const raw = text(bytes);
    expect(raw).toContain("/Count 2");
    expect(raw).toContain("/DCTDecode");
    expect(raw).toContain("The Exhibit G");
  });

  it("the writer's xref offsets index every object", () => {
    const page = new PdfPage();
    page.text(72, 700, "One (line) with \\ escapes");
    const bytes = buildPdf([page]);
    const raw = text(bytes);
    const entries = [...raw.matchAll(/^(\d{10}) 00000 n /gm)].map((m) =>
      Number(m[1])
    );
    expect(entries.length).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < entries.length; i++) {
      expect(text(bytes.slice(entries[i], entries[i] + 12))).toContain(
        `${i + 1} 0 obj`
      );
    }
  });
});
