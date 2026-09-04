import type { DocumentType } from "@/types";
import type { GUpload } from "@/lib/repos/g-uploads";
import { deleteWorkRecord, findWorkRecord, updateWorkRecord } from "@/lib/repos/work-records";
import { unmirrorLater } from "@/lib/google-calendar";
import { planAttach } from "@/lib/attach-upload";

/**
 * Move an upload's document onto another of the owner's days — the
 * server side of "which work day is this for?" (planAttach decides
 * what happens to the day it leaves). Shared by the member's own
 * PATCH and the admin's, so the queue and the pile do the same thing.
 * Returns the target's id, or null when the target is not the owner's.
 */
export async function moveUploadToDay(
  upload: Pick<GUpload, "userId" | "filename" | "workRecordId">,
  targetId: string,
  documentType: DocumentType
): Promise<string | null> {
  const target = await findWorkRecord(targetId, upload.userId);
  if (!target) return null;
  const old = upload.workRecordId ? await findWorkRecord(upload.workRecordId, upload.userId) : null;
  const plan = planAttach(
    old ?? { recordStatus: "attachment_only", documents: [] },
    upload.filename,
    documentType
  );
  await updateWorkRecord(target._id, upload.userId, {
    documents: [...(target.documents ?? []), ...(plan.moved ? [plan.moved] : [])],
  });
  if (old) {
    if (plan.deleteOld) {
      await deleteWorkRecord(old._id, upload.userId);
      unmirrorLater(upload.userId, old.googleEventId ?? null);
    } else {
      await updateWorkRecord(old._id, upload.userId, { documents: plan.remaining });
    }
  }
  return target._id;
}
