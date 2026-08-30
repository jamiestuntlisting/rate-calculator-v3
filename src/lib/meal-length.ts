import { calculateDuration } from "@/lib/time-utils";

/**
 * How long a deductible meal is allowed to run: a half hour at minimum,
 * an hour at most. The forms warn on anything outside that so a typo'd
 * or misread card shows itself while the times are still on screen.
 * The ND meal is not held to this — it is work time with its own
 * two-hour window rule (`nd-meal.ts`).
 */
export const MEAL_MIN_MINUTES = 30;
export const MEAL_MAX_MINUTES = 60;

/**
 * Past this, the "overnight" reading of the pair is almost certainly not
 * a meal but the In and Out entered swapped — a real night-shoot meal
 * crossing midnight still comes out at its true half-hour length.
 */
const CROSSED_THRESHOLD_MINUTES = 12 * 60;

export interface MealLengthCheck {
  ok: boolean;
  minutes: number;
  problem?: "short" | "long" | "crossed";
}

/** Check one meal's length. Null when either time is missing. */
export function checkMealLength(
  start: string | null | undefined,
  finish: string | null | undefined
): MealLengthCheck | null {
  if (!start || !finish) return null;
  const minutes = calculateDuration(start, finish);
  if (minutes >= CROSSED_THRESHOLD_MINUTES) {
    return { ok: false, minutes, problem: "crossed" };
  }
  if (minutes < MEAL_MIN_MINUTES) return { ok: false, minutes, problem: "short" };
  if (minutes > MEAL_MAX_MINUTES) return { ok: false, minutes, problem: "long" };
  return { ok: true, minutes };
}

/** The warning line the forms show, or null when the length is fine. */
export function mealLengthWarning(
  start: string | null | undefined,
  finish: string | null | undefined
): string | null {
  const check = checkMealLength(start, finish);
  if (!check || check.ok) return null;
  if (check.problem === "crossed") {
    return "The Out time lands before the In — check whether the two are swapped.";
  }
  if (check.problem === "short") {
    return `Lunch is at least half an hour — this one is only ${check.minutes} minutes.`;
  }
  const h = Math.floor(check.minutes / 60);
  const m = check.minutes % 60;
  const length = m === 0 ? `${h}h` : `${h}h ${m}m`;
  return `Lunch is at most an hour — this one runs ${length}.`;
}

/**
 * The meals happen in order: the 2nd starts after the 1st ends. The
 * forms offer the 2nd six hours on (the meal-interval rule) and drag it
 * along if the 1st moves past it, so this warning is for an order
 * someone actually typed. Judged by the same twelve-hour overnight
 * reading as the length check.
 */
export function secondMealOrderWarning(
  firstMealFinish: string | null | undefined,
  secondMealStart: string | null | undefined
): string | null {
  if (!firstMealFinish || !secondMealStart) return null;
  if (calculateDuration(firstMealFinish, secondMealStart) < 12 * 60) {
    return null;
  }
  return "The 2nd meal lands before the 1st — check the order.";
}

const addWrapped = (time: string, minutes: number): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const total = (Number(m[1]) * 60 + Number(m[2]) + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60
  ).padStart(2, "0")}`;
};

/**
 * A lunch is not allowed outside its band: an Out that would make the
 * meal shorter than half an hour snaps to In + 30, longer than an hour
 * snaps to In + 60. A crossed pair (the overnight reading past twelve
 * hours) is left for the follow logic and the swapped warning — this
 * only disciplines meals that are meals.
 */
export function clampMealFinish(
  start: string | null | undefined,
  finish: string | null | undefined
): string | null {
  if (!start || !finish) return finish ?? null;
  const minutes = calculateDuration(start, finish);
  if (minutes >= 12 * 60) return finish;
  if (minutes < MEAL_MIN_MINUTES) return addWrapped(start, MEAL_MIN_MINUTES);
  if (minutes > MEAL_MAX_MINUTES) return addWrapped(start, MEAL_MAX_MINUTES);
  return finish;
}
