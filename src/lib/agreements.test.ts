import { describe, it, expect } from "vitest";
import { calculateRate } from "@/lib/rate-engine";
import { RATES } from "@/lib/rate-constants";
import type { ExhibitGInput } from "@/lib/rate-calculator/types";
import {
  AGREEMENTS,
  agreementLabel,
  agreementName,
  dayRate,
  dayRateFor,
  weeklyEquivalentDayRate,
} from "./agreements";

const day = (over: Partial<ExhibitGInput> = {}): ExhibitGInput => ({
  showName: "Show",
  workDate: "2026-08-27",
  callTime: "07:00",
  dismissOnSet: "17:30",
  dismissMakeupWardrobe: null,
  ndMealIn: null,
  ndMealOut: null,
  firstMealStart: "12:00",
  firstMealFinish: "12:30",
  secondMealStart: null,
  secondMealFinish: null,
  stuntAdjustment: 0,
  forcedCall: false,
  isSixthDay: false,
  isSeventhDay: false,
  isHoliday: false,
  workStatus: "theatrical_basic",
  characterName: "",
  notes: "",
  ...over,
});

describe("the low budget tiers", () => {
  // Each agreement is written as a percentage of "the applicable rate from
  // the Basic Agreement current at the time of performance", so the figure
  // that matters is the share, not the dollars it happens to make today.
  it.each([
    ["low_budget", 0.65],
    ["modified_low_budget", 0.35],
    ["ultra_low_budget", 0.2],
  ] as const)("%s pays %d of basic scale", (id, share) => {
    expect(RATES[id].daily).toBeCloseTo(RATES.theatrical_basic.daily * share, 2);
    expect(RATES[id].weekly).toBeCloseTo(RATES.theatrical_basic.weekly * share, 2);
    expect(RATES[id].hourly).toBeCloseTo(RATES[id].daily / 8, 6);
  });

  it("does not reduce a stunt coordinator, who is on Schedule K whatever the budget", () => {
    expect(RATES.stunt_coordinator.daily).toBeGreaterThan(
      RATES.theatrical_basic.daily
    );
  });
});

describe("the agreement list", () => {
  it("offers Theatrical and Television as one thing, since they pay the same", () => {
    expect(RATES.television.daily).toBe(RATES.theatrical_basic.daily);
    expect(AGREEMENTS.map((a) => a.id)).not.toContain("television");
    expect(agreementName("theatrical_basic")).toBe("Theatrical / Television");
  });

  it("still names a record saved as television, rather than dropping it", () => {
    expect(agreementName("television")).toBe("Theatrical / Television");
    expect(agreementLabel("television")).toContain("$1,283");
  });

  it("names every offered agreement with what it pays", () => {
    for (const agreement of AGREEMENTS) {
      const label = agreementLabel(agreement.id);
      expect(label).toContain(agreement.name);
      expect(label).toMatch(/\$[\d,]+(\.\d{2})?\/day/);
    }
  });

  it("shows cents only where a tier lands on them", () => {
    expect(dayRate(1283)).toBe("$1,283/day");
    expect(dayRate(833.95)).toBe("$833.95/day");
  });
});

