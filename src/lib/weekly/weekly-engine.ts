/**
 * SAG-AFTRA Weekly Player pay calculation.
 *
 * Reverse-engineered from 133 real ShowBiz SAG cards; the derivation, the
 * evidence for each rule and worked examples are in docs/weekly-rules.md.
 * The model reproduces the payroll gross to the cent on 132 of those 133
 * cards — see OVERTIME_ABSORPTION_NOTE for the one rule that is bounded by
 * the data rather than pinned exactly.
 *
 * Not yet part of the shared @stuntlisting/rate-calculator package; it lives
 * here so the vendored copy stays a clean mirror. Move it upstream once the
 * absorption threshold is confirmed.
 */

/** Weekly overtime is always a 44th of the weekly rate — even on a 48-hour
 * Distant week, which instead gets four hours of location allowance. */
export const OVERTIME_DIVISOR = 44;

/** A day of the weekly guarantee. */
export const DAYS_PER_WEEK = 5;

/** A worked holiday adds a day at scale to the base. */
export const HOLIDAY_FACTOR = 0.2;

/** 6th day is time-and-a-half of a day; 7th day is double. */
const SIXTH_DAY_SCALE = 0.3;
const SIXTH_DAY_ADJUSTMENT = 0.1;
const SEVENTH_DAY_SCALE = 0.4;
const SEVENTH_DAY_ADJUSTMENT = 0.2;

/** The 48-hour Distant guarantee less the 44 hours the weekly rate buys. */
const LOCATION_ALLOWANCE_HOURS = 4;

export const OVERTIME_ABSORPTION_NOTE =
  "Over-scale pay is credited against 1.5x weekly overtime but never against " +
  "double time. The cards bracket the threshold to an adjusted weekly rate " +
  "between $5,646 and $7,146; this uses contract + 9 hours, which reproduces " +
  "every card in the sample.";

export type WeeklyExtra = "loc_allowance" | "holiday" | null;

export interface WeeklyInput {
  /** Applicable weekly scale rate (ShowBiz col 214). */
  scaleWeeklyRate: number;
  /** Negotiated contract weekly rate (col 188). */
  contractWeeklyRate: number;
  /** Days on the card, including hold, rehearsal and travel days (col 253). */
  daysWorked: number;
  /** Worked holidays among those days (HOL in col 276). */
  holidayDays?: number;
  /** Total stunt adjustments for the week (sum of col 202). */
  adjustments?: number;
  /** Hours at 1.5x from daily overtime (col 205). */
  dailyOvertimeHours?: number;
  /** Hours at 2x (col 206). */
  doubleTimeHours?: number;
  /** Hours at 1.5x from penalties (col 207). */
  penaltyOvertimeHours?: number;
  /** Hours at 1.5x from exceeding the weekly guarantee (col 183). */
  weeklyOvertimeHours?: number;
  /** Location allowance or a worked holiday (col 194). */
  extra?: WeeklyExtra;
  /** Sixth consecutive day worked (col 191). */
  sixthDay?: boolean;
  /** Seventh consecutive day worked (col 192). */
  seventhDay?: boolean;
  /** Amounts added after the subtotal: allowances, meal penalties (col 190). */
  postSubtotalAdjustments?: number;
  /**
   * The least the week's wages can total — a signed weekly contract pays
   * at least the full week, however few of its days were worked, so the
   * contract forecast on /weekly passes the contract weekly rate here.
   * When the lines come out short a "Weekly guarantee" line tops them up;
   * when they come out over, the larger number stands. Penalties are not
   * wages and land after the floor. The ShowBiz bench never passes this:
   * a payroll card mid-run legitimately prorates a partial week (the
   * engagement's other cards carry the rest), and the bench's job is to
   * reproduce the card, not the contract. A continuation week — the same
   * engagement running on from the week before — deliberately passes
   * nothing here either: its days are additional days on the original
   * weekly, a fifth each, which is exactly the bare proration.
   */
  minimumWeekly?: number;
}

export interface WeeklyLineItem {
  label: string;
  units: number;
  rate: number;
  multiplier: number;
  /** Rounded for display; the total is summed before rounding. */
  amount: number;
}

