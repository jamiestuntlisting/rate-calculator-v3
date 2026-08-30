// SAG-AFTRA Theatrical/Television Basic Agreement rates, by effective date.
//
// Rates change on July 1 (the 2023 cycle's mid-year 11/9/23 bump being the
// strike-year exception), so a work day is priced by the schedule in force
// on its date — a 2025 day at 2025 rates, whatever year it is entered.
//
// The schedules below are the ones that could be VERIFIED against the
// published wage tables (each row a clean 3% ladder, daily and weekly rows
// cross-checking at the performer's daily-to-weekly ratio, and two cells
// anchored by real 08/2026 contracts). Years before 07/01/2025 are absent
// on purpose: the app never guesses a rate, so a day before the earliest
// schedule uses the earliest schedule and /admin/rates says so. When the
// real tables for earlier years are in hand they slot in here.
//
// "scheduled increase" rows carry the 2026-30 agreement's contractual 3%
// raises. Most of their cells are quoted in the published five-year
// ladders; the day performer dailies past 07/26 are projected by the same
// nearest-dollar 3% rule that reproduces every verified ladder, and should
// be confirmed against the posted table each July.

export interface ScheduleCells {
  /** Day performer (Schedule A/H) daily and weekly minimums. */
  basicDaily: number;
  basicWeekly: number;
  /** Stunt coordinator on a flat deal (Schedule K-III). */
  coordFlatDaily: number;
  coordFlatWeekly: number;
  /** Stunt coordinator employed at less than flat deal (K-I / K-II). */
  coordDailyDaily: number;
  coordDailyWeekly: number;
  /** TV 3-day player, by the show's format. */
  threeDayShort: number; // ½ & 1-hour shows
  threeDayLong: number; // 1½ & 2-hour shows
  /** Stunt coordinator flat deal on a 3-day, same split. */
  coordFlatThreeDayShort: number;
  coordFlatThreeDayLong: number;
}

export interface RateScheduleEntry {
  /** First day this schedule applies, YYYY-MM-DD. */
  effectiveFrom: string;
  /** Where the figures come from — shown on /admin/rates. */
  source: "wage tables" | "scheduled increase";
  cells: ScheduleCells;
}

/** Ascending by effective date. */
export const RATE_SCHEDULES: RateScheduleEntry[] = [
  {
    effectiveFrom: "2025-07-01",
    source: "wage tables",
    cells: {
      basicDaily: 1246.0,
      basicWeekly: 4646.0,
      coordFlatDaily: 1647.0,
      coordFlatWeekly: 6555.0,
      coordDailyDaily: 1290.0,
      coordDailyWeekly: 4811.0,
      threeDayShort: 3157.0,
      threeDayLong: 3715.0,
      coordFlatThreeDayShort: 4621.0,
      coordFlatThreeDayLong: 5163.0,
    },
  },
  {
    effectiveFrom: "2026-07-01",
    source: "wage tables",
    cells: {
      basicDaily: 1283.0,
      basicWeekly: 4785.0,
      coordFlatDaily: 1696.0,
      coordFlatWeekly: 6752.0,
      coordDailyDaily: 1329.0,
      coordDailyWeekly: 4955.0,
      threeDayShort: 3252.0,
      threeDayLong: 3826.0,
      coordFlatThreeDayShort: 4760.0,
      coordFlatThreeDayLong: 5318.0,
    },
  },
  {
    effectiveFrom: "2027-07-01",
    source: "scheduled increase",
    cells: {
      basicDaily: 1321.0,
      basicWeekly: 4929.0,
      coordFlatDaily: 1747.0,
      coordFlatWeekly: 6955.0,
      coordDailyDaily: 1369.0,
      coordDailyWeekly: 5104.0,
      threeDayShort: 3350.0,
      threeDayLong: 3941.0,
      coordFlatThreeDayShort: 4903.0,
      coordFlatThreeDayLong: 5478.0,
    },
  },
  {
    effectiveFrom: "2028-07-01",
    source: "scheduled increase",
    cells: {
      basicDaily: 1361.0,
      basicWeekly: 5077.0,
      coordFlatDaily: 1799.0,
      coordFlatWeekly: 7164.0,
      coordDailyDaily: 1410.0,
      coordDailyWeekly: 5257.0,
      threeDayShort: 3451.0,
      threeDayLong: 4059.0,
      coordFlatThreeDayShort: 5050.0,
      coordFlatThreeDayLong: 5642.0,
    },
  },
  {
    effectiveFrom: "2029-07-01",
    source: "scheduled increase",
    cells: {
      basicDaily: 1402.0,
      basicWeekly: 5229.0,
      coordFlatDaily: 1853.0,
      coordFlatWeekly: 7379.0,
      coordDailyDaily: 1452.0,
      coordDailyWeekly: 5415.0,
      threeDayShort: 3555.0,
      threeDayLong: 4181.0,
      coordFlatThreeDayShort: 5202.0,
      coordFlatThreeDayLong: 5811.0,
    },
  },
];

