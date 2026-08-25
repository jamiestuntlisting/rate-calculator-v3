// SAG-AFTRA Theatrical Basic Agreement (effective 07/01/2026).
// The 2026 TV/Theatrical contract raised minimums 3% on 07/01/2026; the day
// performer rate went from $1,246 to $1,283. The other figures below carry
// the same 3% increase forward from the 2025-2026 schedule.
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
  stunt_coordinator: {
    daily: 1996.0,
    weekly: 7439.0,
    hourly: 249.5, // 1996 / 8
    straightTimeHours: 8,
  },
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
