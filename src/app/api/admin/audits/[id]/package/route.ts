import { NextResponse } from "next/server";
import { getSession, isAdminEmail } from "@/lib/auth";
import { findAudit, listAuditUploads } from "@/lib/repos/audits";
import { auditPackagePdf, type PackageDay } from "@/lib/audit-package";

/** GET /api/admin/audits/[id]/package — the package PDF, as a sample built from the cards transcribed so far. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && !isAdminEmail(session.email))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id } = await params;
  const audit = await findAudit(id);
  if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  const uploads = await listAuditUploads(id);
  const days: PackageDay[] = [];
  for (const u of uploads) {
    const t = u.transcription as { details?: { workDate?: string }; rows?: Array<Record<string, string>> } | null;
    if (!t) continue;
    const row = t.rows?.[0] ?? {};
    days.push({
      performer: (row.performer || "").trim() || "(performer not named)",
      workDate: t.details?.workDate ?? "",
      callTime: row.callTime ?? "",
      wrap: row.dismissMakeupWardrobe || row.dismissOnSet || "",
      owed: null,
      paid: null,
    });
  }
  const generatedOn = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const bytes = auditPackagePdf(audit, days, generatedOn);
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="audit-${audit.showName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-sample.pdf"`,
    },
  });
}
