import { describe, it, expect } from "vitest";
import { calculateRate } from "./rate-engine";
import type { ExhibitGInput } from "./types";

const baseInput: ExhibitGInput = {
  showName: "Test",
  workDate: "2026-04-22",
  callTime: "06:00",
  dismissOnSet: "14:00",
  dismissMakeupWardrobe: null,
  ndMealIn: null,
  ndMealOut: null,
  firstMealStart: "11:00",
  firstMealFinish: "11:30",
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
};

describe("calculateRate — daily minimum guarantee", () => {
  it("8-hour theatrical day with 30 min meal pays full $1,246 day rate", () => {
    const result = calculateRate(baseInput);
    expect(result.grandTotal).toBe(1283);
    expect(result.dayMultiplier.applied).toBe(false);
    expect(result.penalties.totalPenalties).toBe(0);
  });

  it("stunt coordinator 8-hour day pays full $1,938 day rate", () => {
    const result = calculateRate({ ...baseInput, workStatus: "stunt_coordinator" });
    expect(result.baseRate).toBe(1996);
    expect(result.hourlyRate).toBe(249.5);
    expect(result.grandTotal).toBe(1996);
  });
});

describe("calculateRate — overtime tiers", () => {
  it("10-hour day: 8h straight + 2h time-and-a-half = $1,713.25", () => {
    const result = calculateRate({
      ...baseInput,
      dismissOnSet: "17:00",
      firstMealStart: "12:00",
      firstMealFinish: "13:00",
    });
    expect(result.netWorkHours).toBe(10);
    // 8 × 160.375 + 2 × 160.375 × 1.5 = 1283 + 467.25
    expect(result.grandTotal).toBe(1764.13);
    expect(result.segments).toHaveLength(2);
  });

  it("12-hour day: straight + 1.5x + 2x golden = $2,336.25", () => {
    const result = calculateRate({
      ...baseInput,
      dismissOnSet: "19:00",
      firstMealStart: "12:00",
      firstMealFinish: "13:00",
    });
    expect(result.netWorkHours).toBe(12);
    // 1283 + 467.25 + (2 × 160.375 × 2) = 1283 + 467.25 + 623
    expect(result.grandTotal).toBe(2405.63);
    expect(result.segments).toHaveLength(3);
  });
});

describe("calculateRate — day multipliers", () => {
  it("6th day applies 1.5x — 8 hr day pays $1,869", () => {
    const result = calculateRate({ ...baseInput, isSixthDay: true });
    expect(result.dayMultiplier.type).toBe("6th_day");
    expect(result.dayMultiplier.multiplier).toBe(1.5);
    expect(result.grandTotal).toBe(1924.5);
  });

  it("7th day applies 2x — 8 hr day pays $2,492", () => {
    const result = calculateRate({ ...baseInput, isSeventhDay: true });
    expect(result.dayMultiplier.type).toBe("7th_day");
    expect(result.grandTotal).toBe(2566);
  });

  it("holiday applies 2x — 8 hr day pays $2,492", () => {
    const result = calculateRate({ ...baseInput, isHoliday: true });
    expect(result.dayMultiplier.type).toBe("holiday");
    expect(result.grandTotal).toBe(2566);
  });

  it("holiday takes precedence over 7th and 6th day flags", () => {
    const result = calculateRate({
      ...baseInput,
      isHoliday: true,
      isSeventhDay: true,
      isSixthDay: true,
    });
    expect(result.dayMultiplier.type).toBe("holiday");
  });
});

