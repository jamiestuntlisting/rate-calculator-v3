import { describe, it, expect } from "vitest";
import { checkNdMeal, ND_MEAL_WINDOW_HOURS } from "./nd-meal";

const check = (call: string, inTime: string | null, outTime: string | null) =>
  checkNdMeal(call, inTime, outTime);

describe("an ND meal has to sit in the two hours after call", () => {
  it("is two hours", () => {
    expect(ND_MEAL_WINDOW_HOURS).toBe(2);
  });

  it.each([
    ["starting on the call itself", "11:00", "11:00", "11:30"],
    ["an hour in", "11:00", "12:00", "12:30"],
    ["finishing exactly on the two hours", "11:00", "12:30", "13:00"],
    ["starting exactly on the two hours", "11:00", "13:00", "13:00"],
  ])("allows one %s", (_why, call, inTime, outTime) => {
    expect(check(call, inTime, outTime).ok).toBe(true);
  });

  it("allows one that crosses midnight after a late call", () => {
    // 23:00 call, meal 00:00–00:30 — an hour later, not twenty-three.
    expect(check("23:00", "00:00", "00:30").ok).toBe(true);
  });

  it.each([
    ["finishing past the window", "11:00", "12:45", "13:30"],
    ["starting past the window", "11:00", "14:00", "14:30"],
  ])("rejects one %s", (_why, call, inTime, outTime) => {
    const result = check(call, inTime, outTime);
    expect(result.ok).toBe(false);
    expect(result.problem).toBe("outside_window");
  });

  it("names a meal before the call as exactly that", () => {
    expect(check("11:00", "09:00", "09:30").problem).toBe(
      "starts_before_call"
    );
    // Six minutes before a 5:54 call: the Out lands after call, so the
    // forward reading used to call this "ends before it starts".
    expect(check("05:54", "05:48", "06:03").problem).toBe(
      "starts_before_call"
    );
  });

  it("rejects one that ends before it starts", () => {
    const result = check("11:00", "12:30", "12:00");
    expect(result.ok).toBe(false);
    expect(result.problem).toBe("ends_before_it_starts");
  });

  it("names the end of the window so the message can say it", () => {
    expect(check("11:00", null, null).windowEnd).toBe("13:00");
    // Past midnight, and still the right clock time.
    expect(check("23:00", null, null).windowEnd).toBe("01:00");
  });

  it("says nothing until there is a call and both ends of the meal", () => {
    expect(check("11:00", null, null).ok).toBe(true);
    expect(check("11:00", "12:00", null).ok).toBe(true);
    expect(check("", "12:00", "12:30").ok).toBe(true);
  });
});
