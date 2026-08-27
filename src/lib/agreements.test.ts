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

  it("pays exactly what the schedule would, given the schedule's own rate", () => {
    // The strongest thing to assert: the override changes the rate and
    // nothing else about how the day is worked out.
    const scheduled = calculateRate(day());
    const flat = calculateRate(
      day({ flatDayRate: RATES.theatrical_basic.daily })
    );
    expect(flat.grandTotal).toBe(scheduled.grandTotal);
    expect(flat.segments).toEqual(scheduled.segments);
  });

  it("carries overtime and the stunt adjustment on the flat rate", () => {
    const long = day({ dismissOnSet: "21:30", stuntAdjustment: 200 });
    const scheduled = calculateRate(long);
    const flat = calculateRate({ ...long, flatDayRate: 2000 });

    expect(flat.baseRate).toBe(2000);
    expect(flat.hourlyRate).toBe(250);
    expect(flat.adjustedBaseRate).toBe(2200); // the adjustment still applies
    expect(flat.grandTotal).toBeGreaterThan(scheduled.grandTotal);
    // Overtime was reached on both, and on the same hours.
    expect(flat.segments.length).toBe(scheduled.segments.length);
    expect(flat.segments.map((s) => s.hours)).toEqual(
      scheduled.segments.map((s) => s.hours)
    );
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
