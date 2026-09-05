import { NextResponse } from "next/server";
import { getSession, isAdminEmail } from "@/lib/auth";
import { findAudit } from "@/lib/repos/audits";
import { ingestGUploads } from "@/lib/g-ingest";

/**
 * POST /api/admin/audits/[id]/uploads — the run's Exhibit Gs, field
 * `file` (one or many). The same ingest as the pile (dedupe, R2,
 * thumbnails made by the browser that lists them), owned by the admin
 * signed in and tagged to the audit, so no work day opens for them.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && !isAdminEmail(session.email))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id } = await params;
  const audit = await findAudit(id);
  if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  try {
    const formData = await request.formData();
    const files = formData.getAll("file").filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    const { created, duplicates } = await ingestGUploads(
      session.userId,
      await Promise.all(files.map(async (file) => ({ name: file.name, type: file.type, bytes: await file.arrayBuffer() }))),
      undefined,
      { auditId: id }
    );
    return NextResponse.json({ created, duplicates }, { status: created.length ? 201 : 200 });
  } catch (error) {
    console.error("audit upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
