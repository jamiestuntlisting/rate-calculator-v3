import { describe, it, expect } from "vitest";
import { followedTime } from "./follow-time";

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
