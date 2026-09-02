import { NextResponse } from "next/server";
import { getSession, isAdminEmail } from "@/lib/auth";
import { findGUploadById, updateGUpload } from "@/lib/repos/g-uploads";
import { findWorkRecord, updateWorkRecord } from "@/lib/repos/work-records";
import { documentTypeForKind, isUploadKind } from "@/lib/upload-kind";

/**
 * PATCH /api/admin/g-uploads/[id] — { kind }. Admin only: reclassify any
 * member's file from the transcribe queue. The day's matching document
 * is retyped with it, the same as the member's own pulldown does.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "admin" && !isAdminEmail(session.email))) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const { id } = await params;
    const upload = await findGUploadById(id);
    if (!upload) return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    const body = (await request.json()) as { kind?: string };
    if (!isUploadKind(body.kind)) {
      return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
    }
    const kind = body.kind;
    if (upload.workRecordId) {
      const record = await findWorkRecord(upload.workRecordId, upload.userId);
      if (record) {
        const documents = (record.documents ?? []).map((d) =>
          d.filename === upload.filename
            ? { ...d, documentType: documentTypeForKind(kind) }
            : d
        );
        await updateWorkRecord(upload.workRecordId, upload.userId, { documents });
      }
    }
    await updateGUpload(id, upload.userId, { kind });
    return NextResponse.json({ kind });
  } catch (error) {
    console.error("admin g-upload PATCH error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
