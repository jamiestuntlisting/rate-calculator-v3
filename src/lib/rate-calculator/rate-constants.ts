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
  // A coordinator on a "flat deal" (Schedule K-III): one number for the
  // day or week, no overtime. Verified against the 2026-30 wage tables'
  // 07/01/26 column — the daily ladder runs 1,647 / 1,696 / 1,747 / 1,799
  // / 1,853 and the weekly 6,555 / 6,752 / 6,955 / 7,164 / 7,379, each a
  // clean 3% step, and James's own 08/2026 coordinator contract is
  // written at exactly $1,696. The 1,996/7,439 previously here matched no
  // published row.
  stunt_coordinator: {
    daily: 1696.0,
    weekly: 6752.0,
    hourly: 212.0, // 1696 / 8
    straightTimeHours: 8,
  },

  // A coordinator employed at *less than* flat deal (Schedule K-I daily,
  // K-II weekly) works overtime like anyone else — which is the reason the
  // two exist separately. It does NOT track the day performer minimum: the
  // tables carry its own rows, about 3.6% above the performer's (daily
  // ladder 1,290 / 1,329 / 1,369 / 1,410 / 1,452; weekly 4,811 / 4,955 /
  // 5,104 / 5,257 / 5,415), cross-checking daily-to-weekly at the same
  // ratio as the performer rows.
  stunt_coordinator_daily: {
    daily: 1329.0,
    weekly: 4955.0,
    hourly: 166.125, // 1329 / 8
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
