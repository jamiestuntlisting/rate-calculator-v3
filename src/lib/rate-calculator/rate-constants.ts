// SAG-AFTRA Theatrical/Television Basic Agreement rates, by effective date.
//
// Rates change on July 1 (the 2023 cycle's mid-year 11/9/23 bump being the
// strike-year exception), so a work day is priced by the schedule in force
// on its date — a 2025 day at 2025 rates, whatever year it is entered.
//
// Three kinds of column:
//
// "wage tables" — VERIFIED against the published tables (each row a clean
// 3% ladder, daily and weekly rows cross-checking at the performer's
// daily-to-weekly ratio, and two cells anchored by real 08/2026 contracts).
//
// "scheduled increase" — the 2026-30 agreement's contractual 3% raises.
// Most cells are quoted in the published five-year ladders; the day
// performer dailies past 07/26 are projected by the same nearest-dollar
// 3% rule that reproduces every verified ladder, and should be confirmed
// against the posted table each July.
//
// "derived" — the years before 07/01/2025, walked BACK from the verified
// 2025 column through each agreement's general wage increase, rounding to
// the dollar at every step the way the union publishes them:
//
//   2014 agreement   +2.5% 07/01/14, +3% 07/01/15, +3% 07/01/16
//   2017 agreement   +2.5% to minimums each of 07/01/17, /18, /19
//                    (the headline 3% in years 2–3 diverted ½% to pension)
//   2020 agreement   +2.5% to minimums each of 07/01/20, /21, /22
//                    (same ½% diversion to the health plan)
//   2023 agreement   +7% on ratification 11/09/23, +4% 07/01/24,
//                    +3.5% 07/01/25
//
// The day performer daily column is the check on the method: walking back
// lands on 1,204 · 1,158 · 1,082 · 1,056 · 1,030 · 1,005 · 980 · 956 ·
// 933 · 906 · 880 — the published minimums for those years — so the
// percentages and their order are right. The other rows follow the same
// arithmetic and can sit a dollar off a published cell where a raise
// landed on exactly half a dollar (a 2016 3-day cell does); /admin/rates
// marks the derived columns so they can be confirmed against the tables
// when those are in hand. Before 07/01/2014 the app has no schedule and
// uses the earliest one, which /admin/rates also says.

export interface ScheduleCells {
  /** Day performer (Schedule A/H) daily and weekly minimums. */
  basicDaily: number;
  basicWeekly: number;
  /** Stunt coordinator on a flat deal (Schedule K-III). */
  coordFlatDaily: number;
  coordFlatWeekly: number;
  /**
   * Stunt coordinator employed at less than flat deal. The daily is the
   * day performer minimum — the wage table lists "Stunt Coordinator
   * (employed at less than 'flat deal' minimum)" on the Performer row
   * ($1,246 → $1,283 → $1,321 → $1,361 → $1,402), corrected 09/2026
   * after a wrong $1,329 ladder. The weekly is still the earlier figure
   * pending the Weekly Performers section of the same table.
   */
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
  source: "wage tables" | "scheduled increase" | "derived";
  cells: ScheduleCells;
}

