"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Zoom that stays under the fingers.
 *
 * A scrollable pane holds a content box whose width and height are the
 * image's size times the zoom. Changing the zoom alone grows the box
 * down and to the right, so the view drifts toward the top-left corner
 * — the paper point being pinched slides away from the fingers. This
 * hook re-anchors every zoom step: it notes which fraction of the
 * content sits under the gesture (the pinch midpoint, the cursor for
 * ctrl/⌘ + wheel, the pane centre for the buttons), lets React commit
 * the new size, then sets the pane's scroll so that same fraction is
 * back under the same screen point. During a pinch the anchor is the
 * spot grabbed at the start, so moving both fingers pans while zooming,
 * the way every photo viewer behaves.
 *
 * The wheel and touchmove listeners are attached by hand, non-passive,
 * because React registers those events passively and a passive
 * preventDefault is silently ignored — which is how a pinch used to
 * zoom the whole page along with the card.
 */

interface FocalZoomOptions {
  /** The sized content box inside the pane — the thing that grows. */
  contentRef: React.RefObject<HTMLElement | null>;
  zoom: number;
  setZoom: (zoom: number) => void;
  minZoom: number;
  maxZoom: number;
}

/**
 * The scrollTop that puts a content line (a fraction of the content's
 * height) under the pane's vertical centre.
 */
export function lockedScrollTop(
  fraction: number,
  contentHeight: number,
  paneHeight: number
): number {
  return Math.max(0, fraction * contentHeight - paneHeight / 2);
}

/**
 * Which line of the content sits under the pane's vertical centre now —
 * what the lock grabs when it closes.
 */
export function anchorFraction(
  scrollTop: number,
  paneHeight: number,
  contentHeight: number
): number {
  if (contentHeight < 1) return 0;
  return Math.min(1, Math.max(0, (scrollTop + paneHeight / 2) / contentHeight));
}

interface PendingFocal {
  /** Where on the content the anchor sits, as fractions of its size. */
  fracX: number;
  fracY: number;
  /** Where on the pane the anchor must stay, in pane coordinates. */
  focalX: number;
  focalY: number;
}

const midpoint = (touches: { clientX: number; clientY: number }[]) => ({
  x: (touches[0].clientX + touches[1].clientX) / 2,
  y: (touches[0].clientY + touches[1].clientY) / 2,
});

const touchPair = (list: TouchList | React.TouchList) => [list[0], list[1]];

const touchDistance = (list: TouchList | React.TouchList) => {
  const [a, b] = touchPair(list);
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
};