export type RateSchedule =
  | "theatrical_basic"
  | "television"
  | "stunt_coordinator"
  | "stunt_coordinator_daily"
  | "low_budget"
  | "modified_low_budget"
  | "ultra_low_budget";

export interface RateEntry {
  daily: number;
  weekly: number;
  hourly: number;
  straightTimeHours: number;
}

export type RateTable = Record<RateSchedule, RateEntry>;

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * A full rate table from one schedule's cells. Television pays the same
 * as Theatrical. The low budget agreements do not publish their own
 * dollar minimums — each is written as a percentage of "the applicable
 * rate from the Basic Agreement current at the time of performance", so
 * they are derived and move with the basic rate, which is what the
 * contract says happens. Stunt COORDINATORS are excluded from the
 * reduction in all three: Schedule K applies whatever the budget.
 */
function buildRates(cells: ScheduleCells): RateTable {
  const performer = (daily: number, weekly: number): RateEntry => ({
    daily,
    weekly,
    hourly: daily / 8,
    straightTimeHours: 8,
  });
  const lowBudget = (share: number): RateEntry =>
    performer(money(cells.basicDaily * share), money(cells.basicWeekly * share));
  return {
    theatrical_basic: performer(cells.basicDaily, cells.basicWeekly),
    television: performer(cells.basicDaily, cells.basicWeekly),
    stunt_coordinator: performer(cells.coordFlatDaily, cells.coordFlatWeekly),
    stunt_coordinator_daily: performer(
      cells.coordDailyDaily,
      cells.coordDailyWeekly
    ),
    low_budget: lowBudget(0.65),
    modified_low_budget: lowBudget(0.35),
    ultra_low_budget: lowBudget(0.2),
  };
}

const BUILT: RateTable[] = RATE_SCHEDULES.map((s) => buildRates(s.cells));

/**
 * The rate table in force on a date. No date, or a date before the
 * earliest schedule, falls back to the earliest applicable table rather
 * than inventing one; a date past the last schedule uses the last.
 */
export function ratesForDate(workDate?: string | null): RateTable {
  const d =
    workDate && /^\d{4}-\d{2}-\d{2}/.test(workDate)
      ? workDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  let pick = 0;
  for (let i = 0; i < RATE_SCHEDULES.length; i++) {
    if (RATE_SCHEDULES[i].effectiveFrom <= d) pick = i;
  }
  return BUILT[pick];
}

/** Which 3-day figure applies: the show's format decides. */
export type ThreeDayLength = "short" | "long";

/**
 * The TV 3-day player figures in force on a date. The ½ & 1-hour ladder
 * (3,157 → 3,252 on 07/01/26) sits beside the day performer rate in the
 * published tables; the 1½ & 2-hour ladder (3,715 → 3,826) carries the
 * long-form premium; the coordinator flat-deal 3-day pairs (4,621/5,163
 * → 4,760/5,318) are quoted in the same tables.
 */
export function threeDayRatesForDate(workDate?: string | null): {
  performerShort: number;
  performerLong: number;
  coordFlatShort: number;
  coordFlatLong: number;
} {
  const d =
    workDate && /^\d{4}-\d{2}-\d{2}/.test(workDate)
      ? workDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  let pick = 0;
  for (let i = 0; i < RATE_SCHEDULES.length; i++) {
    if (RATE_SCHEDULES[i].effectiveFrom <= d) pick = i;
  }
  const cells = RATE_SCHEDULES[pick].cells;
  return {
    performerShort: cells.threeDayShort,
    performerLong: cells.threeDayLong,
    coordFlatShort: cells.coordFlatThreeDayShort,
    coordFlatLong: cells.coordFlatThreeDayLong,
  };
}

/**
 * Today's rates — what pickers and labels show. Calculation paths pass
 * the work day's date to `ratesForDate` instead of reading this.
 */
export const RATES: RateTable = ratesForDate();

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

/** The newest schedule this build knows about. */
export const EFFECTIVE_DATE =
  RATE_SCHEDULES[RATE_SCHEDULES.length - 1].effectiveFrom;
