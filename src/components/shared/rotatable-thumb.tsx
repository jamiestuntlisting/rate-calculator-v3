"use client";

import { RotateCw } from "lucide-react";

/**
 * A small preview of an uploaded image with the one control every preview
 * here owes the user: rotate. Phones photograph paperwork sideways, and a
 * preview that cannot be turned teaches people to stop looking at it.
 *
 * One structure for every surface that shows an uploaded image small — the
 * document rows on the forms, the attachment list on a saved day. The
 * full-screen reading view is `ExhibitGViewer`, which pans and zooms; this
 * is deliberately just the picture and the turn.
 *
 * The box is square, which is what makes rotation safe to draw with a bare
 * CSS transform: every quarter-turn of an object-contain image still fits.
 */
export function RotatableThumb({
  src,
  alt,
  rotation = 0,
  onRotate,
  className = "",
}: {
  src: string;
  alt: string;
  rotation?: number;
  /** Called with the next quarter-turn; the caller owns persisting it. */
  onRotate?: (rotation: number) => void;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <div className="aspect-square w-full overflow-hidden rounded-md border border-border bg-muted/40 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          style={{ transform: `rotate(${rotation}deg)` }}
          className="max-w-full max-h-full object-contain transition-transform"
        />
      </div>
      {onRotate && (
        <button
          type="button"
          aria-label={`Rotate ${alt}`}
          onClick={() => onRotate((rotation + 90) % 360)}
          className="absolute bottom-1 right-1 rounded-md border border-border bg-background/90 p-1.5 hover:bg-accent"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
