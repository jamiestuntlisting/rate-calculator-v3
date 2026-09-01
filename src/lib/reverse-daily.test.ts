import { describe, expect, it } from "vitest";
import { calculateRate } from "@/lib/rate-engine";
import { reverseDaily, REVERSE_DEFAULTS } from "@/lib/reverse-daily";

/**
 * The reverse calculator must find the day it was pointed at: price a
 * known shape with the real engine, hand the total back, and the shape
 * has to come out of the search. Nothing here asserts a dollar figure —
 * the engine owns those — only that the search is a faithful inverse.
 */

const WORK_DATE = "2026-08-20";
const STATUS = "theatrical_basic";

function priced(span: number, adjustment: number) {
  const dismiss = (() => {
    const total = 6 * 60 + Math.round(span * 60);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  })();
  return calculateRate({
    showName: "",
    workDate: WORK_DATE,
    callTime: REVERSE_DEFAULTS.callTime,
    dismissOnSet: dismiss,
    dismissMakeupWardrobe: null,
    ndMealIn: null,
    ndMealOut: null,
    firstMealStart: REVERSE_DEFAULTS.firstMealStart,
    firstMealFinish: REVERSE_DEFAULTS.firstMealFinish,
    secondMealStart: null,
    secondMealFinish: null,
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

describe("reverseDaily", () => {
  it("finds the exact day a total came from", () => {
    // 11.2h span, $200 adjustment — a plausible long day.
    const seeded = priced(11.2, 200);
    const result = reverseDaily(seeded.grandTotal, WORK_DATE, STATUS);

    const match = result.exact.find(
      (c) => c.adjustment === 200 && Math.abs(c.spanHours - 11.2) < 0.001
    );
    expect(match).toBeDefined();
    expect(match!.total).toBeCloseTo(seeded.grandTotal, 2);
  });

  it("an adjustment feeds the overtime rate, so candidates re-run the engine", () => {
    // The same day $100 richer in adjustment pays MORE than $100 more on
    // a day with overtime — pinning that the search cannot shortcut by
    // adding adjustments after the fact.
    const base = priced(11.2, 100);
    const richer = priced(11.2, 200);
    expect(richer.grandTotal - base.grandTotal).toBeGreaterThan(100);
  });

  it("names the obvious shapes with their engine totals", () => {
    const result = reverseDaily(5000, WORK_DATE, STATUS);
    expect(result.obvious.length).toBeGreaterThanOrEqual(3);
    const plain = result.obvious[0];
    const plainEngine = priced(8.5, 0).grandTotal;
    expect(plain.total).toBeCloseTo(plainEngine, 2);
    expect(plain.diff).toBeCloseTo(plain.total - 5000, 2);
  });

  it("near misses come back closest first and carry a signed difference", () => {
    const seeded = priced(11.2, 200);
    // $37 short of the real day: no exact match, the real shape nearby.
    const result = reverseDaily(seeded.grandTotal - 37, WORK_DATE, STATUS);
    expect(result.close.length).toBeGreaterThan(0);
    const gaps = result.close.map((c) => Math.abs(c.diff));
    expect([...gaps].sort((a, b) => a - b)).toEqual(gaps);
  });

  it("short days share the guarantee minimum but tell one story each", () => {
    // Every span under 8 worked hours pays the same minimum, so exact
    // matches are deduped down to distinct stories, not one per span.
    const minimum = priced(8.5, 0).grandTotal;
    const result = reverseDaily(minimum, WORK_DATE, STATUS);
    const zeroAdj = result.exact.filter(
      (c) => c.adjustment === 0 && c.penalties === 0 && !c.secondMeal
    );
    expect(zeroAdj.length).toBe(1);
  });
});