export function useFocalZoom({
  contentRef,
  zoom,
  setZoom,
  minZoom,
  maxZoom,
}: FocalZoomOptions) {
  const paneEl = useRef<HTMLElement | null>(null);
  /**
   * The row lock: a line of the content held under the pane's vertical
   * centre, as a fraction of the content's height, or null when free.
   * While set, every zoom anchors on that line instead of the gesture's
   * own height, so pinching or pressing the buttons zooms in on the row
   * being read and the row never leaves the highlight.
   */
  const anchorY = useRef<number | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  /** The committed zoom — what the DOM is currently laid out at. */
  const zoomRef = useRef(zoom);
  const pending = useRef<PendingFocal | null>(null);
  const pinch = useRef<{
    distance: number;
    zoom: number;
    fracX: number;
    fracY: number;
  } | null>(null);

  const clamp = useCallback(
    (z: number) => Math.min(maxZoom, Math.max(minZoom, z)),
    [minZoom, maxZoom]
  );

  /** The content fraction and pane point under a client coordinate. */
  const capture = useCallback(
    (clientX: number, clientY: number): PendingFocal | null => {
      const pane = paneEl.current;
      const content = contentRef.current;
      if (!pane || !content) return null;
      const paneRect = pane.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      if (contentRect.width < 1 || contentRect.height < 1) return null;
      const locked = anchorY.current;
      return {
        fracX: (clientX - contentRect.left) / contentRect.width,
        // Locked, the anchored line stays under the pane's centre
        // whatever height the fingers are at.
        fracY:
          locked != null
            ? locked
            : (clientY - contentRect.top) / contentRect.height,
        focalX: clientX - paneRect.left,
        focalY: locked != null ? pane.clientHeight / 2 : clientY - paneRect.top,
      };
    },
    [contentRef]
  );

  /** Scroll so the anchored fraction sits back under the pane point. */
  const applyPending = useCallback(() => {
    const pane = paneEl.current;
    const content = contentRef.current;
    const focal = pending.current;
    pending.current = null;
    if (!pane || !content || !focal) return;
    // The content box centres itself when narrower than the pane, so
    // its origin is not the scroll origin while letterboxed.
    const leftOffset = Math.max(0, (pane.clientWidth - content.offsetWidth) / 2);
    pane.scrollLeft = focal.fracX * content.offsetWidth + leftOffset - focal.focalX;
    pane.scrollTop = focal.fracY * content.offsetHeight - focal.focalY;
  }, [contentRef]);

  // After React commits the new size, put the anchor back under the
  // gesture — before paint, so the card never visibly jumps.
  useLayoutEffect(() => {
    zoomRef.current = zoom;
    if (pending.current) applyPending();
  }, [zoom, applyPending]);

  const zoomTo = useCallback(
    (nextZoom: number, clientX: number, clientY: number) => {
      const clamped = clamp(nextZoom);
      if (clamped === zoomRef.current) return;
      pending.current = capture(clientX, clientY);
      setZoom(clamped);
    },
    [clamp, capture, setZoom]
  );

  /** The pane's ref: attaches the non-passive listeners as it mounts. */
  const paneRef = useCallback(
    (el: HTMLElement | null) => {
      cleanup.current?.();
      cleanup.current = null;
      paneEl.current = el;
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        zoomTo(
          zoomRef.current * (e.deltaY < 0 ? 1.08 : 0.93),
          e.clientX,
          e.clientY
        );
      };
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches.length !== 2 || !pinch.current) return;
        e.preventDefault();
        const ratio = touchDistance(e.touches) / pinch.current.distance;
        const next = clamp(pinch.current.zoom * ratio);
        const mid = midpoint(touchPair(e.touches));
        const paneRect = el.getBoundingClientRect();
        const locked = anchorY.current;
        pending.current = {
          fracX: pinch.current.fracX,
          fracY: locked != null ? locked : pinch.current.fracY,
          focalX: mid.x - paneRect.left,
          focalY: locked != null ? el.clientHeight / 2 : mid.y - paneRect.top,
        };
        if (next !== zoomRef.current) {
          setZoom(next);
        } else {
          // Pinned at a zoom bound the sizes stand still, so the moving
          // midpoint pans directly.
          applyPending();
        }
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      el.addEventListener("touchmove", onTouchMove, { passive: false });
      cleanup.current = () => {
        el.removeEventListener("wheel", onWheel);
        el.removeEventListener("touchmove", onTouchMove);
      };
    },
    [clamp, zoomTo, setZoom, applyPending]
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 2) return;
      const mid = midpoint(touchPair(e.touches));
      const captured = capture(mid.x, mid.y);
      pinch.current = {
        distance: touchDistance(e.touches),
        zoom: zoomRef.current,
        fracX: captured?.fracX ?? 0.5,
        fracY: captured?.fracY ?? 0.5,
      };
    },
    [capture]
  );

  const onTouchEnd = useCallback(() => {
    pinch.current = null;
  }, []);

  /**
   * Put the locked line back under the pane's centre — after the lock
   * closes, after the pane resizes, and whenever a scroll slips past
   * the hidden overflow. Does nothing while unlocked.
   */
  const applyAnchor = useCallback(() => {
    const pane = paneEl.current;
    const content = contentRef.current;
    const locked = anchorY.current;
    if (!pane || !content || locked == null) return;
    const top = lockedScrollTop(locked, content.offsetHeight, pane.clientHeight);
    if (Math.abs(pane.scrollTop - top) > 0.5) pane.scrollTop = top;
  }, [contentRef]);

  /** Close the lock on whatever line is under the pane's centre now. */
  const lockLine = useCallback(() => {
    const pane = paneEl.current;
    const content = contentRef.current;
    if (!pane || !content) return;
    anchorY.current = anchorFraction(
      pane.scrollTop,
      pane.clientHeight,
      content.offsetHeight
    );
  }, [contentRef]);

  /** Open the lock: the pane scrolls freely again. */
  const unlockLine = useCallback(() => {
    anchorY.current = null;
  }, []);

  /** The zoom buttons anchor to the middle of what is on screen. */
  const zoomAtCenter = useCallback(
    (factor: number) => {
      const pane = paneEl.current;
      if (!pane) return;
      const rect = pane.getBoundingClientRect();
      zoomTo(
        zoomRef.current * factor,
        rect.left + pane.clientWidth / 2,
        rect.top + pane.clientHeight / 2
      );
    },
    [zoomTo]
  );

  return {
    paneRef,
    paneEl,
    onTouchStart,
    onTouchEnd,
    zoomAtCenter,
    applyAnchor,
    lockLine,
    unlockLine,
  };
}
