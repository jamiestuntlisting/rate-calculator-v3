import { calculateRate } from "@/lib/rate-engine";
import {
  isFlatAgreement,
  threeDayContractRate,
  weeklyEquivalentDayRate,
} from "@/lib/agreements";
import { additionalContractPay } from "@/lib/multi-contract";
import type { CalculationBreakdown, ExhibitGInput } from "@/types";

/** The fields of a work record the recalculation actually reads. */
export interface RecalculableDay {
  showName: string | null;
  workDate: string;
  callTime: string | null;
  dismissOnSet: string | null;
  dismissMakeupWardrobe: string | null;
  ndMealIn: string | null;
  ndMealOut: string | null;
  firstMealStart: string | null;
  firstMealFinish: string | null;
  secondMealStart: string | null;
  secondMealFinish: string | null;
  stuntAdjustment: number;
  flatDayRate: number | null;
  threeDayLength: string | null;
  contractLength?: string | null;
  contracts?: number | null;
  multipleEpisodeWeekly?: boolean | number | null;
  forcedCall: boolean | number;
  isSixthDay: boolean | number;
  isSeventhDay: boolean | number;
  isHoliday: boolean | number;
  workStatus: string | null;
  characterName: string | null;
  notes: string | null;
}

export interface DayRecalc {
  calculation: CalculationBreakdown;
  expectedAmount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Re-derive a day's stored calculation from the record itself — the same
 * working the forms produce, so a record changed outside a form stays
 * honest. The one caller that matters is the weekly machinery: attaching
 * a day to a weekly (or 3-day) stamps its contract length in SQL, and
 * without this the day would keep showing the daily-scale breakdown it
 * was first saved with. The contract length picks the day-rate override
 * exactly as the forms do: a weekly day is approximated at the weekly
 * scale over five days, a 3-day day at the contract over three.
 *
 * Returns null when there is nothing honest to compute — missing times,
 * a flat agreement with no rate typed, a coordinator day (those log a
 * flat expected amount, not a working) — and the stored values are then
 * left exactly as they are. Contracts past the first are day-rate
 * minimums on top of the calculation; dropping them silently loses a
 * day's pay per contract, so they are added back here the same way the
 * forms add them.
 */
export function recalculateDay(record: RecalculableDay): DayRecalc | null {
  if (!record.callTime || !record.dismissOnSet) return null;
  if (!record.workStatus) return null;
  if (record.workStatus === "stunt_coordinator") return null;
  if (isFlatAgreement(record.workStatus) && !((record.flatDayRate ?? 0) > 0)) {
    return null;
  }

  const workDate = (record.workDate || "").slice(0, 10);
  const dayRateOverride =
    record.contractLength === "weekly"
      ? weeklyEquivalentDayRate(record.workStatus, workDate)
      : record.contractLength === "three_day"
        ? round2(
            threeDayContractRate(
              record.workStatus,
              record.threeDayLength === "long" ? "long" : "short",
              workDate
            ) / 3
          )
        : null;

  const input: ExhibitGInput = {
    showName: record.showName ?? "",
    workDate,
    callTime: record.callTime,
    dismissOnSet: record.dismissOnSet,
    dismissMakeupWardrobe: record.dismissMakeupWardrobe ?? null,
    ndMealIn: record.ndMealIn ?? null,
    ndMealOut: record.ndMealOut ?? null,
    firstMealStart: record.firstMealStart ?? null,
    firstMealFinish: record.firstMealFinish ?? null,
    secondMealStart: record.secondMealStart ?? null,
    secondMealFinish: record.secondMealFinish ?? null,
    stuntAdjustment: record.stuntAdjustment || 0,
    flatDayRate: record.flatDayRate ?? null,
    dayRateOverride,
    forcedCall: Boolean(record.forcedCall),
    isSixthDay: Boolean(record.isSixthDay),
    isSeventhDay: Boolean(record.isSeventhDay),
    isHoliday: Boolean(record.isHoliday),
    workStatus: record.workStatus,
    characterName: record.characterName ?? "",
    notes: record.notes ?? "",
  };

  try {
    const calculation = calculateRate(input);
    const extras = additionalContractPay(
      record.contracts,
      record.workStatus,
      Boolean(record.multipleEpisodeWeekly),
      record.flatDayRate,
      workDate
    );
    return {
      calculation,
      expectedAmount: round2(calculation.grandTotal + extras.pay),
    };
  } catch {
    // An input the engine refuses (e.g. an ND meal outside its window)
    // keeps whatever was stored.
    return null;
  }
}
