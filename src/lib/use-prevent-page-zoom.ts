"use client";

import { useEffect } from "react";

/**
 * Keep a pinch from zooming the PAGE. The transcription screen has its
 * own zoom on the card, and a pinch that lands beside the card — on the
 * fields, on the letterbox — would otherwise go to Safari and shrink
 * the whole app to a postage stamp. Two-finger moves anywhere on the
 * document are swallowed here; the card pane's own listener has already
 * handled the ones on the card. Safari's proprietary gesture events are
 * cancelled too, which is what actually stops its page zoom on iOS.
 *
 * Only the pages that own a zoom of their own should use this — page
 * zoom is an accessibility feature everywhere else.
 */
export function usePreventPageZoom() {
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2 && e.cancelable) e.preventDefault();
    };
    const onGesture = (e: Event) => e.preventDefault();
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("gesturestart", onGesture);
    document.addEventListener("gesturechange", onGesture);
    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("gesturestart", onGesture);
      document.removeEventListener("gesturechange", onGesture);
    };
  }, []);
}
