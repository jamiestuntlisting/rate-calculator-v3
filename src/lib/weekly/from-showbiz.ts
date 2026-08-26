/**
 * Turn a parsed ShowBiz card into weekly-engine input.
 *
 * This is the join between the two halves of the test bench, and the one
 * place the column-to-rule mapping is written down in code. The derivation
 * and the evidence for each choice are in docs/weekly-rules.md §3.5.
 */

import type { ShowbizCard } from "@/lib/showbiz";
import {
  calculateWeekly,
  type WeeklyBreakdown,
  type WeeklyExtra,
  type WeeklyInput,
} from "./weekly-engine";

/** The day-code token (col 276) marking a worked holiday. */
const HOLIDAY_CODE = "HOL";

/** Half a cent — both figures are already rounded, so this is float slack. */
const CENT_TOLERANCE = 0.005;

/**
 * Col 194 holds one extra item, but only two of its values are paid: a
 * location allowance and a worked holiday. The others seen in the export
 * ("Covid Test", "Fitting") are recorded against the card and add nothing,
 * so they map to no line item rather than to a guess.
 */
export function readWeeklyExtra(extras: string): WeeklyExtra {
  const value = extras.trim().toLowerCase();
  if (value === "loc allowance") return "loc_allowance";
  if (value === "holiday") return "holiday";
  return null;
}

export function showbizCardToWeeklyInput(card: ShowbizCard): WeeklyInput {
  return {
    scaleWeeklyRate: card.baseScaleRate,
    contractWeeklyRate: card.contractRate,
    daysWorked: card.daysWorked,
    holidayDays: card.dayCodes.filter(
      (code) => code.toUpperCase() === HOLIDAY_CODE
    ).length,
    // The week's adjustment is the sum of the per-day column, not col 190 —
    // that one is a separate figure that lands after the subtotal.
    adjustments: card.adjustmentsPerDay.reduce((sum, n) => sum + n, 0),
    dailyOvertimeHours: card.dailyOvertimeHours,
    doubleTimeHours: card.doubleTimeHours,
    penaltyOvertimeHours: card.penaltyOvertimeHours,
    weeklyOvertimeHours: card.weeklyOvertimeHours,
    extra: readWeeklyExtra(card.extras),
    sixthDay: card.isSixthDay,
    seventhDay: card.isSeventhDay,
    postSubtotalAdjustments: card.postSubtotalAdjustments,
  };
}

export interface WeeklyCardCheck {
  card: ShowbizCard;
  input: WeeklyInput;
  /** Null when the card could not be calculated at all. */
  breakdown: WeeklyBreakdown | null;
  /** Why it could not be calculated — a malformed card, not a missing rule. */
  error: string | null;
  /** Ours minus payroll's: positive means we would overpay. */
  grossDelta: number;
  subtotalDelta: number;
  matches: boolean;
}

/**
 * Run one card through the engine and compare against what payroll paid.
 * A card that cannot be calculated is reported, never silently skipped —
 * a bench that quietly drops its hard cases is worse than no bench.
 */
export function checkWeeklyCard(card: ShowbizCard): WeeklyCardCheck {
  const input = showbizCardToWeeklyInput(card);

  try {
    const breakdown = calculateWeekly(input);
    const grossDelta = breakdown.grandTotal - card.gross;
    const subtotalDelta = breakdown.subtotal - card.subtotal;
    return {
      card,
      input,
      breakdown,
      error: null,
      grossDelta,
      subtotalDelta,
      matches: Math.abs(grossDelta) < CENT_TOLERANCE,
    };
  } catch (error) {
    return {
      card,
      input,
      breakdown: null,
      error: error instanceof Error ? error.message : "Could not calculate",
      grossDelta: 0,
      subtotalDelta: 0,
      matches: false,
    };
  }
}

export interface WeeklyCheckSummary {
  checks: WeeklyCardCheck[];
  total: number;
  matched: number;
  mismatched: number;
  errored: number;
  /** The largest absolute gross difference across the run. */
  worstDelta: number;
}

/** Check every weekly card in a parsed export. */
export function checkWeeklyCards(cards: ShowbizCard[]): WeeklyCheckSummary {
  const checks = cards.map(checkWeeklyCard);
  return {
    checks,
    total: checks.length,
    matched: checks.filter((c) => c.matches).length,
    mismatched: checks.filter((c) => !c.matches && !c.error).length,
    errored: checks.filter((c) => c.error).length,
    worstDelta: checks.reduce(
      (worst, c) => Math.max(worst, Math.abs(c.grossDelta)),
      0
    ),
  };
}
