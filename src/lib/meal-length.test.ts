import { describe, it, expect } from "vitest";
import { checkMealLength, clampMealFinish, mealLengthWarning, secondMealOrderWarning } from "./meal-length";

describe("meal length", () => {
  it("accepts the half hour and the hour, the two ends of the rule", () => {
    expect(checkMealLength("12:00", "12:30")?.ok).toBe(true);
    expect(checkMealLength("12:00", "13:00")?.ok).toBe(true);
  });

  it("flags a meal shorter than half an hour", () => {
    const check = checkMealLength("12:00", "12:25");
    expect(check?.problem).toBe("short");
    expect(mealLengthWarning("12:00", "12:25")).toContain("25 minutes");
  });

  it("flags a meal longer than an hour", () => {
    expect(checkMealLength("12:00", "13:01")?.problem).toBe("long");
    expect(mealLengthWarning("12:00", "13:30")).toContain("1h 30m");
  });

  it("reads a pair almost a day apart as swapped, not as a long meal", () => {
    // In 2:30 PM, Out 2:05 PM — entered crossed, not a 23-hour lunch.
    expect(checkMealLength("14:30", "14:05")?.problem).toBe("crossed");
    expect(mealLengthWarning("14:30", "14:05")).toContain("swapped");
  });

  it("still allows a real meal across midnight on a night shoot", () => {
    const check = checkMealLength("23:45", "00:15");
    expect(check?.ok).toBe(true);
    expect(check?.minutes).toBe(30);
  });

  it("says nothing while a time is missing", () => {
    expect(checkMealLength("12:00", null)).toBeNull();
    expect(checkMealLength(null, "12:30")).toBeNull();
    expect(mealLengthWarning("", "")).toBeNull();
  });
});

describe("the meals happen in order", () => {
  it("says nothing when the 2nd meal follows the 1st", () => {
    expect(secondMealOrderWarning("12:30", "18:30")).toBeNull();
    // A night shoot's 2nd meal after midnight still follows.
    expect(secondMealOrderWarning("22:30", "01:00")).toBeNull();
  });

  it("warns when the 2nd meal was typed before the 1st", () => {
    expect(secondMealOrderWarning("12:30", "09:24")).toContain("before the 1st");
  });

  it("says nothing while a time is missing", () => {
    expect(secondMealOrderWarning(null, "09:24")).toBeNull();
    expect(secondMealOrderWarning("12:30", null)).toBeNull();
  });
});

describe("the lunch band is enforced, not just warned about", () => {
  it("lets a legal meal through untouched", () => {
    expect(clampMealFinish("12:00", "12:30")).toBe("12:30");
    expect(clampMealFinish("12:00", "13:00")).toBe("13:00");
    expect(clampMealFinish("23:45", "00:15")).toBe("00:15");
  });

  it("snaps a short meal to the half hour", () => {
    expect(clampMealFinish("12:00", "12:10")).toBe("12:30");
  });

  it("snaps a long meal to the hour", () => {
    // In 10:27, Out picked at 11:57 — an hour and a half becomes the hour.
    expect(clampMealFinish("10:27", "11:57")).toBe("11:27");
  });

  it("leaves a crossed pair for the swapped warning", () => {
    expect(clampMealFinish("14:30", "14:05")).toBe("14:05");
  });

  it("passes through while a time is missing", () => {
    expect(clampMealFinish(null, "12:10")).toBe("12:10");
    expect(clampMealFinish("12:00", null)).toBeNull();
  });
});