describe("a flat deal", () => {
  it("takes the rate it is given over the schedule's", () => {
    expect(dayRateFor("theatrical_basic", null)).toBe(1283);
    expect(dayRateFor("theatrical_basic", 1500)).toBe(1500);
    expect(dayRateFor("ultra_low_budget", null)).toBeCloseTo(256.6, 2);
    // Zero is how the form says "no flat deal", not a rate of nothing.
    expect(dayRateFor("theatrical_basic", 0)).toBe(1283);
  });

  it("falls back to basic for a schedule that no longer exists", () => {
    expect(dayRateFor("some_old_thing", null)).toBe(1283);
  });

  it("earns no overtime, however long the day runs", () => {
    // The point of agreeing a flat number is that the day cannot cost more
    // than it. A sixteen-hour day and an eight-hour day pay the same.
    const short = calculateRate(day({ flatDayRate: 2000 }));
    const long = calculateRate(
      day({ flatDayRate: 2000, dismissOnSet: "23:00" })
    );
    expect(short.segments).toHaveLength(1);
    expect(long.segments).toHaveLength(1);
    expect(long.segments[0].label).toContain("Flat deal");
    // Wages identical; only the meal penalties the long day drew differ.
    const wages = (b: typeof short) =>
      b.grandTotal - b.penalties.totalPenalties;
    expect(wages(long)).toBe(2000);
    expect(wages(short)).toBe(2000);
  });

  it("still records how long the day actually ran", () => {
    const long = calculateRate(
      day({ flatDayRate: 2000, dismissOnSet: "23:00" })
    );
    expect(long.segments[0].hours).toBeCloseTo(long.netWorkHours, 1);
    expect(long.netWorkHours).toBeGreaterThan(10);
  });

  it("still collects meal penalties, which are not wages", () => {
    const noMeal = calculateRate(
      day({ flatDayRate: 2000, firstMealStart: null, firstMealFinish: null })
    );
    expect(noMeal.penalties.totalPenalties).toBeGreaterThan(0);
    expect(noMeal.grandTotal).toBe(2000 + noMeal.penalties.totalPenalties);
  });

  it("differs from the same rate on a schedule the moment overtime starts", () => {
    // Eight hours: a flat 1,283 and scale both pay the day rate.
    const eight = { callTime: "07:00", dismissOnSet: "15:30" };
    expect(
      calculateRate(day({ ...eight, flatDayRate: 1283 })).grandTotal
    ).toBe(calculateRate(day(eight)).grandTotal);

    // Fourteen hours: scale earns overtime, the flat deal does not.
    const long = { callTime: "07:00", dismissOnSet: "21:30" };
    const scheduled = calculateRate(day(long));
    const flat = calculateRate(day({ ...long, flatDayRate: 1283 }));
    expect(scheduled.grandTotal).toBeGreaterThan(flat.grandTotal);
    expect(scheduled.segments.length).toBeGreaterThan(1);
    expect(flat.segments).toHaveLength(1);
  });

  it("adds a stunt adjustment the performer entered on top of the flat number", () => {
    const flat = calculateRate(day({ flatDayRate: 2000, stuntAdjustment: 200 }));
    expect(flat.adjustedBaseRate).toBe(2200);
    expect(flat.grandTotal - flat.penalties.totalPenalties).toBe(2200);
  });

  it("separates a coordinator on a flat deal from one on a day rate", () => {
    // The flat deal is the higher Schedule K figure and buys the day; the
    // daily coordinator tracks the performer minimum and works overtime.
    expect(RATES.stunt_coordinator.daily).toBe(1996);
    expect(RATES.stunt_coordinator_daily.daily).toBe(
      RATES.theatrical_basic.daily
    );
    const long = { callTime: "07:00", dismissOnSet: "21:30" };
    const daily = calculateRate(
      day({ ...long, workStatus: "stunt_coordinator_daily" })
    );
    expect(daily.segments.length).toBeGreaterThan(1);
  });

  it("leaves the day on its schedule when no flat rate is given", () => {
    for (const flatDayRate of [null, undefined, 0]) {
      expect(calculateRate(day({ flatDayRate })).baseRate).toBe(1283);
    }
  });

  it("works out a low budget day on the low budget rate", () => {
    const ulb = calculateRate(day({ workStatus: "ultra_low_budget" }));
    expect(ulb.baseRate).toBeCloseTo(256.6, 2);
    expect(ulb.grandTotal).toBeLessThan(calculateRate(day()).grandTotal);
  });
});

describe("a day inside a weekly contract", () => {
  const wages = (b: ReturnType<typeof calculateRate>) =>
    b.grandTotal - b.penalties.totalPenalties;

  it("spreads the weekly scale over five days, so five straight days sum back to it", () => {
    expect(weeklyEquivalentDayRate("theatrical_basic")).toBeCloseTo(957.0, 2);
    expect(weeklyEquivalentDayRate("theatrical_basic") * 5).toBeCloseTo(
      RATES.theatrical_basic.weekly,
      2
    );
    // The tiers follow their own weeklies, coordinators Schedule K's.
    expect(weeklyEquivalentDayRate("low_budget")).toBeCloseTo(622.05, 2);
    expect(weeklyEquivalentDayRate("stunt_coordinator")).toBeCloseTo(1487.8, 2);
    expect(weeklyEquivalentDayRate("nonsense")).toBeCloseTo(957.0, 2);
  });

  it("takes the override as the base rate and still earns overtime, unlike a flat deal", () => {
    const rate = weeklyEquivalentDayRate("theatrical_basic");
    const eight = calculateRate(
      day({ dismissOnSet: "15:30", dayRateOverride: rate })
    );
    expect(eight.baseRate).toBeCloseTo(957.0, 2);
    expect(wages(eight)).toBeCloseTo(957.0, 2);

    // Ten hours: two of them at time-and-a-half of the equivalent hourly.
    const ten = calculateRate(day({ dayRateOverride: rate }));
    expect(ten.segments.length).toBeGreaterThan(1);
    expect(wages(ten)).toBeCloseTo(957 + 2 * 1.5 * (957 / 8), 1);
  });

  it("loses to a flat deal, which is the whole deal", () => {
    const both = calculateRate(
      day({ dayRateOverride: 957, flatDayRate: 2000, dismissOnSet: "23:00" })
    );
    expect(both.segments).toHaveLength(1);
    expect(wages(both)).toBe(2000);
  });

  it("changes nothing when absent, zero or null", () => {
    for (const dayRateOverride of [null, undefined, 0]) {
      expect(calculateRate(day({ dayRateOverride })).baseRate).toBe(1283);
    }
  });
});
