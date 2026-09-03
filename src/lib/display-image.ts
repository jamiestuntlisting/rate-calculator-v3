/**
 * A display copy of a big photo. iOS Safari stops painting an image
 * once the bitmap it must decode gets too large — a 48-megapixel
 * phone photo goes blank on the transcription card past about a
 * third of its size — so the card window shows a copy no longer than
 * DISPLAY_MAX_EDGE on its long side, drawn in the browser from the
 * original. The stored file is untouched; only what is painted
 * shrinks. Zoom still runs to 8×, which on a 3000px copy is ~1000 px
 * per inch of card.
 */
export const DISPLAY_MAX_EDGE = 3000;

/** The size a w×h image is drawn at to fit its long edge in `max`. */
export function fitWithin(w: number, h: number, max: number = DISPLAY_MAX_EDGE): { w: number; h: number; scaled: boolean } {
  const edge = Math.max(w, h);
  if (!edge || edge <= max) return { w, h, scaled: false };
  const k = max / edge;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), scaled: true };
}

/**
 * Draw a loaded image at display size and return an object URL for
 * the copy, or null when the copy could not be made — a blank draw
 * (the same limit can empty a canvas) is caught by sampling the
 * middle pixel, so the caller falls back to the original rather than
 * showing nothing.
 */
export async function displayCopy(img: HTMLImageElement): Promise<{ url: string; w: number; h: number } | null> {
  const size = fitWithin(img.naturalWidth, img.naturalHeight);
  if (!size.scaled) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size.w, size.h);
    const px = ctx.getImageData(Math.floor(size.w / 2), Math.floor(size.h / 2), 1, 1).data;
    if (px[3] === 0) return null;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!blob) return null;
    return { url: URL.createObjectURL(blob), w: size.w, h: size.h };
  } catch {
    return null;
  }
}
