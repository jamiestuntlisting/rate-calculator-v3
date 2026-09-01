import { calculateRate } from "@/lib/rate-engine";
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
 * The search stays inside normal parameters on purpose: a 6:00 AM call,
 * lunch six hours later and half an hour long, the day running eight to
 * sixteen hours in 6-minute steps, a stunt adjustment from nothing to
 * $1,000 in $50 steps, and — past the second meal window — both the
 * day that took a second meal and the day that ran through it into
 * penalties. Sixth/seventh days and holidays are out of scope here.
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
/** Matching to the cent, with float slack. */
const EXACT_WITHIN = 0.005;
/** Past this a "near miss" explains nothing. */
const CLOSE_WITHIN = 500;

const round2 = (n: number) => Math.round(n * 100) / 100;

const timeAfterCall = (minutes: number): string => {
  const total = 6 * 60 + Math.round(minutes);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(
    total % 60
  ).padStart(2, "0")}`;
};

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
}

export interface ObviousCheck {
  label: string;
  total: number;
  diff: number;
}

export interface ReverseResult {
  target: number;
  /** Shapes that land on the check to the cent. */
  exact: ReverseCandidate[];
  /** The nearest misses, closest first. */
  close: ReverseCandidate[];
  /** The shapes to rule out before anything clever. */
  obvious: ObviousCheck[];
}

function buildInput(
  workDate: string,
  workStatus: string,
  spanHours: number,
  adjustment: number,
  secondMeal: boolean
): ExhibitGInput {
  const dismiss = timeAfterCall(spanHours * 60);
  return {
    showName: "",
    workDate,
    callTime: REVERSE_DEFAULTS.callTime,
    dismissOnSet: dismiss,
    dismissMakeupWardrobe: null,
    ndMealIn: null,
    ndMealOut: null,
    firstMealStart: REVERSE_DEFAULTS.firstMealStart,
    firstMealFinish: REVERSE_DEFAULTS.firstMealFinish,
    secondMealStart: secondMeal ? "18:30" : null,
    secondMealFinish: secondMeal ? "19:00" : null,
    stuntAdjustment: adjustment,
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
  workDate: string,
  workStatus: string,
  spanHours: number,
  adjustment: number,
  secondMeal: boolean,
  target: number
): ReverseCandidate | null {
  const input = buildInput(workDate, workStatus, spanHours, adjustment, secondMeal);
  try {
    const calculation = calculateRate(input);
    const total = round2(calculation.grandTotal);
    return {
      input,
      calculation,
      total,
      diff: round2(total - target),
      spanHours: round2(spanHours),
      workedHours: round2(calculation.netWorkHours),
      adjustment,
      secondMeal,
      penalties: round2(calculation.penalties?.totalPenalties ?? 0),
      dismissTime: input.dismissOnSet,
    };
  } catch {
    // A shape the engine refuses is not a candidate.
    return null;
  }
}

export function reverseDaily(
  target: number,
  workDate: string,
  workStatus: string
): ReverseResult {
  const candidates: ReverseCandidate[] = [];
  const steps = Math.round((SPAN_MAX_HOURS - SPAN_MIN_HOURS) / SPAN_STEP_HOURS);
  for (let i = 0; i <= steps; i++) {
    const span = SPAN_MIN_HOURS + i * SPAN_STEP_HOURS;
    for (let adj = 0; adj <= ADJUSTMENT_MAX; adj += ADJUSTMENT_STEP) {
      const noSecond = priceShape(workDate, workStatus, span, adj, false, target);
      if (noSecond) candidates.push(noSecond);
      // A second meal only fits a day still running well past its
      // 6:30–7:00 PM slot.
      if (span >= 13.2) {
        const withSecond = priceShape(workDate, workStatus, span, adj, true, target);
        if (withSecond) candidates.push(withSecond);
      }
    }
  }

  // Inside the 8-hour guarantee every short day pays the same minimum,
  // so exact matches are deduped by what actually distinguishes a story:
  // the money, the adjustment, the penalties, the second meal.
  const exact: ReverseCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (Math.abs(candidate.diff) > EXACT_WITHIN) continue;
    const key = [
      candidate.total,
      candidate.adjustment,
      candidate.penalties,
      candidate.secondMeal,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    exact.push(candidate);
  }
  exact.sort((a, b) => a.spanHours - b.spanHours);

  // Deduped the same way: six spans inside the guarantee all pay the
  // same minimum, and six copies of one story teach nothing.
  const close: ReverseCandidate[] = [];
  const seenClose = new Set<string>();
  for (const candidate of [...candidates].sort(
    (a, b) => Math.abs(a.diff) - Math.abs(b.diff)
  )) {
    if (Math.abs(candidate.diff) <= EXACT_WITHIN) continue;
    if (Math.abs(candidate.diff) > CLOSE_WITHIN) continue;
    const key = [
      candidate.total,
      candidate.adjustment,
      candidate.penalties,
      candidate.secondMeal,
    ].join("|");
    if (seenClose.has(key)) continue;
    seenClose.add(key);
    close.push(candidate);
    if (close.length >= 6) break;
  }

  // The obvious shapes first — rule these out before anything clever.
  const obvious: ObviousCheck[] = [];
  const addObvious = (
    label: string,
    spanHours: number,
    adjustment: number,
    secondMeal = false
  ) => {
    const shape = priceShape(
      workDate,
      workStatus,
      spanHours,
      adjustment,
      secondMeal,
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
  addObvious(
    "That same 12-hour day with no stunt adjustment",
    12.5,
    0
  );

  return { target: round2(target), exact, close, obvious };
}
