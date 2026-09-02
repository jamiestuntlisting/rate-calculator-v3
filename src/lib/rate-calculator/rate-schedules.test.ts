import { describe, expect, it } from "vitest";
import { RATE_SCHEDULES, ratesForDate } from "./rate-constants";

/**
 * The historic schedules are derived — walked back from the verified
 * 07/01/2025 column through each agreement's raise — so two things are
 * pinned here: the day performer column lands on the published minimums
 * for every year (the check that the percentages and their order are
 * right), and a date anywhere in the range picks the column in force.
 */

/** Published SAG-AFTRA day performer minimums by effective date. */
const DAY_PERFORMER: Array<[string, number]> = [
  ["2014-07-01", 880],
  ["2015-07-01", 906],
  ["2016-07-01", 933],
  ["2017-07-01", 956],
  ["2018-07-01", 980],
  ["2019-07-01", 1005],
  ["2020-07-01", 1030],
  ["2021-07-01", 1056],
  ["2022-07-01", 1082],
  ["2023-11-09", 1158],
  ["2024-07-01", 1204],
  ["2025-07-01", 1246],
  ["2026-07-01", 1283],
];

describe("historic rate schedules", () => {
  it("the day performer ladder matches the published minimums", () => {
    for (const [from, daily] of DAY_PERFORMER) {
      const entry = RATE_SCHEDULES.find((s) => s.effectiveFrom === from);
      expect(entry, from).toBeDefined();
      expect(entry!.cells.basicDaily, from).toBe(daily);
    }
  });

  /** The general wage increase that took each column to the next. */
  const RAISES: Record<string, number> = {
    "2014-07-01": 1.03,
    "2015-07-01": 1.03,
    "2016-07-01": 1.025,
    "2017-07-01": 1.025,
    "2018-07-01": 1.025,
    "2019-07-01": 1.025,
    "2020-07-01": 1.025,
    "2021-07-01": 1.025,
    "2022-07-01": 1.07,
    "2023-11-09": 1.04,
    "2024-07-01": 1.035,
    "2025-07-01": 1.03,
    "2026-07-01": 1.03,
    "2027-07-01": 1.03,
    "2028-07-01": 1.03,
  };

  it("schedules are ascending and each raise rounds to the next column", () => {
    for (let i = 0; i + 1 < RATE_SCHEDULES.length; i++) {
      const a = RATE_SCHEDULES[i];
      const b = RATE_SCHEDULES[i + 1];
      expect(a.effectiveFrom < b.effectiveFrom).toBe(true);
      const factor = RAISES[a.effectiveFrom];
      expect(factor, a.effectiveFrom).toBeDefined();
      // Every cell moved by the same general increase, to the dollar —
      // a half-dollar landing is the one place a table may differ.
      for (const key of Object.keys(a.cells) as Array<keyof typeof a.cells>) {
        expect(
          Math.abs(a.cells[key] * factor - b.cells[key]),
          `${b.effectiveFrom} ${key}`
        ).toBeLessThanOrEqual(0.5 + 1e-6);
      }
    }
  });

  it("a day is priced by the column in force on its date", () => {
    // The 2023 mid-year bump: the day before ratification is still 2022.
    expect(ratesForDate("2023-11-08").theatrical_basic.daily).toBe(1082);
    expect(ratesForDate("2023-11-09").theatrical_basic.daily).toBe(1158);
    expect(ratesForDate("2024-06-30").theatrical_basic.daily).toBe(1158);
    expect(ratesForDate("2024-07-01").theatrical_basic.daily).toBe(1204);
    // A July 1 line in an ordinary year.
    expect(ratesForDate("2021-06-30").theatrical_basic.daily).toBe(1030);
    expect(ratesForDate("2021-07-01").theatrical_basic.daily).toBe(1056);
    expect(ratesForDate("2019-03-15").theatrical_basic.daily).toBe(980);
  });

  it("low budget tiers follow the basic rate of the year", () => {
    const t = ratesForDate("2022-09-01");
    expect(t.low_budget.daily).toBe(Math.round(1082 * 0.65 * 100) / 100);
    expect(t.ultra_low_budget.daily).toBe(Math.round(1082 * 0.2 * 100) / 100);
  });

  it("before the earliest schedule the earliest applies rather than a guess", () => {
    expect(ratesForDate("2012-01-01").theatrical_basic.daily).toBe(880);
    expect(RATE_SCHEDULES[0].source).toBe("derived");
  });
});
