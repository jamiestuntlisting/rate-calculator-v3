import { describe, it, expect } from "vitest";
import {
  addMinutes,
  MEAL_MINUTES,
  STEP_SECONDS,
  toDisplay,
  toFieldValue,
} from "./time-select";

describe("toDisplay", () => {
  it.each([
    ["09:38", "9:38 AM"],
    ["21:38", "9:38 PM"],
    ["00:00", "12:00 AM"],
    ["00:30", "12:30 AM"],
    ["12:00", "12:00 PM"],
    ["23:59", "11:59 PM"],
  ])("%s reads as %s", (input, expected) => {
    expect(toDisplay(input)).toBe(expected);
  });

  it("comes back empty rather than guessing at nonsense", () => {
    for (const input of ["", "nonsense", "25:00", "10:75", "9"]) {
      expect(toDisplay(input)).toBe("");
    }
  });
});

describe("toFieldValue — what a native time input will accept", () => {
  it("pads an hour a saved or transcribed record left bare", () => {
    // A native field shows nothing at all for "9:30", losing the time.
    expect(toFieldValue("9:30")).toBe("09:30");
    expect(toFieldValue("0:05")).toBe("00:05");
  });

  it("leaves a time that is already padded alone", () => {
    expect(toFieldValue("09:30")).toBe("09:30");
    expect(toFieldValue("21:38")).toBe("21:38");
  });

  it("empties anything that is not a time, rather than passing it through", () => {
    for (const input of ["", "nonsense", "25:00", "10:75"]) {
      expect(toFieldValue(input)).toBe("");
    }
  });

  it("round-trips through the display form", () => {
    for (const value of ["00:00", "09:38", "12:00", "21:38", "23:59"]) {
      expect(toFieldValue(value)).toBe(value);
      expect(toDisplay(value)).not.toBe("");
    }
  });
});

describe("addMinutes", () => {
  it.each([
    ["15:00", 30, "15:30"],
    ["23:45", 30, "00:15"],
    ["09:38", 30, "10:08"],
    ["00:00", 30, "00:30"],
  ])("%s + %i minutes is %s", (time, minutes, expected) => {
    expect(addMinutes(time, minutes)).toBe(expected);
  });

  it("returns empty for a time it cannot read", () => {
    expect(addMinutes("", 30)).toBe("");
    expect(addMinutes("nonsense", 30)).toBe("");
  });
});

describe("the constants the form leans on", () => {
  it("offers a meal back at half an hour", () => {
    expect(MEAL_MINUTES).toBe(30);
  });

  it("steps in tenths of an hour where the browser allows it", () => {
    expect(STEP_SECONDS).toBe(6 * 60);
  });
});