export interface WeeklyBreakdown {
  /** Overtime hourly rate. */
  hourlyRate: number;
  /** A day of the weekly guarantee. */
  dailyRate: number;
  /** What the base is multiplied by: days worked, plus worked holidays. */
  prorationFactor: number;
  /** True when over-scale pay absorbed the 1.5x weekly overtime. */
  overtimeAbsorbed: boolean;
  /** Weekly overtime that would have been paid but was absorbed. */
  absorbedOvertime: number;
  lineItems: WeeklyLineItem[];
  /** Sum of the line items (col 211). */
  subtotal: number;
  /** Allowances and penalties added after the subtotal (col 190). */
  postSubtotalAdjustments: number;
  /** What the performer is owed for the week (col 209). */
  grandTotal: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateWeekly(input: WeeklyInput): WeeklyBreakdown {
  const scale = input.scaleWeeklyRate;
  const contract = input.contractWeeklyRate;
  const adjustments = input.adjustments ?? 0;
  const holidayDays = input.holidayDays ?? 0;
  const postSubtotalAdjustments = input.postSubtotalAdjustments ?? 0;

  if (scale <= 0) throw new Error("scaleWeeklyRate must be greater than zero");
  if (contract <= 0) {
    throw new Error("contractWeeklyRate must be greater than zero");
  }

  const dailyRate = scale / DAYS_PER_WEEK;

  // Overtime is paid on the adjusted rate, capped at the contract rate.
  const adjustedWeekly = scale + adjustments;
  const hourlyRate = Math.min(contract, adjustedWeekly) / OVERTIME_DIVISOR;

  // Days beyond the fifth are paid as 6th/7th day premiums, not more base.
  const prorationFactor =
    Math.min(input.daysWorked, DAYS_PER_WEEK) / DAYS_PER_WEEK +
    HOLIDAY_FACTOR * holidayDays;

  const weeklyOvertimeHours = input.weeklyOvertimeHours ?? 0;
  const overtimeAbsorbed =
    adjustedWeekly >= contract + 9 * hourlyRate && weeklyOvertimeHours > 0;

  const items: Array<Omit<WeeklyLineItem, "amount"> & { raw: number }> = [];
  const add = (
    label: string,
    units: number,
    rate: number,
    multiplier: number
  ) => {
    if (units === 0 || rate === 0) return;
    items.push({ label, units, rate, multiplier, raw: units * rate * multiplier });
  };

  add("Weekly base", 1, scale, prorationFactor);
  add("Daily overtime", input.dailyOvertimeHours ?? 0, hourlyRate, 1.5);
  add("Double time", input.doubleTimeHours ?? 0, hourlyRate, 2);
  add("Penalty overtime", input.penaltyOvertimeHours ?? 0, hourlyRate, 1.5);
  if (!overtimeAbsorbed) {
    add("Weekly overtime", weeklyOvertimeHours, hourlyRate, 1.5);
  }
  if (input.extra === "loc_allowance") {
    add("Location allowance", LOCATION_ALLOWANCE_HOURS, hourlyRate, 1);
  } else if (input.extra === "holiday") {
    add("Holiday", 1, dailyRate, 1);
  }
  add("Stunt adjustments", 1, adjustments, 1);
  if (input.sixthDay) {
    add(
      "6th day",
      1,
      SIXTH_DAY_SCALE * scale + SIXTH_DAY_ADJUSTMENT * adjustments,
      1
    );
  }
  if (input.seventhDay) {
    add(
      "7th day",
      1,
      SEVENTH_DAY_SCALE * scale + SEVENTH_DAY_ADJUSTMENT * adjustments,
      1
    );
  }

  // Every term is summed at full precision and rounded once: the hourly rate
  // repeats on most cards, and rounding each line first is a cent out on
  // roughly one card in twenty.
  let subtotal = round2(items.reduce((sum, item) => sum + item.raw, 0));
  const lineItems: WeeklyLineItem[] = items.map(({ raw, ...item }) => ({
    ...item,
    amount: round2(raw),
  }));

  // The contract's floor: wages never total less than the week. The line
  // states the top-up so the card still sums, and penalties land after.
  if (input.minimumWeekly && subtotal < input.minimumWeekly) {
    const shortfall = round2(input.minimumWeekly - subtotal);
    lineItems.push({
      label: "Weekly guarantee",
      units: 1,
      rate: shortfall,
      multiplier: 1,
      amount: shortfall,
    });
    subtotal = round2(input.minimumWeekly);
  }

  return {
    hourlyRate,
    dailyRate,
    prorationFactor,
    overtimeAbsorbed,
    absorbedOvertime: overtimeAbsorbed
      ? round2(weeklyOvertimeHours * hourlyRate * 1.5)
      : 0,
    lineItems,
    subtotal,
    postSubtotalAdjustments,
    grandTotal: round2(subtotal + postSubtotalAdjustments),
  };
}
