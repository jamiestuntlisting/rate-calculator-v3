import { calculateDuration } from "@/lib/time-utils";

/**
 * The companion time a new anchor drags along.
 *
 * Setting a meal's In offers its Out half an hour on; setting the
 * dismissal offers the wrap fifteen minutes on. The companion is kept
 * when it already sits after the new anchor — a deliberately entered
 * finish survives a small correction to the start — but when it is
 * empty, or now lands before the anchor (the stale leftover of an
 * earlier offer), it moves to anchor + offset instead of sitting there
 * drawing a crossed-times warning the anchor just caused.
 *
 * "Before" is judged the way the crossed-meal check judges it: the
 * overnight reading has to exceed twelve hours. A real after-midnight
 * companion on a night shoot computes as its true short length and is
 * left alone.
 */
export function followedTime(
  anchor: string | null | undefined,
  existing: string | null | undefined,
  offsetMinutes: number
): string | null {
  if (!anchor) return existing ?? null;
  const crossed =
    !existing || calculateDuration(anchor, existing) >= 12 * 60;
  if (!crossed) return existing ?? null;
  const [h, m] = anchor.split(":").map(Number);
  const total = (h * 60 + m + offsetMinutes) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * The mirror of `followedTime` for a companion that comes BEFORE its
 * anchor — the on-set dismissal before the wrap. Kept when it already
 * sits sanely before the anchor; offered at anchor − offset when empty
 * or on the wrong side of it (by the same twelve-hour reading).
 */
export function precedingTime(
  anchor: string | null | undefined,
  existing: string | null | undefined,
  offsetMinutes: number
): string | null {
  if (!anchor) return existing ?? null;
  const sane =
    existing && calculateDuration(existing, anchor) < 12 * 60;
  if (sane) return existing ?? null;
  const [h, m] = anchor.split(":").map(Number);
  const total =
    (h * 60 + m - offsetMinutes + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * The dismissal/wrap rule, stated as a function so the form and the
 * time bench run the same code: an offer only ever fills an EMPTY
 * companion. A time someone already set never moves, however the
 * anchor changes — "if those have already been set, ignore the rules
 * of setting things."
 */
export function offerAfterIfEmpty(
  anchor: string,
  existing: string | null | undefined,
  minutes: number
): string | null {
  return existing ? existing : followedTime(anchor, null, minutes);
}

/** The same rule pointing backwards: a wrap offers the dismissal. */
export function offerBeforeIfEmpty(
  anchor: string,
  existing: string | null | undefined,
  minutes: number
): string | null {
  return existing ? existing : precedingTime(anchor, null, minutes);
}
