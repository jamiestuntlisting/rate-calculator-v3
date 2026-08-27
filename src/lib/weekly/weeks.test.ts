import { describe, it, expect } from "vitest";
import type { WorkRecord } from "@/types";
import { groupIntoWeeks, weekLabel, weekStartOf } from "./weeks";

const day = (workDate: string): WorkRecord =>
  ({ _id: workDate, workDate, showName: "Show" }) as unknown as WorkRecord;

describe("splitting days into the weeks they belong to", () => {
  it("runs a week from the Sunday on or before the day", () => {
    // 2026-08-23 is a Sunday.
    expect(weekStartOf("2026-08-23")).toBe("2026-08-23");
    expect(weekStartOf("2026-08-26")).toBe("2026-08-23"); // Wednesday
    expect(weekStartOf("2026-08-29")).toBe("2026-08-23"); // Saturday
    expect(weekStartOf("2026-08-30")).toBe("2026-08-30"); // next Sunday
  });

  it("reads the date as written, whatever the timezone", () => {
    // A local-midnight parse would land this on the day before in the US.
    expect(weekStartOf("2026-01-01")).toBe("2025-12-28");
  });

  it("keeps a single week together", () => {
    const weeks = groupIntoWeeks(
      ["2026-08-24", "2026-08-25", "2026-08-26"].map(day)
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0].start).toBe("2026-08-23");
    expect(weeks[0].records).toHaveLength(3);
  });

  it("splits a run that crosses a Sunday into two weeks", () => {
    // Thursday through the following Tuesday: six consecutive days, two weeks.
    const weeks = groupIntoWeeks(
      ["2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01"].map(day)
    );
    expect(weeks.map((w) => w.records.length)).toEqual([3, 3]);
    expect(weeks.map((w) => w.start)).toEqual(["2026-08-23", "2026-08-30"]);
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
    expect(weeks.map((w) => w.start)).toEqual(["2026-08-23", "2026-08-30"]);
    expect(weeks[0].records.map((r) => r.workDate)).toEqual([
      "2026-08-24",
      "2026-08-26",
    ]);
  });

  it("drops a day whose date cannot be read rather than guessing one", () => {
    expect(groupIntoWeeks([day(""), day("not-a-date")])).toEqual([]);
    expect(weekStartOf("")).toBeNull();
  });

  it("names the week by the Sunday it runs from", () => {
    expect(weekLabel("2026-08-23")).toBe("Week of Aug 23, 2026");
  });
});
