import type { DocumentType } from "@/types";

/**
 * What a file a member sends in is. Only an Exhibit G is transcribed;
 * everything else starts the day (or joins it) and rides along as its
 * attachment. Kept free of server imports so the pulldowns can use it.
 */
export const UPLOAD_KINDS = [
  "exhibit_g",
  "call_sheet",
  "contract",
  "start_paperwork",
  "paystub",
  "wardrobe_photo",
  "photo",
  "conversation",
  "other",
] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export const UPLOAD_KIND_LABELS: Record<UploadKind, string> = {
  exhibit_g: "Exhibit G",
  call_sheet: "Call sheet",
  contract: "Contract",
  start_paperwork: "Start paperwork",
  paystub: "Pay stub",
  wardrobe_photo: "Wardrobe",
  photo: "Photo",
  conversation: "Conversation",
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
