import { calculateRate } from "@/lib/rate-engine";
import { RATE_SCHEDULES, ratesForDate } from "@/lib/rate-constants";
import type { RateSchedule } from "@/lib/rate-constants";
import type { CalculationBreakdown, ExhibitGInput } from "@/types";

/**
 * The reverse calculator for dailies: given the gross a check actually
 * paid, search the shapes a normal day can take and say which ones land
 * on that number — so an admin can see how someone's rate was probably
 * worked out, and where it went wrong.
 *
 * Every candidate is priced by the real engine, never by arithmetic done
 * here, so a match means "the calculator produces this figure from this
 * day", not "these numbers happen to add up".
 *
 * There is no date to enter. A check is for a day at whichever rate was
 * in force, and a check in hand is usually for a recent one, so the
 * search runs every rate schedule that was in force within the last two
 * years and tags each candidate with the schedule it matched — the
 * match names the rate as well as the day.
 *
 * The shapes searched are the finite set of payments a normal daily can
 * produce: a 6:00 AM call; lunch six hours in, or late by each half hour
 * up to two (each half hour a distinct meal penalty); the day running
 * eight to sixteen hours in 6-minute steps; a stunt adjustment from
 * nothing to $1,000 in $50 steps; and — past the second meal window —
 * both the day that took a second meal and the day that ran through it
 * into penalties. Sixth/seventh days and holidays are out of scope here.
 */

/** The starting-point day: 6h to lunch, half-hour lunch, 6h to wrap. */
export const REVERSE_DEFAULTS = {
  callTime: "06:00",
  firstMealStart: "12:00",
  firstMealFinish: "12:30",
  /** Six hours after lunch out. */
  defaultDismiss: "18:30",
  defaultAdjustment: 100,
} as const;

const SPAN_MIN_HOURS = 8;
const SPAN_MAX_HOURS = 16;
/** 6 minutes — a tenth of an hour, how payroll rounds. */
const SPAN_STEP_HOURS = 0.1;
const ADJUSTMENT_MAX = 1000;
const ADJUSTMENT_STEP = 50;
/** Lunch on time, then late by each half hour up to two hours. */
const LUNCH_LATE_HOURS = [0, 0.5, 1, 1.5, 2] as const;
/** Half an hour: a meal, as the engine assumes one. */
const MEAL_HOURS = 0.5;
/** Matching to the cent, with float slack. */
const EXACT_WITHIN = 0.005;
/** How many near misses to tell. */
const CLOSE_COUNT = 8;
/** Schedules in force within this many months back are searched. */
const LOOKBACK_MONTHS = 24;

const round2 = (n: number) => Math.round(n * 100) / 100;

