/**
 * What may be attached to a work record: photographs of paperwork, and PDFs.
 *
 * Videos are refused. A phone's picker offers them alongside photos, and a
 * clip of the gag is not a call sheet — it would sit in R2 costing storage
 * and never be read. `accept` only hints to the picker, so the rule is
 * checked when a file is chosen and again on the way in.
 */

/** Hint for the file picker. Not a guarantee — iOS offers video anyway. */
export const UPLOAD_ACCEPT = "image/*,application/pdf";

/** Extensions the uploads route stores, and the type it stores them as. */
export const UPLOAD_MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heic",
  pdf: "application/pdf",
};

export function extensionOf(filename: string): string {
  const parts = (filename || "").split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

/**
 * Judged on the declared type first and the extension second, so a video
 * renamed .jpg still fails on its type and a photo with no type at all
 * still passes on its extension.
 */
export function isUploadable(contentType: string, filename: string): boolean {
  const type = (contentType || "").toLowerCase();
  if (type.startsWith("video/")) return false;
  if (type.startsWith("image/") || type === "application/pdf") return true;
  // No usable type — fall back to what the name says.
  return extensionOf(filename) in UPLOAD_MIME_TYPES;
}

/** The type to store a file as, once it is known to be allowed. */
export function storedContentType(
  contentType: string,
  filename: string
): string {
  return (
    UPLOAD_MIME_TYPES[extensionOf(filename)] ||
    contentType ||
    "application/octet-stream"
  );
}
