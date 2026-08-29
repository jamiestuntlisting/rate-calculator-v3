/**
 * What a 3-day (TV) contract is owed — the part we can state honestly.
 *
 * The contract is a negotiated number that buys three days. A fourth or
 * fifth day on the same contract is normal, paid as a prorated day at a
 * third of the contract rate. Meal penalties are statutory dollars and
 * stunt adjustments are entered money, so both land on top from the days
 * themselves.
 *
 * What this deliberately does NOT price: the 3-day schedule's own
 * overtime. Its published rates and overtime rules are not in the app
 * yet (they are a blocked task, waiting on the real figures), and
 * pricing overtime by analogy to the daily or weekly rules would state
 * money nobody is owed. Instead the hours past straight time are
 * counted and reported unpriced, so the shortfall is visible instead of
 * invented.
 */

export const THREE_DAY_GUARANTEED_DAYS = 3;

export interface ThreeDayLine {
  label: string;
  amount: number;
}

export interface ThreeDayInput {
  /** The negotiated 3-day contract rate — the deal that was signed. */
  contractRate: number;
  /** Days worked on the contract; three or more is normal. */
  dayCount: number;
  /** Statutory meal penalties summed off the days' own calculations. */
  mealPenalties: number;
  /** Stunt adjustments the performer entered, summed off the days. */
  stuntAdjustments: number;
  /** Hours past straight time across the days — counted, not priced. */
  overtimeHours: number;
}

export interface ThreeDayBreakdown {
  lines: ThreeDayLine[];
  total: number;
  /** Hours the total knowingly leaves out. */
  unpricedOvertimeHours: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateThreeDay(input: ThreeDayInput): ThreeDayBreakdown {
  const lines: ThreeDayLine[] = [
    {
      label: `3-day contract (${Math.min(input.dayCount, THREE_DAY_GUARANTEED_DAYS)} of 3 days)`,
      amount: input.contractRate,
    },
  ];
  const extraDays = Math.max(0, input.dayCount - THREE_DAY_GUARANTEED_DAYS);
  if (extraDays > 0) {
    lines.push({
      label: `${extraDays} additional ${extraDays === 1 ? "day" : "days"} @ 1/3 of the contract`,
      amount: round2((input.contractRate / 3) * extraDays),
    });
  }
  if (input.stuntAdjustments > 0) {
    lines.push({ label: "Stunt adjustments", amount: round2(input.stuntAdjustments) });
  }
  if (input.mealPenalties > 0) {
    lines.push({ label: "Meal penalties", amount: round2(input.mealPenalties) });
  }
  // Full precision in, one rounding out.
  const total = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  return {
    lines,
    total,
    unpricedOvertimeHours: Math.round(input.overtimeHours * 10) / 10,
  };
}
