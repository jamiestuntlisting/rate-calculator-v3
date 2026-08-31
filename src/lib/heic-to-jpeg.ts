/**
 * iPhones shoot HEIC, and only Safari can draw it — everywhere else an
 * uploaded HEIC stores fine and then shows "Preview not available"
 * forever. So the browser converts at the moment of upload: a HEIC
 * becomes a JPEG before it ever leaves the page, and everything
 * downstream — thumbnails, the transcription viewer, R2 — only ever
 * sees a format every browser can draw. The decoder is a hefty wasm
 * bundle, so it loads lazily and only when a HEIC actually lands.
 *
 * Client-side only: the server keeps accepting raw HEIC as a fallback,
 * because a failed conversion still beats a lost upload.
 */

const HEIC_EXT = /\.(heic|heif)$/i;

export function isHeic(file: File): boolean {
  return HEIC_EXT.test(file.name) || /^image\/hei[cf]$/i.test(file.type);
}

export async function toUploadableImage(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  try {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });
    // A burst/multi-image HEIC comes back as an array; the first frame
    // is the photo.
    const blob = Array.isArray(converted) ? converted[0] : converted;
    const name = file.name.replace(HEIC_EXT, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    // Stored as-is — the preview may not render, but the file survives.
    return file;
  }
}
