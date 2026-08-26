/**
 * Weekly scale rates offered by the calculator.
 *
 * Only two are useful: the contract in force, and the one before it. A
 * production that started under the previous agreement stays on it for the
 * run, so a week being worked out today can still be owed at the old rate —
 * but nothing older than that comes up, because a weekly contract here is
 * built from work days already in the Tracker rather than typed in for an
 * arbitrary week years ago.
 */

import { RATES } from "@/lib/rate-constants";

/** The weekly scale in the agreement now in force (07/01/2026). */
export const CURRENT_WEEKLY_SCALE = RATES.theatrical_basic.weekly;

/**
 * The 2025–26 schedule, which the current one raised by 3%.
 *
 * Worked back from the current figure ($4,785 / 1.03 = $4,645.63) and
 * corroborated by the ShowBiz sample, where $4,646 appears as a real
 * col-214 scale rate on 2026 cards. Both agree to the dollar, but this is
 * derived rather than read off an official schedule — worth confirming
 * before anyone relies on it for a payment claim.
 */
export const PREVIOUS_WEEKLY_SCALE = 4646;

export interface WeeklyScaleOption {
  id: "current" | "previous";
  label: string;
  rate: number;
  note: string;
}

export const WEEKLY_SCALE_OPTIONS: WeeklyScaleOption[] = [
  {
    id: "current",
    label: "Current",
    rate: CURRENT_WEEKLY_SCALE,
    note: "The agreement in force since 1 July 2026.",
  },
  {
    id: "previous",
    label: "Previous contract",
    rate: PREVIOUS_WEEKLY_SCALE,
    note: "For a production that started under the last agreement and stayed on it.",
  },
];
