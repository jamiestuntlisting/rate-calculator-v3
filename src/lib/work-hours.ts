/**
 * How long a day ran, worked out from the times and nothing else.
 *
 * Nothing here knows about SAG rates, and that is the point. A commercial,
 * a music video or a non-union gig is not under the Basic Agreement, so
 * running one through the rate engine would state a figure the performer is
 * not owed. But the hours are still the hours: what the day cost them, what
 * the meals took out of it, and — where a flat fee was agreed — what that
 * fee actually came to per hour.
 *
 * That last number is the one worth having. Non-union work is quoted as a
 * day rate, and a day rate says nothing until you know whether the day ran
 * eight hours or sixteen.
 */

import { calculateDuration, calculateMealMinutes } from "@/lib/time-utils";

export interface WorkTimes {
  callTime?: string | null;
  firstMealStart?: string | null;
  firstMealFinish?: string | null;
  secondMealStart?: string | null;
  secondMealFinish?: string | null;
  dismissOnSet?: string | null;
  dismissMakeupWardrobe?: string | null;
}

export interface WorkHours {
  /** Call to wrap, meals included. */
  elapsedHours: number;
  /** Meal time, which is unpaid and comes out of the day. */
  mealHours: number;
  /** What was actually worked. */
  netHours: number;
  /** The time the day ended — the wrap if there is one, else set dismissal. */
  endedAt: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const isTime = (v: string | null | undefined): v is string =>
  typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v);

/**
 * The day's hours, or null if it cannot be worked out. A day needs a call
 * and an end; anything less is a day still in progress or half entered, and
 * inventing the missing half would be worse than saying nothing.
 */
export function workHoursFor(times: WorkTimes): WorkHours | null {
  const call = times.callTime;
  if (!isTime(call)) return null;

  // The wrap is the later of the two ends, and either one alone will do.
  const ends = [times.dismissMakeupWardrobe, times.dismissOnSet].filter(isTime);
  if (ends.length === 0) return null;
  const endedAt =
    ends.length === 1
      ? ends[0]
      : calculateDuration(call, ends[0]) >= calculateDuration(call, ends[1])
        ? ends[0]
        : ends[1];

  const elapsed = calculateDuration(call, endedAt);
  const meals = calculateMealMinutes([
    { start: times.firstMealStart ?? null, finish: times.firstMealFinish ?? null },
    { start: times.secondMealStart ?? null, finish: times.secondMealFinish ?? null },
  ]);

  // A meal longer than the day means one of the times is wrong. Report the
  // day as worked rather than a negative number of hours.
  const net = Math.max(0, elapsed - meals);

  return {
    elapsedHours: round1(elapsed / 60),
    mealHours: round1(meals / 60),
    netHours: round1(net / 60),
    endedAt,
  };
}

/**
 * What a flat fee came to per hour worked. Null when either half is
 * missing, or when the day worked out to no hours at all — dividing by
 * that would report an infinite rate for a day someone did work.
 */
export function effectiveHourlyRate(
  amount: number | null | undefined,
  netHours: number | null | undefined
): number | null {
  if (!amount || amount <= 0) return null;
  if (!netHours || netHours <= 0) return null;
  return Math.round((amount / netHours) * 100) / 100;
}
