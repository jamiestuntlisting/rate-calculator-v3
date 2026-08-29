import { describe, it, expect } from "vitest";
import { checkMealLength, mealLengthWarning } from "./meal-length";

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
