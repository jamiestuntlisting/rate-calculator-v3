/**
 * A small JPEG copy of an image for lists — 320 px on its long edge,
 * made in the browser from the original so nothing on the Worker has
 * to decode a photo. The browser applies the photo's EXIF orientation
 * when it paints an <img>, so drawing that <img> gives an upright copy.
 * Returns null for anything the browser cannot paint (a PDF, a HEIC on
 * a browser without it), and the list keeps showing what it showed.
 */
export const THUMBNAIL_EDGE = 320;

export function thumbnailSize(w: number, h: number, edge: number = THUMBNAIL_EDGE): { w: number; h: number } {
  const long = Math.max(w, h);
  if (!long) return { w: 0, h: 0 };
  const k = Math.min(1, edge / long);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

export async function makeThumbnail(blob: Blob): Promise<Blob | null> {
  if (!blob.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const size = thumbnailSize(img.naturalWidth, img.naturalHeight);
    if (!size.w) return null;
    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size.w, size.h);
    const px = ctx.getImageData(Math.floor(size.w / 2), Math.floor(size.h / 2), 1, 1).data;
    if (px[3] === 0) return null;
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
