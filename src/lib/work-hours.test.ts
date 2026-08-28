import { describe, it, expect } from "vitest";
import { effectiveHourlyRate, workHoursFor } from "./work-hours";

describe("hours from the times alone", () => {
  it("takes the meal out of the day", () => {
    const hours = workHoursFor({
      callTime: "07:00",
      firstMealStart: "13:00",
      firstMealFinish: "14:00",
      dismissOnSet: "19:00",
    });
    expect(hours).toEqual({
      elapsedHours: 12,
      mealHours: 1,
      netHours: 11,
      endedAt: "19:00",
    });
  });

  it("counts a day that runs past midnight", () => {
    const hours = workHoursFor({ callTime: "18:00", dismissOnSet: "02:00" });
    expect(hours?.elapsedHours).toBe(8);
    expect(hours?.netHours).toBe(8);
  });

  it("ends at the wrap when there is one, and the wrap can be after dismissal", () => {
    const hours = workHoursFor({
      callTime: "07:00",
      dismissOnSet: "19:00",
      dismissMakeupWardrobe: "19:30",
    });
    expect(hours?.endedAt).toBe("19:30");
    expect(hours?.elapsedHours).toBe(12.5);
  });

  it("uses whichever end was entered when only one was", () => {
    expect(workHoursFor({ callTime: "07:00", dismissMakeupWardrobe: "15:00" })?.netHours).toBe(8);
    expect(workHoursFor({ callTime: "07:00", dismissOnSet: "15:00" })?.netHours).toBe(8);
  });

  it("adds both meals up", () => {
    const hours = workHoursFor({
      callTime: "06:00",
      firstMealStart: "12:00",
      firstMealFinish: "12:30",
      secondMealStart: "18:00",
      secondMealFinish: "18:30",
      dismissOnSet: "22:00",
    });
    expect(hours?.mealHours).toBe(1);
    expect(hours?.netHours).toBe(15);
  });

  it("says nothing rather than guessing at a day only half entered", () => {
    expect(workHoursFor({ callTime: "07:00" })).toBeNull();
    expect(workHoursFor({ dismissOnSet: "19:00" })).toBeNull();
    expect(workHoursFor({})).toBeNull();
    expect(workHoursFor({ callTime: "nonsense", dismissOnSet: "19:00" })).toBeNull();
  });

  it("never reports negative hours when a time is wrong", () => {
    // A meal longer than the day: one of these is a typo, but the day is
    // still not a negative length.
    const hours = workHoursFor({
      callTime: "07:00",
      firstMealStart: "08:00",
      firstMealFinish: "20:00",
      dismissOnSet: "12:00",
    });
    expect(hours?.netHours).toBe(0);
  });
});

describe("what a flat fee came to per hour", () => {
  it("divides the fee by the hours worked", () => {
    expect(effectiveHourlyRate(1200, 12)).toBe(100);
    expect(effectiveHourlyRate(1000, 11)).toBe(90.91);
  });

  it("says nothing when either half is missing", () => {
    for (const amount of [0, null, undefined, -50]) {
      expect(effectiveHourlyRate(amount, 10)).toBeNull();
    }
    for (const hours of [0, null, undefined]) {
      expect(effectiveHourlyRate(1000, hours)).toBeNull();
    }
  });
});