/** Ascending by effective date. */
export const RATE_SCHEDULES: RateScheduleEntry[] = [
  {
    effectiveFrom: "2014-07-01",
    source: "derived",
    cells: {
      basicDaily: 880.0,
      basicWeekly: 3280.0,
      coordFlatDaily: 1162.0,
      coordFlatWeekly: 4625.0,
      coordDailyDaily: 880.0,
      coordDailyWeekly: 3395.0,
      threeDayShort: 2227.0,
      threeDayLong: 2620.0,
      coordFlatThreeDayShort: 3261.0,
      coordFlatThreeDayLong: 3642.0,
    },
  },
  {
    effectiveFrom: "2015-07-01",
    source: "derived",
    cells: {
      basicDaily: 906.0,
      basicWeekly: 3378.0,
      coordFlatDaily: 1197.0,
      coordFlatWeekly: 4764.0,
      coordDailyDaily: 906.0,
      coordDailyWeekly: 3497.0,
      threeDayShort: 2294.0,
      threeDayLong: 2699.0,
      coordFlatThreeDayShort: 3359.0,
      coordFlatThreeDayLong: 3751.0,
    },
  },
  {
    effectiveFrom: "2016-07-01",
    source: "derived",
    cells: {
      basicDaily: 933.0,
      basicWeekly: 3479.0,
      coordFlatDaily: 1233.0,
      coordFlatWeekly: 4907.0,
      coordDailyDaily: 933.0,
      coordDailyWeekly: 3602.0,
      threeDayShort: 2363.0,
      threeDayLong: 2780.0,
      coordFlatThreeDayShort: 3460.0,
      coordFlatThreeDayLong: 3864.0,
    },
  },
  {
    effectiveFrom: "2017-07-01",
    source: "derived",
    cells: {
      basicDaily: 956.0,
      basicWeekly: 3566.0,
      coordFlatDaily: 1264.0,
      coordFlatWeekly: 5030.0,
      coordDailyDaily: 956.0,
      coordDailyWeekly: 3692.0,
      threeDayShort: 2422.0,
      threeDayLong: 2850.0,
      coordFlatThreeDayShort: 3546.0,
      coordFlatThreeDayLong: 3961.0,
    },
  },
  {
    effectiveFrom: "2018-07-01",
    source: "derived",
    cells: {
      basicDaily: 980.0,
      basicWeekly: 3655.0,
      coordFlatDaily: 1296.0,
      coordFlatWeekly: 5156.0,
      coordDailyDaily: 980.0,
      coordDailyWeekly: 3784.0,
      threeDayShort: 2483.0,
      threeDayLong: 2921.0,
      coordFlatThreeDayShort: 3635.0,
      coordFlatThreeDayLong: 4060.0,
    },
  },
  {
    effectiveFrom: "2019-07-01",
    source: "derived",
    cells: {
      basicDaily: 1005.0,
      basicWeekly: 3746.0,
      coordFlatDaily: 1328.0,
      coordFlatWeekly: 5285.0,
      coordDailyDaily: 1005.0,
      coordDailyWeekly: 3879.0,
      threeDayShort: 2545.0,
      threeDayLong: 2994.0,
      coordFlatThreeDayShort: 3726.0,
      coordFlatThreeDayLong: 4162.0,
    },
  },
  {
    effectiveFrom: "2020-07-01",
    source: "derived",
    cells: {
      basicDaily: 1030.0,
      basicWeekly: 3840.0,
      coordFlatDaily: 1361.0,
      coordFlatWeekly: 5417.0,
      coordDailyDaily: 1030.0,
      coordDailyWeekly: 3976.0,
      threeDayShort: 2609.0,
      threeDayLong: 3069.0,
      coordFlatThreeDayShort: 3819.0,
      coordFlatThreeDayLong: 4266.0,
    },
  },
  {
    effectiveFrom: "2021-07-01",
    source: "derived",
    cells: {
      basicDaily: 1056.0,
      basicWeekly: 3936.0,
      coordFlatDaily: 1395.0,
      coordFlatWeekly: 5552.0,
      coordDailyDaily: 1056.0,
      coordDailyWeekly: 4075.0,
      threeDayShort: 2674.0,
      threeDayLong: 3146.0,
      coordFlatThreeDayShort: 3914.0,
      coordFlatThreeDayLong: 4373.0,
    },
  },
  {
    effectiveFrom: "2022-07-01",
    source: "derived",
    cells: {
      basicDaily: 1082.0,
      basicWeekly: 4034.0,
      coordFlatDaily: 1430.0,
      coordFlatWeekly: 5691.0,
      coordDailyDaily: 1082.0,
      coordDailyWeekly: 4177.0,
      threeDayShort: 2741.0,
      threeDayLong: 3225.0,
      coordFlatThreeDayShort: 4012.0,
      coordFlatThreeDayLong: 4482.0,
    },
  },
  {
    effectiveFrom: "2023-11-09",
    source: "derived",
    cells: {
      basicDaily: 1158.0,
      basicWeekly: 4316.0,
      coordFlatDaily: 1530.0,
      coordFlatWeekly: 6089.0,
      coordDailyDaily: 1158.0,
      coordDailyWeekly: 4469.0,
      threeDayShort: 2933.0,
      threeDayLong: 3451.0,
      coordFlatThreeDayShort: 4293.0,
      coordFlatThreeDayLong: 4796.0,
    },
  },
  {
    effectiveFrom: "2024-07-01",
    source: "derived",
    cells: {
      basicDaily: 1204.0,
      basicWeekly: 4489.0,
      coordFlatDaily: 1591.0,
      coordFlatWeekly: 6333.0,
      coordDailyDaily: 1204.0,
      coordDailyWeekly: 4648.0,
      threeDayShort: 3050.0,
      threeDayLong: 3589.0,
      coordFlatThreeDayShort: 4465.0,
      coordFlatThreeDayLong: 4988.0,
    },
  },
  {
    effectiveFrom: "2025-07-01",
    source: "wage tables",
    cells: {
      basicDaily: 1246.0,
      basicWeekly: 4646.0,
      coordFlatDaily: 1647.0,
      coordFlatWeekly: 6555.0,
      coordDailyDaily: 1246.0,
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
      coordDailyDaily: 1283.0,
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
      coordDailyDaily: 1321.0,
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
      coordDailyDaily: 1361.0,
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
      coordDailyDaily: 1402.0,
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

/**
 * The Commercials Contract runs on its own calendar — raises land on
 * April 1, not July 1 — so its session fee is a separate ladder rather
 * than a column in the schedules above. The session fee buys an 8-hour
 * day for every performer classification including stunt performers,
 * per SAG-AFTRA's own rate sheets. Verified figures: $822.30 from the
 * 2025 Commercials Contract Year 1 rate sheet (+5.0% on the prior
 * $783.10), $855.20 from the union's 2026-27 member cheat sheet, whose
 * printed overtime rates ($160.35 at 1.5x, $213.80 at 2x) are exactly
 * 855.20/8 scaled — the arithmetic locks all three. Dates before the
 * earliest entry use it, the same convention as the schedules above.
 */
export const COMMERCIAL_SCHEDULES: Array<{
  effectiveFrom: string;
  sessionFee: number;
  source: string;
}> = [
  {
    effectiveFrom: "2022-04-01",
    sessionFee: 783.1,
    source: "2022 contract figure, in force through 03/31/2025",
  },
  {
    effectiveFrom: "2025-04-01",
    sessionFee: 822.3,
    source: "2025 Commercials Contract rate sheet, year 1",
  },
  {
    effectiveFrom: "2026-04-01",
    sessionFee: 855.2,
    source: "2025 Commercials Contract rate sheet, year 2",
  },
];

/** The commercial session fee in force on a work day. */
export function commercialSessionFee(workDate?: string | null): number {
  const d = (workDate || "").slice(0, 10);
  let pick = COMMERCIAL_SCHEDULES[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    for (const row of COMMERCIAL_SCHEDULES) {
      if (row.effectiveFrom <= d) pick = row;
    }
  } else {
    pick = COMMERCIAL_SCHEDULES[COMMERCIAL_SCHEDULES.length - 1];
  }
  return pick.sessionFee;
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
