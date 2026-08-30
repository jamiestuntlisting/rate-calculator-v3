import { describe, it, expect } from "vitest";
import { recalculateDay, type RecalculableDay } from "./day-recalc";
import { weeklyEquivalentDayRate } from "./agreements";

/** A plain 12.2-hour theatrical day inside the 07/01/26 schedule year. */
const baseDay: RecalculableDay = {
  showName: "Test",
  workDate: "2026-08-14",
  callTime: "06:00",
  dismissOnSet: "17:42",
  dismissMakeupWardrobe: null,
  ndMealIn: null,
  ndMealOut: null,
  firstMealStart: "12:00",
  firstMealFinish: "12:30",
  secondMealStart: null,
  secondMealFinish: null,
  stuntAdjustment: 0,
  flatDayRate: null,
  threeDayLength: null,
  contractLength: null,
  contracts: 1,
  multipleEpisodeWeekly: false,
  forcedCall: false,
  isSixthDay: false,
  isSeventhDay: false,
  isHoliday: false,
  workStatus: "theatrical_basic",
  characterName: "",
  notes: "",
};

describe("recalculateDay — the day's working follows its contract length", () => {
  it("an unset day prices at the daily scale", () => {
    const result = recalculateDay(baseDay)!;
    expect(result.calculation.adjustedHourlyRate).toBe(160.375);
  });

  it("a weekly day reprices at the weekly scale over five days", () => {
    const result = recalculateDay({ ...baseDay, contractLength: "weekly" })!;
    // 4,785 / 5 = 957 a day, 119.625 an hour.
    expect(result.calculation.baseRate).toBe(
      weeklyEquivalentDayRate("theatrical_basic", "2026-08-14")
    );
    expect(result.calculation.adjustedHourlyRate).toBe(119.625);
    expect(result.expectedAmount).toBe(result.calculation.grandTotal);
  });

  it("extra contracts stay on top — dropping them loses a day's pay", () => {
    const result = recalculateDay({ ...baseDay, contracts: 2 })!;
    expect(result.expectedAmount).toBe(
      Math.round((result.calculation.grandTotal + 1283) * 100) / 100
    );
  });

  it("leaves alone what it cannot honestly compute", () => {
    expect(recalculateDay({ ...baseDay, callTime: null })).toBeNull();
    expect(
      recalculateDay({ ...baseDay, workStatus: "stunt_coordinator" })
    ).toBeNull();
    expect(
      recalculateDay({ ...baseDay, workStatus: "commercial", flatDayRate: null })
    ).toBeNull();
  });
});
