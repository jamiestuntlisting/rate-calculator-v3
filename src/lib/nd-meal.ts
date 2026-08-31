/**
 * Whether a non-deductible meal sits where the agreement allows.
 *
 * An ND breakfast has to fall inside the two hours after call — at or after
 * the call itself, and finished by the end of that window. Anything else is
 * a deductible meal, and pays differently.
 *
 * The vendored engine already refuses an ND meal that *ends* too late, but
 * it never checks that the meal starts at or after call, and it throws
 * rather than explaining. Both belong upstream; until then this is what the
 * form checks so the reason can be shown instead of the total quietly
 * disappearing. See src/lib/rate-calculator/README.md.
 */

import { parseTimeToMinutes } from "@/lib/time-utils";

/** How long after call an ND meal has to be done. */
export const ND_MEAL_WINDOW_HOURS = 2;

/**
 * An ND meal is fifteen minutes — that is the deal, not a choice — so
 * the forms derive the Out from the In instead of asking for it.
 */
export const ND_MEAL_MINUTES = 15;

const DAY = 24 * 60;

export type NdMealProblem = "outside_window" | "ends_before_it_starts";

export interface NdMealCheck {
  ok: boolean;
  problem: NdMealProblem | null;
  /** "HH:MM" — the latest an ND meal may run to, for the message. */
  windowEnd: string;
}

const hhmm = (minutes: number) =>
  `${String(Math.floor((minutes % DAY) / 60)).padStart(2, "0")}:${String(
    minutes % 60
  ).padStart(2, "0")}`;

/**
 * Times are measured forward from the call rather than compared directly,
 * so a call late at night and an ND meal after midnight still reads as the
 * hour later that it is.
 */
export function checkNdMeal(
  callTime: string,
  ndMealIn: string | null,
  ndMealOut: string | null
): NdMealCheck {
  const call = callTime ? parseTimeToMinutes(callTime) : NaN;
  const windowEnd = Number.isNaN(call)
    ? ""
    : hhmm(call + ND_MEAL_WINDOW_HOURS * 60);

  // Nothing to judge until there is a call and both ends of the meal.
  if (Number.isNaN(call) || !ndMealIn || !ndMealOut) {
    return { ok: true, problem: null, windowEnd };
  }

  const since = (time: string) =>
    (parseTimeToMinutes(time) - call + DAY) % DAY;
  const start = since(ndMealIn);
  const end = since(ndMealOut);
  const window = ND_MEAL_WINDOW_HOURS * 60;

  if (end < start) {
    return { ok: false, problem: "ends_before_it_starts", windowEnd };
  }
  if (start > window || end > window) {
    return { ok: false, problem: "outside_window", windowEnd };
  }
  return { ok: true, problem: null, windowEnd };
}
