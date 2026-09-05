import { NextResponse } from "next/server";
import { getSession, isAdminEmail } from "@/lib/auth";
import { findAudit, listAuditUploads, updateAudit } from "@/lib/repos/audits";

async function requireAdmin() {
  const session = await getSession();
  if (!session || (session.role !== "admin" && !isAdminEmail(session.email))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return null;
}

/** GET /api/admin/audits/[id] — the audit and its cards, with their transcription state. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const audit = await findAudit(id);
  if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  const uploads = await listAuditUploads(id);
  return NextResponse.json({ audit, uploads });
}

/** PATCH /api/admin/audits/[id] — { showName?, performers?, notes?, status? }. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json()) as { showName?: string; performers?: string; notes?: string; status?: string };
  const patch: Parameters<typeof updateAudit>[1] = {};
  if (typeof body.showName === "string" && body.showName.trim()) patch.showName = body.showName.trim();
  if (typeof body.performers === "string") patch.performers = body.performers;
  if (typeof body.notes === "string") patch.notes = body.notes;
  if (body.status === "open" || body.status === "closed") patch.status = body.status;
  const audit = await updateAudit(id, patch);
  if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  return NextResponse.json({ audit });
}