const timeAfterCall = (minutes: number): string => {
  const total = 6 * 60 + Math.round(minutes);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(
    total % 60
  ).padStart(2, "0")}`;
};

const isoToday = () => new Date().toISOString().slice(0, 10);

/** One rate schedule the search runs through. */
export interface SearchedRate {
  /** The schedule's first day, YYYY-MM-DD. */
  effectiveFrom: string;
  /** The day rate that schedule pays the agreement. */
  daily: number;
}

/**
 * The schedules in force at any point in the last two years, newest
 * first: the current one, and each earlier one back to the one that
 * was in force two years ago today.
 */
export function searchedRates(
  workStatus: string,
  today: string = isoToday()
): SearchedRate[] {
  const cutoff = (() => {
    const [y, m, d] = today.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - LOOKBACK_MONTHS - 1, d));
    return dt.toISOString().slice(0, 10);
  })();
  const inForce = RATE_SCHEDULES.filter((s) => s.effectiveFrom <= today);
  const picked: string[] = [];
  for (let i = inForce.length - 1; i >= 0; i--) {
    picked.push(inForce[i].effectiveFrom);
    if (inForce[i].effectiveFrom <= cutoff) break;
  }
  return picked.map((effectiveFrom) => {
    const table = ratesForDate(effectiveFrom);
    const entry = table[workStatus as RateSchedule] ?? table.theatrical_basic;
    return { effectiveFrom, daily: entry.daily };
  });
}

export interface ReverseCandidate {
  input: ExhibitGInput;
  calculation: CalculationBreakdown;
  total: number;
  /** total − target: positive means this shape pays more than the check. */
  diff: number;
  /** Call to dismissal, meals included. */
  spanHours: number;
  /** Hours actually worked, as the engine counts them. */
  workedHours: number;
  adjustment: number;
  secondMeal: boolean;
  penalties: number;
  dismissTime: string;
  /** Lunch, as the shape took it. */
  lunchStart: string;
  lunchFinish: string;
  /** Hours lunch ran past the six-hour deadline; 0 is on time. */
  lunchLateHours: number;
  /** The second meal, when the shape took one. */
  secondMealStart: string | null;
  secondMealFinish: string | null;
  /** The rate schedule this shape was priced on. */
  rateDate: string;
  /** That schedule's day rate for the agreement. */
  baseDaily: number;
}

export interface ObviousCheck {
  label: string;
  total: number;
  diff: number;
}

/** A grid of the payments a normal day produces at one rate. */
export interface CommonPayments {
  rate: SearchedRate;
  /** Column headings: stunt adjustments. */
  adjustments: number[];
  /** One row per whole hour worked; cells follow `adjustments`. */
  rows: Array<{ workedHours: number; totals: number[] }>;
  /** The cell nearest the check, or null with no check. */
  nearest: { workedHours: number; adjustment: number; total: number } | null;
}

export interface ReverseResult {
  target: number;
  /** The schedules searched, newest first. */
  rates: SearchedRate[];
  /** Shapes that land on the check to the cent. */
  exact: ReverseCandidate[];
  /** The nearest misses, closest first — always some, however far. */
  close: ReverseCandidate[];
  /** The shapes to rule out before anything clever, at the current rate. */
  obvious: ObviousCheck[];
  /** The common-payments grid for each rate searched. */
  common: CommonPayments[];
}

interface Shape {
  spanHours: number;
  adjustment: number;
  lunchLateHours: number;
  secondMeal: boolean;
}

/**
 * The second meal is due six hours after lunch ends. A shape only takes
 * one when the day runs past that point with work left after the meal.
 */
const secondMealFits = (spanHours: number, lunchLateHours: number) =>
  spanHours >=
  6 + lunchLateHours + MEAL_HOURS + 6 + MEAL_HOURS + 2 * SPAN_STEP_HOURS - 1e-9;

function buildInput(rateDate: string, workStatus: string, shape: Shape): ExhibitGInput {
  const dismiss = timeAfterCall(shape.spanHours * 60);
  const lunchStart = timeAfterCall((6 + shape.lunchLateHours) * 60);
  const lunchFinish = timeAfterCall((6 + shape.lunchLateHours + MEAL_HOURS) * 60);
  const secondStart = shape.secondMeal
    ? timeAfterCall((6 + shape.lunchLateHours + MEAL_HOURS + 6) * 60)
    : null;
  const secondFinish = shape.secondMeal
    ? timeAfterCall((6 + shape.lunchLateHours + MEAL_HOURS + 6 + MEAL_HOURS) * 60)
    : null;
  return {
    showName: "",
    // Priced on the schedule's own first day, so the date IS the rate.
    workDate: rateDate,
    callTime: REVERSE_DEFAULTS.callTime,
    dismissOnSet: dismiss,
    dismissMakeupWardrobe: null,
    ndMealIn: null,
    ndMealOut: null,
    firstMealStart: lunchStart,
    firstMealFinish: lunchFinish,
    secondMealStart: secondStart,
    secondMealFinish: secondFinish,
    stuntAdjustment: shape.adjustment,
    flatDayRate: null,
    forcedCall: false,
    isSixthDay: false,
    isSeventhDay: false,
    isHoliday: false,
    workStatus,
    characterName: "",
    notes: "",
  };
}

function priceShape(
  rate: SearchedRate,
  workStatus: string,
  shape: Shape,
  target: number
): ReverseCandidate | null {
  const input = buildInput(rate.effectiveFrom, workStatus, shape);
  try {
    const calculation = calculateRate(input);
    const total = round2(calculation.grandTotal);
    return {
      input,
      calculation,
      total,
      diff: round2(total - target),
      spanHours: round2(shape.spanHours),
      workedHours: round2(calculation.netWorkHours),
      adjustment: shape.adjustment,
      secondMeal: shape.secondMeal,
      penalties: round2(calculation.penalties?.totalPenalties ?? 0),
      dismissTime: input.dismissOnSet,
      lunchStart: input.firstMealStart!,
      lunchFinish: input.firstMealFinish!,
      lunchLateHours: shape.lunchLateHours,
      secondMealStart: input.secondMealStart,
      secondMealFinish: input.secondMealFinish,
      rateDate: rate.effectiveFrom,
      baseDaily: rate.daily,
    };
  } catch {
    // A shape the engine refuses is not a candidate.
    return null;
  }
}

/** What distinguishes one story from another. */
const storyKey = (c: ReverseCandidate) =>
  [c.total, c.adjustment, c.penalties, c.secondMeal, c.rateDate].join("|");

/**
 * The common payments at one rate: whole hours worked against a few
 * usual adjustments, meals on time (a second meal taken once the day
 * runs past twelve worked hours), no penalties. The finite table of
 * what a normal day pays — most checks are on it somewhere.
 */
export function commonPayments(
  rate: SearchedRate,
  workStatus: string,
  target: number | null
): CommonPayments {
  const adjustments = [0, 100, 250, 500];
  const rows: CommonPayments["rows"] = [];
  let nearest: CommonPayments["nearest"] = null;
  for (let worked = 8; worked <= 16; worked++) {
    const secondMeal = worked > 12;
    const spanHours = worked + MEAL_HOURS + (secondMeal ? MEAL_HOURS : 0);
    const totals: number[] = [];
    for (const adjustment of adjustments) {
      const shape = priceShape(
        rate,
        workStatus,
        { spanHours, adjustment, lunchLateHours: 0, secondMeal },
        target ?? 0
      );
      const total = shape ? shape.total : NaN;
      totals.push(total);
      if (
        target !== null &&
        shape &&
        (!nearest || Math.abs(total - target) < Math.abs(nearest.total - target))
      ) {
        nearest = { workedHours: worked, adjustment, total };
      }
    }
    rows.push({ workedHours: worked, totals });
  }
  return { rate, adjustments, rows, nearest };
}

export function reverseDaily(
  target: number,
  workStatus: string,
  options: { today?: string } = {}
): ReverseResult {
  const rates = searchedRates(workStatus, options.today);
  const candidates: ReverseCandidate[] = [];
  const steps = Math.round((SPAN_MAX_HOURS - SPAN_MIN_HOURS) / SPAN_STEP_HOURS);
  for (const rate of rates) {
    for (let i = 0; i <= steps; i++) {
      const spanHours = SPAN_MIN_HOURS + i * SPAN_STEP_HOURS;
      for (let adjustment = 0; adjustment <= ADJUSTMENT_MAX; adjustment += ADJUSTMENT_STEP) {
        for (const lunchLateHours of LUNCH_LATE_HOURS) {
          const shape = { spanHours, adjustment, lunchLateHours, secondMeal: false };
          const noSecond = priceShape(rate, workStatus, shape, target);
          if (noSecond) candidates.push(noSecond);
          if (secondMealFits(spanHours, lunchLateHours)) {
            const withSecond = priceShape(
              rate,
              workStatus,
              { ...shape, secondMeal: true },
              target
            );
            if (withSecond) candidates.push(withSecond);
          }
        }
      }
    }
  }

  // Inside the 8-hour guarantee every short day pays the same minimum,
  // so exact matches are deduped by what actually distinguishes a story:
  // the money, the adjustment, the penalties, the second meal, the rate.
  const exact: ReverseCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (Math.abs(candidate.diff) > EXACT_WITHIN) continue;
    const key = storyKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    exact.push(candidate);
  }
  // Simplest story first: fewest penalties, then shortest day.
  exact.sort(
    (a, b) =>
      a.penalties - b.penalties ||
      a.spanHours - b.spanHours ||
      b.rateDate.localeCompare(a.rateDate)
  );

  // The nearest misses, however far — when nothing lands, the closest
  // shapes are the answer, and the gap is often the finding.
  const close: ReverseCandidate[] = [];
  const seenClose = new Set<string>();
  for (const candidate of [...candidates].sort(
    (a, b) => Math.abs(a.diff) - Math.abs(b.diff) || a.penalties - b.penalties
  )) {
    if (Math.abs(candidate.diff) <= EXACT_WITHIN) continue;
    const key = storyKey(candidate);
    if (seenClose.has(key)) continue;
    seenClose.add(key);
    close.push(candidate);
    if (close.length >= CLOSE_COUNT) break;
  }

  // The obvious shapes first, at the current rate — rule these out
  // before anything clever.
  const current = rates[0];
  const obvious: ObviousCheck[] = [];
  const addObvious = (label: string, spanHours: number, adjustment: number) => {
    const shape = priceShape(
      current,
      workStatus,
      { spanHours, adjustment, lunchLateHours: 0, secondMeal: false },
      target
    );
    if (shape) obvious.push({ label, total: shape.total, diff: shape.diff });
  };
  // 8.5h span = exactly 8 worked with the half-hour lunch out.
  addObvious("A plain 8-hour day at scale — no adjustment, no penalties", 8.5, 0);
  addObvious("The same 8-hour day with a $100 stunt adjustment", 8.5, 100);
  addObvious(
    "The starting-point day: 6h to lunch, half-hour lunch, 6h to wrap, $100 adjustment",
    12.5,
    REVERSE_DEFAULTS.defaultAdjustment
  );
  addObvious("That same 12-hour day with no stunt adjustment", 12.5, 0);

  const common = rates.map((rate) => commonPayments(rate, workStatus, target));

  return { target: round2(target), rates, exact, close, obvious, common };
}
