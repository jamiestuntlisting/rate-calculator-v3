/**
 * Turn a set of logged work days into a weekly contract.
 *
 * A weekly contract is not typed in from scratch — it is what happens when
 * five or more days on the same show get combined, so the days already in
 * the Tracker are the input and this is where they are added up.
 *
 * The mapping mirrors from-showbiz.ts: both end at the same WeeklyInput, so
 * a week built from a performer's own days and a week read off a payroll
 * card go through identical arithmetic.
 */

import type { CalculationBreakdown, TimeSegment, WorkRecord } from "@/types";
import { DAYS_PER_WEEK, type WeeklyInput } from "./weekly-engine";

/** Below this it is a run of day performer contracts, not a weekly. */
export const MIN_DAYS_FOR_WEEKLY = DAYS_PER_WEEK;

type Tier = "straight" | "timeAndAHalf" | "double";

/**
 * Which overtime tier a segment belongs to.
 *
 * Read from the label, never from `segment.multiplier`: on a 6th or 7th day
 * the daily engine raises every segment to the day multiplier, so straight
 * hours come back reading 1.5 or 2. Classifying on that number would count
 * an ordinary eight-hour sixth day as eight hours of overtime.
 */
function tierOf(segment: TimeSegment): Tier {
  if (segment.label.startsWith("Double Time")) return "double";
  if (segment.label.startsWith("Time-and-a-Half")) return "timeAndAHalf";
  return "straight";
}

function hoursAt(calculation: CalculationBreakdown, tier: Tier): number {
  return calculation.segments
    .filter((segment) => tierOf(segment) === tier)
    .reduce((sum, segment) => sum + segment.hours, 0);
}

/**
 * One day's contribution to its week, read the same way the derivation
 * reads it — so a per-day line shown in the week card provably sums to
 * the week's aggregate lines. Null when the day has no calculation yet.
 */
export function dayContribution(record: WorkRecord): {
  hours: number;
  ot15: number;
  ot2: number;
  penalties: number;
  adjustment: number;
} | null {
  const calculation = record.calculation;
  if (!calculation) return null;
  return {
    hours: calculation.netWorkHours,
    ot15: hoursAt(calculation, "timeAndAHalf"),
    ot2: hoursAt(calculation, "double"),
    penalties: calculation.penalties?.totalPenalties ?? 0,
    adjustment: record.stuntAdjustment || 0,
  };
}

/** What was read off the days, so the calculator can show its working. */
export interface WeeklyDerivation {
  days: number;
  /** Hours actually worked across the week, meals already taken out. */
  workHours: number;
  dailyOvertimeHours: number;
  doubleTimeHours: number;
  adjustments: number;
  mealPenalties: number;
  holidayDays: number;
  sixthDay: boolean;
  seventhDay: boolean;
  /**
   * Days saved without a calculation — usually an Exhibit G that was
   * uploaded but never transcribed. Their overtime cannot be counted, so
   * the total is low and the caller should say so rather than imply the
   * week is complete.
   */
  daysWithoutCalculation: number;
}

export interface WeeklyFromRecords {
  input: WeeklyInput;
  derivation: WeeklyDerivation;
}

export function workRecordsToWeeklyInput(
  records: WorkRecord[],
  rates: { scaleWeeklyRate: number; contractWeeklyRate: number }
): WeeklyFromRecords {
  const derivation: WeeklyDerivation = {
    days: records.length,
    dailyOvertimeHours: 0,
    workHours: 0,
    doubleTimeHours: 0,
    adjustments: 0,
    mealPenalties: 0,
    holidayDays: 0,
    sixthDay: false,
    seventhDay: false,
    daysWithoutCalculation: 0,
  };

  for (const record of records) {
    derivation.adjustments += record.stuntAdjustment || 0;
    if (record.isHoliday) derivation.holidayDays++;
    if (record.isSixthDay) derivation.sixthDay = true;
    if (record.isSeventhDay) derivation.seventhDay = true;

    const calculation = record.calculation;
    if (!calculation) {
      derivation.daysWithoutCalculation++;
      continue;
    }

    derivation.workHours += calculation.netWorkHours;
    derivation.dailyOvertimeHours += hoursAt(calculation, "timeAndAHalf");
    derivation.doubleTimeHours += hoursAt(calculation, "double");
    // Meal penalties are dollars, and they land after the subtotal — the
    // same slot col 190 fills on a ShowBiz card.
    derivation.mealPenalties += calculation.penalties?.totalPenalties ?? 0;
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  derivation.dailyOvertimeHours = round1(derivation.dailyOvertimeHours);
  derivation.workHours = round1(derivation.workHours);
  derivation.doubleTimeHours = round1(derivation.doubleTimeHours);
  derivation.adjustments = round2(derivation.adjustments);
  derivation.mealPenalties = round2(derivation.mealPenalties);

  return {
    derivation,
    input: {
      scaleWeeklyRate: rates.scaleWeeklyRate,
      contractWeeklyRate: rates.contractWeeklyRate,
      daysWorked: derivation.days,
      holidayDays: derivation.holidayDays,
      adjustments: derivation.adjustments,
      dailyOvertimeHours: derivation.dailyOvertimeHours,
      doubleTimeHours: derivation.doubleTimeHours,
      // The daily engine books penalties as money, not hours, so there is
      // nothing to put in the penalty-hours bucket.
      penaltyOvertimeHours: 0,
      // Weekly overtime is a property of the contract's guarantee, not of
      // any one day, so it stays for the performer to enter.
      weeklyOvertimeHours: 0,
      extra: null,
      sixthDay: derivation.sixthDay,
      seventhDay: derivation.seventhDay,
      postSubtotalAdjustments: derivation.mealPenalties,
    },
  };
}

/** Days that can be combined: same show, ordered by date. */
export function groupRecordsForWeekly(
  records: WorkRecord[]
): Array<{ showName: string; records: WorkRecord[] }> {
  const byShow = new Map<string, WorkRecord[]>();
  for (const record of records) {
    const key = record.showName.trim();
    if (!key) continue;
    const list = byShow.get(key);
    if (list) list.push(record);
    else byShow.set(key, [record]);
  }

  return [...byShow.entries()]
    .map(([showName, list]) => ({
      showName,
      records: [...list].sort((a, b) => a.workDate.localeCompare(b.workDate)),
    }))
    .filter((group) => group.records.length >= MIN_DAYS_FOR_WEEKLY)
    .sort((a, b) => b.records.length - a.records.length);
}
