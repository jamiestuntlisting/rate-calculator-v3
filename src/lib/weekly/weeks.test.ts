import { describe, it, expect } from "vitest";
import type { WorkRecord } from "@/types";
import { groupIntoWeeks, weekLabel, weekStartOf } from "./weeks";

const day = (workDate: string): WorkRecord =>
  ({ _id: workDate, workDate, showName: "Show" }) as unknown as WorkRecord;

describe("splitting days into the weeks they belong to", () => {
  it("runs a week from the Monday on or before the day", () => {
    // 2026-08-24 is a Monday.
    expect(weekStartOf("2026-08-24")).toBe("2026-08-24");
    expect(weekStartOf("2026-08-26")).toBe("2026-08-24"); // Wednesday
    expect(weekStartOf("2026-08-30")).toBe("2026-08-24"); // Sunday, still that week
    expect(weekStartOf("2026-08-31")).toBe("2026-08-31"); // next Monday
  });

  it("reads the date as written, whatever the timezone", () => {
    // A local-midnight parse would land this on the day before in the US.
    expect(weekStartOf("2026-01-01")).toBe("2025-12-29");
  });

  it("starts the week on whichever day a production runs it", () => {
    // The same Wednesday, against three different payroll weeks.
    expect(weekStartOf("2026-08-26", 0)).toBe("2026-08-23"); // Sunday
    expect(weekStartOf("2026-08-26", 3)).toBe("2026-08-26"); // Wednesday
    expect(weekStartOf("2026-08-26", 4)).toBe("2026-08-20"); // Thursday

    // And a run that is one week on Mondays is two on Sundays.
    const run = ["2026-08-24", "2026-08-25", "2026-08-26"].map(day);
    expect(groupIntoWeeks(run, 0).map((w) => w.records.length)).toEqual([3]);
    expect(groupIntoWeeks(run, 2).map((w) => w.records.length)).toEqual([1, 2]);
  });

  it("keeps a single week together", () => {
    const weeks = groupIntoWeeks(
      ["2026-08-24", "2026-08-25", "2026-08-26"].map(day)
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0].start).toBe("2026-08-24");
    expect(weeks[0].records).toHaveLength(3);
  });

  it("splits a run that crosses a Monday into two weeks", () => {
    // Thursday through the following Tuesday: six consecutive days, two weeks.
    const weeks = groupIntoWeeks(
      ["2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01"].map(day)
    );
    expect(weeks.map((w) => w.records.length)).toEqual([4, 2]);
    expect(weeks.map((w) => w.start)).toEqual(["2026-08-24", "2026-08-31"]);
  });

  it("never lets a group run past seven days", () => {
    const fortnight = Array.from({ length: 14 }, (_, i) =>
      day(`2026-08-${String(17 + i).padStart(2, "0")}`)
    );
    const weeks = groupIntoWeeks(fortnight);
    expect(weeks.length).toBeGreaterThan(1);
    for (const week of weeks) expect(week.records.length).toBeLessThanOrEqual(7);
  });

  it("orders the weeks, and the days inside them", () => {
    const weeks = groupIntoWeeks(
      ["2026-09-01", "2026-08-26", "2026-08-24"].map(day)
    );
    expect(weeks.map((w) => w.start)).toEqual(["2026-08-24", "2026-08-31"]);
    expect(weeks[0].records.map((r) => r.workDate)).toEqual([
      "2026-08-24",
      "2026-08-26",
    ]);
  });

  it("drops a day whose date cannot be read rather than guessing one", () => {
    expect(groupIntoWeeks([day(""), day("not-a-date")])).toEqual([]);
    expect(weekStartOf("")).toBeNull();
  });

  it("names the week by the day it runs from", () => {
    expect(weekLabel("2026-08-24")).toBe("Week of Aug 24, 2026");
  });
});
