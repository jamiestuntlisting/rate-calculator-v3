import type { DocumentType } from "@/types";

/**
 * What a file a member sends in is. An Exhibit G is transcribed; a
 * call sheet is not — it starts the day and rides along as its
 * attachment — and "other" is anything else worth keeping with the
 * day. Kept free of server imports so the pulldowns can use it.
 */
export const UPLOAD_KINDS = ["exhibit_g", "call_sheet", "other"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export const UPLOAD_KIND_LABELS: Record<UploadKind, string> = {
  exhibit_g: "Exhibit G",
  call_sheet: "Call sheet",
  other: "Other",
};

export function isUploadKind(v: unknown): v is UploadKind {
  return typeof v === "string" && (UPLOAD_KINDS as readonly string[]).includes(v);
}

/**
 * The kind a file arrives as: a PDF is assumed to be the call sheet
 * (an Exhibit G is a photograph of a card), everything else an Exhibit
 * G. Either can be reclassified afterwards.
 */
export function kindForUpload(contentType: string, filename: string): UploadKind {
  const type = (contentType || "").toLowerCase();
  const name = (filename || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "call_sheet";
  return "exhibit_g";
}

/** The work record's document type for an upload kind. */
export function documentTypeForKind(kind: UploadKind): DocumentType {
  return kind;
}

/** The upload kind a document type maps back to, for the day's pulldown. */
export function kindForDocumentType(type: DocumentType): UploadKind | null {
  return isUploadKind(type) ? type : null;
}
