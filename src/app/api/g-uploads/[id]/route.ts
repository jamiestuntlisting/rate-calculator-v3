import { NextResponse } from "next/server";
import { getUploadsBucket } from "@/lib/db";
import {
  deleteGUpload,
  findGUpload,
  updateGUpload,
} from "@/lib/repos/g-uploads";
import { findWorkRecord, updateWorkRecord } from "@/lib/repos/work-records";
import { recalculateDay } from "@/lib/day-recalc";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const upload = await findGUpload(
      id,
      await getEffectiveUserId(auth.session)
    );

    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }
    return NextResponse.json(upload);
  } catch (error) {
    console.error("Error fetching Exhibit G upload:", error);
    return NextResponse.json(
      { error: "Failed to fetch upload" },
      { status: 500 }
    );
  }
}

/** PATCH — rename, rotate, or save the transcription. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await request.json();
    const userId = await getEffectiveUserId(auth.session);

    // Anything the transcriber has filled in so far, even a single field.
    const details = body.transcription?.details as
      | { showName?: string; workDate?: string }
      | undefined;

    const existing = await findGUpload(id, userId);
    if (!existing) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    // A show name doubles as the upload's title until one is set by hand.
    const title =
      body.title !== undefined
        ? body.title
        : !existing.title.trim() && details?.showName?.trim()
          ? details.showName.trim()
          : undefined;

    const upload = await updateGUpload(id, userId, {
      ...(title !== undefined ? { title } : {}),
      ...(body.rotation !== undefined ? { rotation: body.rotation } : {}),
      ...(body.transcription !== undefined
        ? { transcription: body.transcription }
        : {}),
      // Saving and finishing are different acts: `done: true` stamps the
      // transcription finished, `done: false` reopens it for correction.
      ...(typeof body.done === "boolean"
        ? { transcribedAt: body.done ? new Date().toISOString() : null }
        : {}),
    });

    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    // Keep the tracker row in step with whatever has been transcribed.
    if (existing.workRecordId && (details || body.transcription)) {
      const row = body.transcription?.rows?.[0] as
        | Record<string, string>
        | undefined;
      const patch: Record<string, unknown> = {};
      if (details?.showName?.trim()) patch.showName = details.showName.trim();
      if (details?.workDate) patch.workDate = details.workDate;
      for (const field of [
        "callTime",
        "ndMealIn",
        "ndMealOut",
        "firstMealStart",
        "firstMealFinish",
        "secondMealStart",
        "secondMealFinish",
        "dismissOnSet",
        "dismissMakeupWardrobe",
        "notes",
      ]) {
        const value = row?.[field];
        if (value) patch[field] = value;
      }
      // The transcription row calls it "character"; the work record calls
      // it "characterName".
      if (row?.character) patch.characterName = row.character;
      // The adjustment is typed as text on the form; the record stores
      // dollars. An explicit 0 lands too — only an empty box is silence.
      const adjustment = parseFloat(String(row?.stuntAdjustment ?? ""));
      if (Number.isFinite(adjustment) && adjustment >= 0) {
        patch.stuntAdjustment = adjustment;
      }
      // Times present means it is no longer just an attachment.
      if (patch.callTime && patch.dismissOnSet) patch.recordStatus = "complete";
      else if (Object.keys(patch).length > 0) patch.recordStatus = "draft";

      if (Object.keys(patch).length > 0) {
        await updateWorkRecord(existing.workRecordId, userId, patch);
        // A transcription that filled in the times has priced the day:
        // re-derive the stored calculation the same way the weekly stamp
        // paths do, so the Tracker and Resolve stop reading "not logged"
        // for a day whose card was read in. Days without enough to
        // compute stay exactly as they are.
        const updated = await findWorkRecord(existing.workRecordId, userId);
        if (updated) {
          const result = recalculateDay(updated);
          if (result) {
            await updateWorkRecord(existing.workRecordId, userId, {
              calculation: result.calculation,
              expectedAmount: result.expectedAmount,
            });
          }
        }
      }
    }

    return NextResponse.json(upload);
  } catch (error) {
    console.error("Error updating Exhibit G upload:", error);
    return NextResponse.json(
      { error: "Failed to update upload" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const deleted = await deleteGUpload(
      id,
      await getEffectiveUserId(auth.session)
    );

    if (!deleted) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    // Remove the object too — the row is gone, so nothing references it.
    try {
      const bucket = await getUploadsBucket();
      await bucket.delete(deleted.filename);
    } catch (error) {
      console.error("Failed to delete R2 object:", error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting Exhibit G upload:", error);
    return NextResponse.json(
      { error: "Failed to delete upload" },
      { status: 500 }
    );
  }
}
