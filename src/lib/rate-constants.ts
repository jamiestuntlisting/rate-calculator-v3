// SAG-AFTRA Theatrical Basic Agreement 2025-2026 (effective 07/01/2025)
export const RATES = {
  theatrical_basic: {
    daily: 1246.0,
    weekly: 4646.0,
    hourly: 155.75, // 1246 / 8
    straightTimeHours: 8,
  },
  television: {
    daily: 1246.0,
    weekly: 4646.0,
    hourly: 155.75, // same rate as theatrical
    straightTimeHours: 8,
  },
  stunt_coordinator: {
    daily: 1938.0,
    weekly: 7222.0, // 1938 * 5 * 0.745 ≈ approx flat deal
    hourly: 242.25, // 1938 / 8
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
