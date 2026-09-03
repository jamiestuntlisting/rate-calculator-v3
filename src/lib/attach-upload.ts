import type { DocumentType, WorkDocument } from "@/types";

/**
 * Moving a file from the day it started onto the day it belongs to.
 * Every upload opens a day of its own (g-ingest), so a call sheet that
 * arrived as an Exhibit G has a placeholder day under it. When the
 * performer says it was part of another day, the document leaves the
 * placeholder for that day, and the placeholder is deleted only when
 * it was nothing but the attachment — `attachment_only` with no other
 * file. A day with times, or another file on it, stays.
 */
export interface AttachPlan {
  /** The old day's documents after the file leaves. */
  remaining: WorkDocument[];
  /** The document as it lands on the new day, retyped. */
  moved: WorkDocument | null;
  /** The old day was only this attachment and can go. */
  deleteOld: boolean;
}

export function planAttach(
  old: { recordStatus: string; documents?: WorkDocument[] | null },
  filename: string,
  documentType: DocumentType,
  now: string = new Date().toISOString()
): AttachPlan {
  const documents = old.documents ?? [];
  const found = documents.find((d) => d.filename === filename) ?? null;
  const remaining = documents.filter((d) => d.filename !== filename);
  const moved = found
    ? { ...found, documentType }
    : { filename, originalName: filename, documentType, uploadedAt: now };
  return {
    remaining,
    moved,
    deleteOld: old.recordStatus === "attachment_only" && remaining.length === 0,
  };
}
