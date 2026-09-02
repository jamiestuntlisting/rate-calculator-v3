import { describe, it, expect } from "vitest";
import { isTodayStamp } from "./date-field";
import { CLOCK_STAMP_MS } from "@/components/calculator/time-select";

// A local evening — in UTC already tomorrow for American offsets, the
// same trap the time guard pins: "today" must mean the local day.
const now = new Date(2026, 8, 2, 19, 30);
const TODAY = "2026-09-02";

describe("the platform stamping today into an empty date field", () => {
  it("catches the stamp: empty field, today, right after focus, no finger", () => {
    expect(isTodayStamp("", TODAY, 40, false, now)).toBe(true);
    expect(isTodayStamp(undefined, TODAY, 40, false, now)).toBe(true);
  });

  it("leaves a tapped field alone — the picker is open and visible", () => {
    expect(isTodayStamp("", TODAY, 40, true, now)).toBe(false);
  });

  it("only today can be a stamp", () => {
    expect(isTodayStamp("", "2026-08-20", 40, false, now)).toBe(false);
  });

  it("a field that already has a date is never stamped", () => {
    expect(isTodayStamp("2026-08-20", TODAY, 40, false, now)).toBe(false);
  });

  it("trusts a change made well after focus", () => {
    expect(isTodayStamp("", TODAY, CLOCK_STAMP_MS + 1, false, now)).toBe(
      false
    );
  });
});

describe("the picker's Reset leaves the field empty", () => {
  it("refuses today arriving a moment after a clear, not later", async () => {
    const { isStampAfterClear } = await import("./date-field");
    const now = new Date(2026, 8, 2, 16, 12);
    const today = "2026-09-02";
    expect(isStampAfterClear(today, 30, now)).toBe(true);
    expect(isStampAfterClear("2014-09-02", 30, now)).toBe(false);
    expect(isStampAfterClear(today, 10_000, now)).toBe(false);
  });
});
