"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { useFocalZoom } from "@/lib/use-focal-zoom";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

interface ExhibitGViewerProps {
  src: string;
  alt: string;
  /** PDFs get the browser's own viewer — the transform machinery is for images. */
  isPdf?: boolean;
  label?: string;
  /** Pane height cap. The pane hugs the image when it fits shorter. */
  height?: string;
  initialRotation?: number;
  /** Persist a rotation, if the caller has somewhere to put it. */
  onRotate?: (rotation: number) => void;
}

/**
 * A pannable, zoomable, rotatable view of an uploaded Exhibit G.
 *
 * Split out of the transcription page so the same reading tools are
 * available anywhere someone is copying figures off a photographed card —
 * which, on a phone, means being able to get in close on one column.
 */
export function ExhibitGViewer({
  src,
  alt,
  isPdf = false,
  label,
  height = "45vh",
  initialRotation = 0,
  onRotate,
}: ExhibitGViewerProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  /** The sized box the image lives in — what the zoom actually grows. */
  const cardBoxRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(initialRotation);
  // Zoom anchored to the pinch point / cursor / pane centre, so the
  // column being read stays put instead of sliding to the corner.
  const { paneRef, paneEl, onTouchStart, onTouchEnd, zoomAtCenter } =
    useFocalZoom({
      contentRef: cardBoxRef,
      zoom,
      setZoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    });

  /**
   * The pane's height cap in pixels, read while the pane still stands at
   * the cap — once measured it hugs the image, and hugged height would
   * make each later fit tighter than the one before.
   */
  const capPx = useRef(0);

  /** Whole card in view: the largest zoom that fits width AND height. */
  const containZoom = (pane: HTMLElement, w: number, h: number, rot: number) => {
    const contentW = rot % 180 === 0 ? w : h;
    const contentH = rot % 180 === 0 ? h : w;
    const cap = capPx.current || pane.clientHeight;
    return clampZoom(Math.min(pane.clientWidth / contentW, cap / contentH));
  };

  /**
   * Learn the image's size and fit the whole card in view — once, from
   * whichever of onLoad, the ref callback or the mount effect sees a
   * complete image first. A cached image can finish loading before React
   * attaches onLoad, and missing the measurement leaves the image at
   * natural size showing one corner of the card. The measurement is only
   * consumed once the pane is actually laid out, so an early call
   * retries instead of wedging at 100%; the once-guard keeps later
   * reruns from stomping a zoom the reader chose.
   */
  const measured = useRef(false);
  const adoptImage = (img: HTMLImageElement) => {
    if (measured.current) return;
    const { naturalWidth, naturalHeight } = img;
    const pane = paneEl.current;
    if (!naturalWidth || !naturalHeight || !pane || !pane.clientWidth) return;
    measured.current = true;
    capPx.current = pane.clientHeight;
    setNatural({ w: naturalWidth, h: naturalHeight });
    setZoom(containZoom(pane, naturalWidth, naturalHeight, rotation));
  };
  useEffect(() => {
    if (imgRef.current?.complete) adoptImage(imgRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The Fit button: back to the whole card, however deep the zoom went. */
  const fitToView = useCallback(() => {
    const pane = paneEl.current;
    if (!pane || !natural.w || !natural.h) return;
    setZoom(containZoom(pane, natural.w, natural.h, rotation));
  }, [natural, rotation, paneEl]);

  const baseW = natural.w * zoom;
  const baseH = natural.h * zoom;
  const displayW = rotation % 180 === 0 ? baseW : baseH;
  const displayH = rotation % 180 === 0 ? baseH : baseW;

  /** Rotating about the top-left corner needs a compensating shift back in. */
  const rotationTransform = (() => {
    if (rotation === 90) return `translate(${displayW}px, 0) rotate(90deg)`;
    if (rotation === 180)
      return `translate(${displayW}px, ${displayH}px) rotate(180deg)`;
    if (rotation === 270) return `translate(0, ${displayH}px) rotate(270deg)`;
    return "none";
  })();

  const rotate = () => {
    const next = (rotation + 90) % 360;
    setRotation(next);
    onRotate?.(next);
  };

  if (isPdf) {
    return (
      <div className="rounded-lg border overflow-hidden">
        {label && (
          <div className="px-2 py-1.5 bg-muted/40 border-b text-xs truncate">
            {label}
          </div>
        )}
        <iframe src={src} title={alt} className="w-full border-0" style={{ height }} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden bg-background">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-muted/40 border-b">
        <span className="text-xs text-muted-foreground truncate min-w-0">
          {label ?? alt}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <ToolButton label="Zoom out" onClick={() => zoomAtCenter(0.8)}>
            <ZoomOut className="h-4 w-4" />
          </ToolButton>
          <span className="text-[11px] tabular-nums text-muted-foreground w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <ToolButton label="Zoom in" onClick={() => zoomAtCenter(1.25)}>
            <ZoomIn className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Fit the whole card" onClick={fitToView}>
            <Maximize2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="Rotate" onClick={rotate}>
            <RotateCw className="h-4 w-4" />
          </ToolButton>
        </div>
      </div>

      <div
        ref={paneRef}
        className="overflow-auto bg-muted"
        // The prop is a cap, not the size: a card photographed landscape
        // fits well short of it, and a fixed pane would show a slab of
        // dead space under the image. Until the image loads there is no
        // content height, so hold the cap to avoid a grow-on-load jump.
        style={{
          height: displayH ? `min(${Math.ceil(displayH)}px, ${height})` : height,
          minHeight: "4rem",
          touchAction: "pan-x pan-y",
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Centered: when the fit is bound by height, the leftover width
            splits evenly instead of hanging off one side. */}
        <div
          ref={cardBoxRef}
          style={{
            width: displayW || "100%",
            height: displayH || "100%",
            marginInline: "auto",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            draggable={false}
            ref={(el) => {
              imgRef.current = el;
              if (el && el.complete) adoptImage(el);
            }}
            // Read synchronously: React clears currentTarget before any
            // state updater inside would run.
            onLoad={(e) => adoptImage(e.currentTarget)}
            style={{
              width: baseW || undefined,
              height: baseH || undefined,
              maxWidth: "none",
              transformOrigin: "top left",
              transform: rotationTransform,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
    >
      {children}
    </button>
  );
}
