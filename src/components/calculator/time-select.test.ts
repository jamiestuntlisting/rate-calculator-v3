import { describe, it, expect } from "vitest";
import { parseTime, toDisplay, MINUTE_OPTIONS } from "./time-select";

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
