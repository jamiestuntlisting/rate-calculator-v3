import { describe, it, expect } from "vitest";
import {
  addMinutes,
  MEAL_MINUTES,
  MINUTE_OPTIONS,
  parseTime,
  toDisplay,
} from "./time-select";

describe("parseTime — what people actually type", () => {
  it.each([
    ["9:38 PM", "21:38"],
    ["9:38pm", "21:38"],
    ["938p", "21:38"],
    ["9:38", "09:38"],
    ["21:38", "21:38"],
    ["6", "06:00"],
    ["600", "06:00"],
    ["7.30", "07:30"],
    ["7 30", "07:30"],
    ["12:00 AM", "00:00"],
    ["12:00 PM", "12:00"],
    ["12a", "00:00"],
    ["12p", "12:00"],
    ["11:54 pm", "23:54"],
  ])("%s -> %s", (input, expected) => {
    expect(parseTime(input)).toBe(expected);
  });

  it.each([["25:00"], ["9:75"], ["abc"], [""], ["13:00 PM"]])(
    "rejects %s rather than guessing",
    (input) => {
      expect(parseTime(input)).toBeNull();
    }
  );
});

describe("toDisplay", () => {
  it.each([
    ["21:38", "9:38 PM"],
    ["00:06", "12:06 AM"],
    ["12:00", "12:00 PM"],
    ["00:00", "12:00 AM"],
  ])("%s -> %s", (input, expected) => {
    expect(toDisplay(input)).toBe(expected);
  });

  it("round-trips every offered minute", () => {
    for (const minute of MINUTE_OPTIONS) {
      const value = `13:${String(minute).padStart(2, "0")}`;
      expect(parseTime(toDisplay(value))).toBe(value);
    }
  });
});

describe("parseTime — a bare hour resolves against the time before it", () => {
  it.each([
    // An 11am call: 3 means the afternoon, four hours on, not sixteen.
    ["3", "11:00", "15:00"],
    ["3:30", "11:00", "15:30"],
    // A 6am call: 7 really is an hour later, so it stays in the morning.
    ["7", "06:00", "07:00"],
    // Noon rather than midnight thirteen hours away.
    ["12", "11:00", "12:00"],
    ["12:30", "11:00", "12:30"],
    // The half hour back from a 3pm meal.
    ["3:30", "15:00", "15:30"],
    // Past midnight on a long night.
    ["2", "22:00", "02:00"],
    // The reference itself is close enough.
    ["11", "11:00", "11:00"],
  ])("%s after %s -> %s", (input, after, expected) => {
    expect(parseTime(input, after)).toBe(expected);
  });

  it.each([
    // An am/pm someone typed is theirs, however odd it looks.
    ["3am", "11:00", "03:00"],
    ["3:30 AM", "15:00", "03:30"],
    ["12a", "11:00", "00:00"],
    // 13–23 can only mean one thing.
    ["15", "11:00", "15:00"],
    ["21:38", "11:00", "21:38"],
    ["00:30", "11:00", "00:30"],
  ])("leaves %s alone after %s", (input, after, expected) => {
    expect(parseTime(input, after)).toBe(expected);
  });

  it("still reads a 24-hour clock when nothing comes before it", () => {
    expect(parseTime("3")).toBe("03:00");
    expect(parseTime("9:38")).toBe("09:38");
    // An unusable reference must not turn into a guess.
    expect(parseTime("3", "")).toBe("03:00");
    expect(parseTime("3", "nonsense")).toBe("03:00");
  });
});

describe("addMinutes", () => {
  it.each([
    ["15:00", 30, "15:30"],
    ["11:45", 30, "12:15"],
    ["23:45", 30, "00:15"], // a meal that runs past midnight
    ["00:00", 30, "00:30"],
  ])("%s + %d -> %s", (time, minutes, expected) => {
    expect(addMinutes(time, minutes)).toBe(expected);
  });

  it("returns nothing it cannot compute rather than a wrong time", () => {
    expect(addMinutes("", 30)).toBe("");
    expect(addMinutes("nonsense", 30)).toBe("");
  });

  it("uses the half hour a meal actually is", () => {
    expect(MEAL_MINUTES).toBe(30);
  });
});
