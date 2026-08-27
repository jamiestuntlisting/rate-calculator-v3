// SAG-AFTRA Theatrical Basic Agreement (effective 07/01/2026).
// The 2026 TV/Theatrical contract raised minimums 3% on 07/01/2026; the day
// performer rate went from $1,246 to $1,283. The other figures below carry
// the same 3% increase forward from the 2025-2026 schedule.
/** A day performer's minimum on a low budget agreement, as a share of basic. */
function lowBudget(share: number) {
  const money = (n: number) => Math.round(n * 100) / 100;
  const daily = money(1283.0 * share);
  return {
    daily,
    weekly: money(4785.0 * share),
    hourly: daily / 8,
    straightTimeHours: 8,
  };
}

export const RATES = {
  theatrical_basic: {
    daily: 1283.0,
    weekly: 4785.0,
    hourly: 160.375, // 1283 / 8
    straightTimeHours: 8,
  },
  television: {
    daily: 1283.0,
    weekly: 4785.0,
    hourly: 160.375, // same rate as theatrical
    straightTimeHours: 8,
  },
  // A coordinator on a "flat deal": one number for the day, no overtime.
  // This is the higher Schedule K figure, and it is what `stunt_coordinator`
  // has always meant here.
  stunt_coordinator: {
    daily: 1996.0,
    weekly: 7439.0,
    hourly: 249.5, // 1996 / 8
    straightTimeHours: 8,
  },

  // A coordinator employed at *less than* flat deal is on a day rate and
  // works overtime like anyone else — which is the reason the two exist
  // separately. The rate tracks the day performer minimum ($1,246 → $1,283
  // on 07/01/2026), and the weekly tracks weekly scale.
  stunt_coordinator_daily: {
    daily: 1283.0,
    weekly: 4785.0,
    hourly: 160.375, // 1283 / 8
    straightTimeHours: 8,
  },

  // The low budget agreements do not publish their own dollar minimums.
  // Each is written as a percentage of "the applicable rate from the Basic
  // Agreement current at the time of performance", so they are derived from
  // the schedule above rather than typed out — when the basic rate moves,
  // these move with it, which is what the contract says happens.
  //
  // Stunt COORDINATORS are excluded from the reduction in all three: their
  // daily, weekly and flat-deal rates track Schedule K of the Basic
  // Agreement whatever the production's budget, so a coordinator on a low
  // budget show is still `stunt_coordinator` above.
  low_budget: lowBudget(0.65),
  modified_low_budget: lowBudget(0.35),
  ultra_low_budget: lowBudget(0.2),
} as const;

export type RateSchedule = keyof typeof RATES;

export const OVERTIME = {
  straightTimeEnd: 8, // hours 1-8 at 1.0x
  timeAndHalfEnd: 10, // hours 9-10 at 1.5x
  // hours 11+ at 2.0x (no cap / no golden time)
} as const;

export const MULTIPLIERS = {
  straight: 1.0,
  timeAndHalf: 1.5,
  doubleTime: 2.0,
  sixthDay: 1.5,
  seventhDay: 2.0,
  holiday: 2.0,
} as const;

export const MEAL_PENALTIES = {
  firstHalfHour: 25.0,
  secondHalfHour: 35.0,
  eachAdditionalHalfHour: 50.0,
  maxHoursBeforeFirstMeal: 6, // must get meal within 6 hours of call
  maxHoursBeforeSecondMeal: 6, // within 6 hours after first meal ends
} as const;

export const FORCED_CALL = {
  maxPenalty: 900.0, // lesser of one day's pay or $900
} as const;

export const TIME_INCREMENT_MINUTES = 6; // OT in 1/10th hour (6-min) increments

export const EFFECTIVE_DATE = "2026-07-01"; // SAG-AFTRA contract effective date encoded by this version