describe("calculateRate — meal penalties", () => {
  it("first meal exactly at 6-hour mark is on time", () => {
    const result = calculateRate({
      ...baseInput,
      firstMealStart: "12:00",
      firstMealFinish: "12:30",
      dismissOnSet: "14:30",
    });
    expect(result.penalties.mealPenalties).toHaveLength(0);
  });

  it("first meal 31 min late: $25 + $35 = $60 across 2 periods", () => {
    const result = calculateRate({
      ...baseInput,
      firstMealStart: "12:31",
      firstMealFinish: "13:01",
      dismissOnSet: "15:01",
    });
    const total = result.penalties.mealPenalties.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(60);
    expect(result.penalties.mealPenalties).toHaveLength(2);
  });

  it("first meal 90 min late: $25 + $35 + $50 = $110 across 3 periods", () => {
    const result = calculateRate({
      ...baseInput,
      firstMealStart: "13:30",
      firstMealFinish: "14:00",
      dismissOnSet: "16:00",
    });
    const total = result.penalties.mealPenalties.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(110);
  });

  it("ND meal resets the 1st-meal clock", () => {
    // call 06:00, ND 06:30→07:30, first meal at 13:30 (6 hr from ND end → on time)
    const result = calculateRate({
      ...baseInput,
      ndMealIn: "06:30",
      ndMealOut: "07:30",
      firstMealStart: "13:30",
      firstMealFinish: "14:00",
      dismissOnSet: "16:00",
    });
    expect(result.penalties.mealPenalties).toHaveLength(0);
  });

  it("rejects ND meal that ends >2 hours after call", () => {
    expect(() =>
      calculateRate({
        ...baseInput,
        ndMealIn: "06:30",
        ndMealOut: "08:30", // 2.5 hours after call
      })
    ).toThrow(/ND meal must end within 2 hours/);
  });
});

describe("calculateRate — forced call penalty", () => {
  it("regular forced call adds $900 (capped at lesser of base rate or $900)", () => {
    const result = calculateRate({ ...baseInput, forcedCall: true });
    expect(result.penalties.forcedCallPenalty).toBe(900);
    // 1283 (daily min) + 900 forced call
    expect(result.grandTotal).toBe(2183);
  });

  it("stunt coordinator forced call still capped at $900", () => {
    const result = calculateRate({
      ...baseInput,
      workStatus: "stunt_coordinator",
      forcedCall: true,
    });
    expect(result.penalties.forcedCallPenalty).toBe(900);
  });
});

describe("calculateRate — high stunt adjustment", () => {
  it("stunt adj > base rate: 12 hrs straight, no 1.5x tier, 2x at 13+", () => {
    // adjusted base = 1283 + 2000 = 3246, hourly = 405.75
    // 10 hrs all at straight time = 10 × 405.75 = 4103.750
    const result = calculateRate({
      ...baseInput,
      dismissOnSet: "17:00",
      firstMealStart: "12:00",
      firstMealFinish: "13:00",
      stuntAdjustment: 2000,
    });
    expect(result.adjustedBaseRate).toBe(3283);
    expect(result.netWorkHours).toBe(10);
    expect(result.grandTotal).toBe(4103.75);
    expect(result.segments).toHaveLength(1);
  });

  it("stunt adj <= base rate uses normal OT tiers", () => {
    // stunt adj = base rate exactly → highStunt is FALSE (strict >)
    // adjusted = 1283 + 1283 = 2566, hourly = 320.75
    // 10 hrs: 8 × 320.75 + 2 × 320.75 × 1.5 = 2566 + 962.25 = 3528.25
    const result = calculateRate({
      ...baseInput,
      dismissOnSet: "17:00",
      firstMealStart: "12:00",
      firstMealFinish: "13:00",
      stuntAdjustment: 1283,
    });
    expect(result.grandTotal).toBe(3528.25);
    expect(result.segments).toHaveLength(2);
  });
});

describe("calculateRate — overnight wrap", () => {
  it("call before midnight, dismiss after midnight computes correct elapsed", () => {
    // 18:00 to 02:30 next day = 8.5 hr elapsed; 30 min meal → 8 hr net
    const result = calculateRate({
      ...baseInput,
      callTime: "18:00",
      firstMealStart: "23:00",
      firstMealFinish: "23:30",
      dismissOnSet: "02:30",
    });
    expect(result.totalWorkHours).toBe(8.5);
    expect(result.netWorkHours).toBe(8);
    expect(result.penalties.mealPenalties).toHaveLength(0);
  });
});

describe("calculateRate — counter mode (skipRounding)", () => {
  it("skipRounding produces non-rounded fractional hours", () => {
    const a = calculateRate(baseInput);
    const b = calculateRate(baseInput, { skipRounding: true });
    // Same inputs but skipRounding doesn't round netWorkHours up to tenths
    expect(b.netWorkHours).toBeCloseTo(7.5, 5);
    expect(a.netWorkHours).toBe(7.5);
  });

  it("additionalSeconds extends elapsed time", () => {
    const result = calculateRate(baseInput, {
      skipRounding: true,
      additionalSeconds: 60,
    });
    // 30 min meal subtracted from (8h + 1 min) elapsed = 7h 31m net
    expect(result.netWorkHours).toBeCloseTo(7.5 + 1 / 60, 4);
  });
});
