import { NextResponse } from "next/server";
import { getUploadsBucket } from "@/lib/db";
import {
  deleteGUpload,
  findGUpload,
  updateGUpload,
} from "@/lib/repos/g-uploads";
import { findWorkRecord, updateWorkRecord } from "@/lib/repos/work-records";
import { recalculateDay } from "@/lib/day-recalc";
import { doneBlockers, listMissing } from "@/lib/transcription-done";
import { mirrorLater } from "@/lib/google-calendar";
import { documentTypeForKind, isUploadKind } from "@/lib/upload-kind";
import { latestGReading, replaceGReadingScores } from "@/lib/repos/g-readings";
import { scoreReading } from "@/lib/g-reader/score";
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
    // The day's notes ride along: a G that came in by text or email
    // carries where it came from there, and the transcription form
    // shows it in its Notes box so a save keeps it.
    const record = upload.workRecordId
      ? await findWorkRecord(upload.workRecordId, upload.userId)
      : null;
    // Claude's reading of the card, when one was made (testers only):
    // the form opens pre-filled from it.
    const reading = await latestGReading(upload._id, upload.userId);
    return NextResponse.json({
      ...upload,
      workRecordNotes: record?.notes ?? "",
      reading,
    });
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

    // Done needs the minimum (transcription-done.ts): the show, the
    // date, the day's brackets, and the lunch answer with its times.
    // Judged on the transcription this request carries (or the stored
    // one, for a bare done flag), and enforced here as well as on the
    // form, so no client can stamp a G finished short of it.
    if (body.done === true) {
      const final = (body.transcription ?? existing.transcription) as {
        details?: { showName?: string; workDate?: string };
        rows?: Array<Record<string, string>>;
      } | null;
      const missing = doneBlockers({ ...final?.details, ...final?.rows?.[0] });
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `Enter ${listMissing(missing)} before marking it done.` },
          { status: 400 }
        );
      }
    }

    // Reclassify: the upload's kind and the day's matching document move
    // together, so the pile and the tracker never disagree about what a
    // file is. A call sheet made an Exhibit G joins the pile; an Exhibit
    // G made a call sheet leaves it, keeping whatever was transcribed.
    if (body.kind !== undefined) {
      if (!isUploadKind(body.kind)) {
        return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
      }
      if (existing.workRecordId) {
        const record = await findWorkRecord(existing.workRecordId, userId);
        if (record) {
          const documents = (record.documents ?? []).map((d) =>
            d.filename === existing.filename
              ? { ...d, documentType: documentTypeForKind(body.kind) }
              : d
          );
          await updateWorkRecord(existing.workRecordId, userId, { documents });
        }
      }
    }

    // Done is the final answer: score Claude's reading of the card
    // against it, field by field. Reopening and finishing again
    // replaces the scores, so the last word always counts.
    if (body.done === true) {
      const reading = await latestGReading(id, userId);
      if (reading?.reading) {
        const final = (body.transcription ?? existing.transcription) as {
          details?: { showName?: string; workDate?: string };
          rows?: Array<Record<string, string>>;
        } | null;
        const row = final?.rows?.[0] ?? {};
        await replaceGReadingScores(
          reading,
          scoreReading(reading.reading, {
            showName: final?.details?.showName,
            workDate: final?.details?.workDate,
            character: row.character,
            callTime: row.callTime,
            ndMealIn: row.ndMealIn,
            firstMealStart: row.firstMealStart,
            firstMealFinish: row.firstMealFinish,
            secondMealStart: row.secondMealStart,
            secondMealFinish: row.secondMealFinish,
            dismissOnSet: row.dismissOnSet,
            dismissMakeupWardrobe: row.dismissMakeupWardrobe,
            stuntAdjustment: row.stuntAdjustment,
          })
        );
      }
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
      ...(body.kind !== undefined ? { kind: body.kind } : {}),
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
      // Who a stunt double stood in for. Copied whenever the row carries
      // the key, so clearing the box clears the record too.
      if (row && "actorDoubled" in row) patch.actorDoubled = row.actorDoubled;
      // The adjustment is typed as text on the form; the record stores
      // dollars. An explicit 0 lands too — only an empty box is silence.
      const adjustment = parseFloat(String(row?.stuntAdjustment ?? ""));
      if (Number.isFinite(adjustment) && adjustment >= 0) {
        patch.stuntAdjustment = adjustment;
      }
      // The day-multiplier flags land as themselves, unchecking included —
      // a row that carries the key said something either way. Rows saved
      // before the checkboxes existed lack the keys and change nothing.
      for (const flag of [
        "forcedCall",
        "isSixthDay",
        "isSeventhDay",
        "isHoliday",
      ] as const) {
        const value = (row as Record<string, unknown> | undefined)?.[flag];
        if (typeof value === "boolean") patch[flag] = value;
      }
      // Times present means it is no longer just an attachment.
      if (patch.callTime && patch.dismissOnSet) patch.recordStatus = "complete";
      else if (Object.keys(patch).length > 0) patch.recordStatus = "draft";

      if (Object.keys(patch).length > 0) {
        await updateWorkRecord(existing.workRecordId, userId, patch);
        mirrorLater(userId, existing.workRecordId);
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
