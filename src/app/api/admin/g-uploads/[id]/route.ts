import { NextResponse } from "next/server";
import { getSession, isAdminEmail } from "@/lib/auth";
import { findGUploadById, updateGUpload } from "@/lib/repos/g-uploads";
import { findWorkRecord, updateWorkRecord } from "@/lib/repos/work-records";
import { documentTypeForKind, isUploadKind } from "@/lib/upload-kind";
import { moveUploadToDay } from "@/lib/attach-upload-server";

/**
 * PATCH /api/admin/g-uploads/[id] — { kind, workRecordId? }. Admin only:
 * reclassify any member's file from the transcribe queue. The day's
 * matching document is retyped with it, the same as the member's own
 * pulldown does; with a workRecordId (one of the member's days) the
 * document moves there instead, and the placeholder day it opened goes
 * when it was only that file — the same move the member's PATCH makes.
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
    const body = (await request.json()) as { kind?: string; workRecordId?: string };
    if (!isUploadKind(body.kind)) {
      return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
    }
    const kind = body.kind;
    let movedTo: string | null = null;
    if (typeof body.workRecordId === "string" && body.workRecordId !== upload.workRecordId) {
      movedTo = await moveUploadToDay(upload, body.workRecordId, documentTypeForKind(kind));
      if (!movedTo) {
        return NextResponse.json({ error: "That work day was not found" }, { status: 404 });
      }
    }
    if (upload.workRecordId && !movedTo) {
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
    await updateGUpload(id, upload.userId, { kind, ...(movedTo ? { workRecordId: movedTo } : {}) });
    return NextResponse.json({ kind, workRecordId: movedTo ?? upload.workRecordId });
  } catch (error) {
    console.error("admin g-upload PATCH error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
