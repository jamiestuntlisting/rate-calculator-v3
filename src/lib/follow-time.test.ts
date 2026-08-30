import { describe, it, expect } from "vitest";
import { followedTime, precedingTime } from "./follow-time";

describe("a companion time follows its anchor", () => {
  it("offers anchor + offset when nothing was entered", () => {
    expect(followedTime("12:00", null, 30)).toBe("12:30");
    expect(followedTime("17:24", "", 15)).toBe("17:39");
  });

  it("moves a companion the new anchor just crossed", () => {
    // In moved to 10:30 while the Out still said 9:54 — the Out follows
    // instead of sitting there drawing a warning.
    expect(followedTime("10:30", "09:54", 30)).toBe("11:00");
  });

  it("keeps a companion that still sits after the anchor", () => {
    expect(followedTime("10:30", "11:15", 30)).toBe("11:15");
  });

  it("leaves a real after-midnight companion alone", () => {
    expect(followedTime("23:50", "00:20", 30)).toBe("00:20");
  });

  it("rolls past midnight when the offset does", () => {
    expect(followedTime("23:50", null, 30)).toBe("00:20");
  });

  it("does nothing without an anchor", () => {
    expect(followedTime("", "11:15", 30)).toBe("11:15");
  });
});

describe("a companion that comes before its anchor", () => {
  it("offers anchor minus the offset when empty", () => {
    // Wrapped set to 10:00 with no dismissal: dismissal offered 9:45.
    expect(precedingTime("22:00", null, 15)).toBe("21:45");
  });

  it("keeps a dismissal already sanely before the wrap", () => {
    expect(precedingTime("22:00", "21:30", 15)).toBe("21:30");
  });

  it("moves a dismissal sitting after the wrap", () => {
    expect(precedingTime("22:00", "23:10", 15)).toBe("21:45");
  });

  it("wraps backward past midnight", () => {
    expect(precedingTime("00:10", null, 15)).toBe("23:55");
  });
});
