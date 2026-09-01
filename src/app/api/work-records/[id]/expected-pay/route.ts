import { NextResponse } from "next/server";
import { findWorkRecord } from "@/lib/repos/work-records";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";
import { getUploadsBucket } from "@/lib/db";
import { expectedPayPdf } from "@/lib/expected-pay-pdf";
import { owedLinesFromRecord } from "@/lib/pay-stub";
import { agreementLabel } from "@/lib/agreements";
import { paymentDueDate } from "@/lib/payment-due";

/** "14:30" -> "2:30 PM"; empty for anything unparseable. */
const display = (value: string | null | undefined): string => {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || "");
  if (!match) return "";
  const h = Number(match[1]);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${match[2]} ${h < 12 ? "AM" : "PM"}`;
};

const dateLabel = (ymd: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(
    "en-US",
    { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }
  );
};

/**
 * GET /api/work-records/[id]/expected-pay — the day's expected pay as a
 * PDF: performer, show, date, the Exhibit G's key times, and the
 * working line by line, with the G's photo on a second page when it is
 * a JPEG. The document payroll gets shown next to a short check.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = await getEffectiveUserId(auth.session);
    const { id } = await params;

    const record = await findWorkRecord(id, userId);
    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!record.calculation) {
      return NextResponse.json(
        { error: "This day has no working yet — log its times first." },
        { status: 400 }
      );
    }

    const ymd = (record.workDate || "").slice(0, 10);
    const lines = owedLinesFromRecord(record);
    // Contracts past the first are day-rate minimums on top of the
    // calculated day; the difference is that line.
    const extras =
      (record.expectedAmount || 0) - record.calculation.grandTotal;
    if (extras > 0.005) {
      lines.push({
        label: "Additional contracts (day-rate minimums)",
        hours: null,
        amount: Math.round(extras * 100) / 100,
      });
    }

    const performerName =
      `${auth.session.firstName ?? ""} ${auth.session.lastName ?? ""}`.trim() ||
      auth.session.email;

    // The Exhibit G photograph, when one is attached and is a JPEG.
    let gPhoto: { bytes: Uint8Array; rotation?: number } | null = null;
    const gDoc = (record.documents || []).find(
      (d) =>
        d.documentType === "exhibit_g" && /\.jpe?g$/i.test(d.filename || "")
    );
    if (gDoc) {
      try {
        const bucket = await getUploadsBucket();
        const object = await bucket.get(gDoc.filename);
        if (object) {
          gPhoto = {
            bytes: new Uint8Array(await object.arrayBuffer()),
            rotation: gDoc.rotation ?? 0,
          };
        }
      } catch {
        // The statement stands without its photo page.
      }
    }

    const contractNote =
      record.flatDayRate
        ? null
        : record.contractLength === "three_day"
          ? "Approximated at the 3-day contract over three days - the contract is paid as one check."
          : record.contractLength === "weekly" || record.weeklyContract
            ? "Approximated at the weekly rate over five days - the week is paid as one check."
            : null;

    const due = record.workType === "other" ? null : paymentDueDate(ymd);

    const pdf = expectedPayPdf({
      performerName,
      showName: record.showName || "Untitled production",
      workDateLabel: dateLabel(ymd),
      characterName: record.characterName || undefined,
      agreementLabel: record.flatDayRate
        ? `Flat deal - $${record.flatDayRate.toFixed(2)}/day`
        : agreementLabel(record.workStatus || "theatrical_basic", ymd),
      times: [
        { label: "Call (makeup/wardrobe)", value: display(record.callTime) },
        { label: "ND meal", value: [display(record.ndMealIn), display(record.ndMealOut)].filter(Boolean).join(" - ") },
        { label: "1st meal", value: [display(record.firstMealStart), display(record.firstMealFinish)].filter(Boolean).join(" - ") },
        { label: "2nd meal", value: [display(record.secondMealStart), display(record.secondMealFinish)].filter(Boolean).join(" - ") },
        { label: "Dismissed on set", value: display(record.dismissOnSet) },
        { label: "Wrapped", value: display(record.dismissMakeupWardrobe) },
      ],
      lines,
      total: record.expectedAmount || record.calculation.grandTotal,
      dueByLabel: due ? dateLabel(due) : null,
      approximationNote: contractNote,
      gPhoto,
    });

    const slug = (record.showName || "day")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="expected-pay-${slug}-${ymd}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("expected-pay PDF error:", error);
    return NextResponse.json(
      { error: "Failed to build the PDF" },
      { status: 500 }
    );
  }
}
