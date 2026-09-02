import { describe, expect, it } from "vitest";
import { calculateRate } from "@/lib/rate-engine";
import { ratesForDate } from "@/lib/rate-constants";
import {
  commonPayments,
  reverseDaily,
  searchedRates,
  REVERSE_DEFAULTS,
} from "@/lib/reverse-daily";

/**
 * The reverse calculator must find the day it was pointed at: price a
 * known shape with the real engine, hand the total back, and the shape
 * has to come out of the search. Nothing here asserts a dollar figure —
 * the engine owns those — only that the search is a faithful inverse.
 */

/** A fixed "today" so the rates searched do not move under the tests. */
const TODAY = "2026-09-02";
const STATUS = "theatrical_basic";

function priced(
  span: number,
  adjustment: number,
  opts: { workDate?: string; lunchLate?: number; secondMeal?: boolean } = {}
) {
  const after = (hours: number) => {
    const total = 6 * 60 + Math.round(hours * 60);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  const late = opts.lunchLate ?? 0;
  return calculateRate({
    showName: "",
    workDate: opts.workDate ?? "2026-07-01",
    callTime: REVERSE_DEFAULTS.callTime,
    dismissOnSet: after(span),
    dismissMakeupWardrobe: null,
    ndMealIn: null,
    ndMealOut: null,
    firstMealStart: after(6 + late),
    firstMealFinish: after(6.5 + late),
    secondMealStart: opts.secondMeal ? after(12.5 + late) : null,
    secondMealFinish: opts.secondMeal ? after(13 + late) : null,
    stuntAdjustment: adjustment,
    flatDayRate: null,
    forcedCall: false,
    isSixthDay: false,
    isSeventhDay: false,
    isHoliday: false,
    workStatus: STATUS,
    characterName: "",
    notes: "",
  });
}

describe("searchedRates", () => {
  it("runs every schedule in force within the last two years, newest first", () => {
    const rates = searchedRates(STATUS, TODAY);
    expect(rates.map((r) => r.effectiveFrom)).toEqual([
      "2026-07-01",
      "2025-07-01",
      "2024-07-01",
    ]);
    expect(rates[0].daily).toBe(ratesForDate("2026-07-01").theatrical_basic.daily);
    expect(rates[2].daily).toBe(1204);
  });

  it("carries the agreement's own rate, not the day performer's", () => {
    const rates = searchedRates("stunt_coordinator_daily", TODAY);
    expect(rates[0].daily).toBe(ratesForDate("2026-07-01").stunt_coordinator_daily.daily);
  });
});

describe("reverseDaily", () => {
  it("finds the exact day a total came from, and names its rate", () => {
    // 11.2h span, $200 adjustment — a plausible long day.
    const seeded = priced(11.2, 200);
    const result = reverseDaily(seeded.grandTotal, STATUS, { today: TODAY });

    const match = result.exact.find(
      (c) =>
        c.adjustment === 200 &&
        Math.abs(c.spanHours - 11.2) < 0.001 &&
        c.rateDate === "2026-07-01"
    );
    expect(match).toBeDefined();
    expect(match!.total).toBeCloseTo(seeded.grandTotal, 2);
    expect(match!.baseDaily).toBe(1283);
  });

  it("a check at last year's rate is matched on last year's schedule", () => {
    const seeded = priced(11.2, 200, { workDate: "2025-08-15" });
    const result = reverseDaily(seeded.grandTotal, STATUS, { today: TODAY });
    const match = result.exact.find(
      (c) => c.adjustment === 200 && Math.abs(c.spanHours - 11.2) < 0.001
    );
    expect(match).toBeDefined();
    expect(match!.rateDate).toBe("2025-07-01");
    expect(match!.baseDaily).toBe(1246);
  });

  it("a late lunch is a shape: the penalty is part of the match", () => {
    // Lunch an hour late — $25 + $35 — on a 12.5h day, no adjustment.
    const seeded = priced(12.5, 0, { lunchLate: 1 });
    expect(seeded.penalties.totalPenalties).toBeGreaterThan(0);
    const result = reverseDaily(seeded.grandTotal, STATUS, { today: TODAY });
    const match = result.exact.find(
      (c) => c.lunchLateHours === 1 && c.adjustment === 0 && c.rateDate === "2026-07-01"
    );
    expect(match).toBeDefined();
    expect(match!.penalties).toBeCloseTo(seeded.penalties.totalPenalties, 2);
    expect(match!.lunchStart).toBe("13:00");
  });

  it("a day with a second meal is a shape too", () => {
    const seeded = priced(14.5, 100, { secondMeal: true });
    const result = reverseDaily(seeded.grandTotal, STATUS, { today: TODAY });
    const match = result.exact.find(
      (c) => c.secondMeal && c.adjustment === 100 && Math.abs(c.spanHours - 14.5) < 0.001
    );
    expect(match).toBeDefined();
    expect(match!.secondMealStart).toBe("18:30");
  });

  it("an adjustment feeds the overtime rate, so candidates re-run the engine", () => {
    // The same day $100 richer in adjustment pays MORE than $100 more on
    // a day with overtime — pinning that the search cannot shortcut by
    // adding adjustments after the fact.
    const base = priced(11.2, 100);
    const richer = priced(11.2, 200);
    expect(richer.grandTotal - base.grandTotal).toBeGreaterThan(100);
  });

  it("names the obvious shapes with their engine totals at the current rate", () => {
    const result = reverseDaily(5000, STATUS, { today: TODAY });
    expect(result.obvious.length).toBeGreaterThanOrEqual(3);
    const plain = result.obvious[0];
    const plainEngine = priced(8.5, 0).grandTotal;
    expect(plain.total).toBeCloseTo(plainEngine, 2);
    expect(plain.diff).toBeCloseTo(plain.total - 5000, 2);
  });

  it("near misses come back closest first, with a signed difference, however far", () => {
    const seeded = priced(11.2, 200);
    // $37 short of the real day: no exact match, the real shape nearby.
    const result = reverseDaily(seeded.grandTotal - 37, STATUS, { today: TODAY });
    expect(result.close.length).toBeGreaterThan(0);
    const gaps = result.close.map((c) => Math.abs(c.diff));
    expect([...gaps].sort((a, b) => a - b)).toEqual(gaps);
    // A figure far from any normal day still gets its closest shapes.
    const far = reverseDaily(50, STATUS, { today: TODAY });
    expect(far.exact).toEqual([]);
    expect(far.close.length).toBeGreaterThan(0);
  });

  it("short days share the guarantee minimum but tell one story each per rate", () => {
    // Every span under 8 worked hours pays the same minimum, so exact
    // matches are deduped down to distinct stories, not one per span.
    const minimum = priced(8.5, 0).grandTotal;
    const result = reverseDaily(minimum, STATUS, { today: TODAY });
    const zeroAdj = result.exact.filter(
      (c) =>
        c.adjustment === 0 && c.penalties === 0 && !c.secondMeal && c.rateDate === "2026-07-01"
    );
    expect(zeroAdj.length).toBe(1);
  });
});

describe("commonPayments", () => {
  it("is the engine's own grid of whole-hour days, and points at the nearest cell", () => {
    const [rate] = searchedRates(STATUS, TODAY);
    const twelve = priced(12.5, 100).grandTotal;
    const grid = commonPayments(rate, STATUS, twelve + 3);
    expect(grid.rows.map((r) => r.workedHours)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const row12 = grid.rows.find((r) => r.workedHours === 12)!;
    expect(row12.totals[grid.adjustments.indexOf(100)]).toBeCloseTo(twelve, 2);
    expect(grid.nearest).toEqual({ workedHours: 12, adjustment: 100, total: row12.totals[1] });
    // Past twelve hours the day took its second meal, so no penalties.
    const fourteen = priced(15, 0, { secondMeal: true }).grandTotal;
    const row14 = grid.rows.find((r) => r.workedHours === 14)!;
    expect(row14.totals[0]).toBeCloseTo(fourteen, 2);
  });
});
