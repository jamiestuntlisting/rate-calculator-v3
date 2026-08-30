/**
 * Pay for a day worked under more than one contract.
 *
 * A performer who works two productions on one day signs two contracts and
 * is owed for both. The first is worked out in full — overtime, penalties,
 * premiums, the lot — and each one after it is owed the day rate minimum on
 * top. Four contracts is one calculated day plus three day rates.
 *
 * The exception is a multiple-episode weekly, where the episodes are already
 * inside the weekly guarantee and do not stack.
 *
 * App-level on purpose: src/lib/rate-calculator/ is a verbatim mirror of the
 * shared package and works out one contract. This sits on top of what it
 * returns rather than changing it.
 */

import { dayRateFor } from "@/lib/agreements";

/** One Exhibit G is one contract, so the field only means something above this. */
export const MIN_CONTRACTS_FOR_FIELD = 2;

/** What a day can plausibly hold; guards a typo, not a rule. */
export const MAX_CONTRACTS = 12;

export interface AdditionalContracts {
  /** Contracts beyond the one calculated in full. */
  count: number;
  /** The day rate minimum each of those is owed at. */
  dayRate: number;
  /** What they come to together. */
  pay: number;
  /** True when a multiple-episode weekly absorbed them. */
  absorbedByWeekly: boolean;
}

/**
 * `contracts` counts every contract worked that day, including the one that
 * was calculated. The day rate is scale for the agreement — a stunt
 * adjustment is negotiated for the work done, not owed again per contract —
 * except on a flat deal, where the flat number *is* the day rate, so that is
 * what a second contract is owed. Taking scale there would pay a performer
 * on a $2,500 flat deal $1,283 for their second contract.
 */
export function additionalContractPay(
  contracts: number | null | undefined,
  schedule: string | null | undefined,
  multipleEpisodeWeekly: boolean,
  flatDayRate?: number | null,
  workDate?: string | null
): AdditionalContracts {
  const dayRate = dayRateFor(schedule, flatDayRate, workDate);
  const whole = Math.floor(contracts ?? 1);
  const count = Number.isFinite(whole) ? Math.max(0, whole - 1) : 0;

  if (multipleEpisodeWeekly) {
    return { count: 0, dayRate, pay: 0, absorbedByWeekly: count > 0 };
  }
  return { count, dayRate, pay: count * dayRate, absorbedByWeekly: false };
}
