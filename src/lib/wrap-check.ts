import { calculateDuration, parseTimeToMinutes } from "@/lib/time-utils";

/**
 * Wrap comes at or after dismissal — dismissed on set, then out of
 * wardrobe and makeup, typically about fifteen minutes later but
 * legitimately the very same minute. Setting a
 * dismissal offers that as the wrap the way a meal's start offers its
 * finish, so the picker opens at a sensible time instead of whatever
 * the clock says now; and a wrapped time that lands before the
 * dismissal draws a warning, because the engine reads it as an
 * overnight wrap and pays a day that never happened.
 */
export const WRAP_MINUTES = 15;

/**
 * Past this, the overnight reading of dismiss → wrapped is almost
 * certainly a wrap entered before the dismissal, not a shoot that
 * wrapped the following afternoon. A genuine after-midnight wrap on a
 * night shoot stays under it.
 */
const CROSSED_THRESHOLD_MINUTES = 12 * 60;

/** The warning line, or null when the order is believable. */
export function wrapOrderWarning(
  dismissOnSet: string | null | undefined,
  wrapped: string | null | undefined
): string | null {
  if (!dismissOnSet || !wrapped) return null;
  // The same minute is normal — dismissed and out of wardrobe in one
  // go, which the card often writes as a dash. Only a wrap strictly
  // before the dismissal reads wrong; calculateDuration would call the
  // equal pair a 24-hour overnight stretch.
  if (parseTimeToMinutes(wrapped) === parseTimeToMinutes(dismissOnSet)) {
    return null;
  }
  if (calculateDuration(dismissOnSet, wrapped) < CROSSED_THRESHOLD_MINUTES) {
    return null;
  }
  return "Wrapped lands before the on-set dismissal — wrap is usually about 15 minutes after it.";
}
