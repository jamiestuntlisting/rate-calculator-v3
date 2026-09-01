/**
 * A minimal PDF writer: Helvetica/Courier text, hairline rules, and
 * JPEG photographs, uncompressed. No dependency on purpose — a PDF
 * library would ride the Worker bundle for what is a few hundred lines
 * of format, and these documents are one or two pages of text.
 *
 * Pages are US Letter, 612×792pt, origin bottom-left as PDF has it.
 * Money columns use Courier so right-alignment is exact arithmetic
 * (600/1000em per glyph) instead of a shipped width table.
 */

export const PAGE_W = 612;
export const PAGE_H = 792;

/** Text kept to WinAnsi's comfortable core; typography folds to ASCII. */
function sanitize(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/·/g, "-")
    .replace(/→/g, "->")
    .replace(/[^\x20-\x7e]/g, "?");
}

function escapeText(text: string): string {
  return sanitize(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export type PdfFont = "helvetica" | "helveticaBold" | "courier" | "courierBold";

const FONT_RES: Record<PdfFont, string> = {
  helvetica: "/F1",
  helveticaBold: "/F2",
  courier: "/F3",
  courierBold: "/F4",
};

/** Courier is monospace: exact width, used for right-aligned figures. */
export function courierWidth(text: string, size: number): number {
  return sanitize(text).length * 0.6 * size;
}

export interface JpegImage {
  bytes: Uint8Array;
  width: number;
  height: number;
  /** 1 = grayscale, 3 = RGB. */
  components: 1 | 3;
}

/** Read a JPEG's dimensions off its SOF marker; null if not a JPEG we take. */
export function readJpeg(bytes: Uint8Array): JpegImage | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const isSof =
      (marker >= 0xc0 && marker <= 0xcf) &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      const components = bytes[i + 9];
      if (components !== 1 && components !== 3) return null; // CMYK etc.
      return {
        bytes,
        height: (bytes[i + 5] << 8) | bytes[i + 6],
        width: (bytes[i + 7] << 8) | bytes[i + 8],
        components,
      };
    }
    i += 2 + length;
  }
  return null;
}

export class PdfPage {
  ops: string[] = [];
  /** Image resource names used on this page, e.g. "/Im1". */
  images = new Map<string, number>();

  text(
    x: number,
    y: number,
    content: string,
    options: { size?: number; font?: PdfFont; gray?: number } = {}
  ) {
    const size = options.size ?? 11;
    const font = FONT_RES[options.font ?? "helvetica"];
    const gray = options.gray ?? 0;
    this.ops.push(
      `q ${gray} g BT ${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapeText(content)}) Tj ET Q`
    );
  }

  /** Right-aligned Courier figure ending at x. */
  figure(
    xRight: number,
    y: number,
    content: string,
    options: { size?: number; bold?: boolean; gray?: number } = {}
  ) {
    const size = options.size ?? 11;
    this.text(xRight - courierWidth(content, size), y, content, {
      size,
      font: options.bold ? "courierBold" : "courier",
      gray: options.gray,
    });
  }

  rule(x1: number, y1: number, x2: number, y2: number, gray = 0.7, width = 0.7) {
    this.ops.push(
      `q ${gray} G ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`
    );
  }

  /**
   * Place a JPEG into the box (x, y, w, h), already scaled by the
   * caller. `rotation` is the app's quarter-turns-clockwise; the box is
   * the box the ROTATED image occupies.
   */
  jpeg(
    imageIndex: number,
    x: number,
    y: number,
    w: number,
    h: number,
    rotation: 0 | 90 | 180 | 270 = 0
  ) {
    const name = `/Im${imageIndex + 1}`;
    this.images.set(name, imageIndex);
    const matrix =
      rotation === 90
        ? `0 ${-h.toFixed(2)} ${w.toFixed(2)} 0 ${x.toFixed(2)} ${(y + h).toFixed(2)}`
        : rotation === 180
          ? `${-w.toFixed(2)} 0 0 ${-h.toFixed(2)} ${(x + w).toFixed(2)} ${(y + h).toFixed(2)}`
          : rotation === 270
            ? `0 ${h.toFixed(2)} ${-w.toFixed(2)} 0 ${(x + w).toFixed(2)} ${y.toFixed(2)}`
            : `${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`;
    this.ops.push(`q ${matrix} cm ${name} Do Q`);
  }
}

const encoder = new TextEncoder();

/** Assemble pages (and any JPEGs they placed) into PDF bytes. */
export function buildPdf(pages: PdfPage[], images: JpegImage[] = []): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let position = 0;

  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    position += bytes.length;
  };
  const beginObject = () => {
    offsets.push(position);
    return offsets.length; // object number
  };

  push("%PDF-1.4\n");

  // 1: catalog, 2: pages tree, 3-6: the four fonts.
  const catalogNum = beginObject();
  push(`${catalogNum} 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  const pagesNum = beginObject();
  const firstPageObj = 7 + images.length;
  const kids = pages
    .map((_, i) => `${firstPageObj + i * 2 + 1} 0 R`)
    .join(" ");
  push(
    `${pagesNum} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`
  );
  for (const base of [
    "Helvetica",
    "Helvetica-Bold",
    "Courier",
    "Courier-Bold",
  ]) {
    const n = beginObject();
    push(
      `${n} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>\nendobj\n`
    );
  }

  // Images: objects 7 .. 6+images.length.
  const imageObjectNumbers: number[] = [];
  for (const image of images) {
    const n = beginObject();
    imageObjectNumbers.push(n);
    push(
      `${n} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
        `/ColorSpace ${image.components === 1 ? "/DeviceGray" : "/DeviceRGB"} ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`
    );
    push(image.bytes);
    push("\nendstream\nendobj\n");
  }

  for (const page of pages) {
    const content = page.ops.join("\n");
    const contentNum = beginObject();
    const contentBytes = encoder.encode(content);
    push(
      `${contentNum} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`
    );
    push(contentBytes);
    push("\nendstream\nendobj\n");

    const xobjects = [...page.images.entries()]
      .map(([name, index]) => `${name} ${imageObjectNumbers[index]} 0 R`)
      .join(" ");
    const pageNum = beginObject();
    push(
      `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >>` +
        (xobjects ? ` /XObject << ${xobjects} >>` : "") +
        ` >> /Contents ${contentNum} 0 R >>\nendobj\n`
    );
  }

  const xrefAt = position;
  const pad = (n: number) => String(n).padStart(10, "0");
  push(
    `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n` +
      offsets.map((o) => `${pad(o)} 00000 n \n`).join("")
  );
  push(
    `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  );

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}
