import { describe, it, expect } from "vitest";
import type { WorkRecord } from "@/types";
import { WEEKLY_GUARANTEES, weekRules } from "./rules";
import type { WeeklyDerivation } from "./from-work-records";
import { turnaroundsFor } from "./turnaround";

const derivation = (over: Partial<WeeklyDerivation> = {}): WeeklyDerivation => ({
  days: 5,
  workHours: 40,
  dailyOvertimeHours: 0,
  doubleTimeHours: 0,
  adjustments: 0,
  mealPenalties: 0,
  holidayDays: 0,
  sixthDay: false,
  seventhDay: false,
  daysWithoutCalculation: 0,
  ...over,
});

const day = (
  workDate: string,
  callTime: string,
  dismissOnSet: string
): WorkRecord =>
  ({ _id: workDate, workDate, callTime, dismissOnSet, showName: "S" }) as unknown as WorkRecord;

const find = (rules: ReturnType<typeof weekRules>, id: string) =>
  rules.find((r) => r.id === id);

const base = { turnarounds: [], turnaroundHours: 12, guarantee: "studio" as const };

describe("the weekly guarantee", () => {
  it("is 44 studio and 48 overnight location", () => {
    // Confirmed against all 133 sample cards: 112 studio at 44, 21 distant
    // at 48, no exceptions.
    expect(WEEKLY_GUARANTEES.map((g) => [g.id, g.hours])).toEqual([
      ["studio", 44],
      ["distant", 48],
    ]);
  });

  it("does not report a finding on days that have not been worked out", () => {
    const rules = weekRules({
      ...base,
      derivation: derivation({ workHours: 0, days: 4, daysWithoutCalculation: 4 }),
    });
    // "0h worked, inside the 44-hour guarantee" reads as a result. It is not.
    expect(find(rules, "guarantee")?.evidence).toBe(
      "No hours counted yet — none of these days has been worked out."
    );
  });

  it("says how many days it could count when some are missing", () => {
    const rules = weekRules({
      ...base,
      derivation: derivation({ workHours: 24, days: 5, daysWithoutCalculation: 2 }),
    });
    expect(find(rules, "guarantee")?.evidence).toContain("Counting 3 of 5 days");
  });

  it("says the week sits inside the guarantee when it does", () => {
    const rule = find(weekRules({ ...base, derivation: derivation({ workHours: 40 }) }), "guarantee");
    expect(rule?.status).toBe("check");
    expect(rule?.evidence).toContain("inside the 44-hour guarantee");
  });

  it("names the hours past it when the week runs over", () => {
    const rule = find(weekRules({ ...base, derivation: derivation({ workHours: 50 }) }), "guarantee");
    expect(rule?.status).toBe("applies");
    expect(rule?.evidence).toContain("6h past the guarantee");
  });

  it("uses 48 on an overnight location, so the same week is inside it", () => {
    const rules = weekRules({
      ...base,
      guarantee: "distant",
      derivation: derivation({ workHours: 46 }),
    });
    const rule = find(rules, "guarantee");
    expect(rule?.title).toContain("48-hour");
    expect(rule?.status).toBe("check");
  });
});

describe("rest between days", () => {
  const week = [
    day("2026-08-24", "07:00", "19:30"),
    day("2026-08-25", "07:00", "19:00"),
  ];

  it("reports a breach against the twelve-hour rule", () => {
    const rules = weekRules({
      derivation: derivation(),
      turnarounds: turnaroundsFor(week, 12),
      turnaroundHours: 12,
      guarantee: "studio",
    });
    const rule = find(rules, "turnaround");
    expect(rule?.status).toBe("breached");
    expect(rule?.evidence).toContain("Tue, Aug 25 after 11.5h");
    expect(rule?.evidence).toContain("forced call");
  });

  it("clears the same week where the deal allows eleven hours", () => {
    const rules = weekRules({
      derivation: derivation(),
      turnarounds: turnaroundsFor(week, 11),
      turnaroundHours: 11,
      guarantee: "studio",
    });
    const rule = find(rules, "turnaround");
    expect(rule?.status).toBe("applies");
    expect(rule?.title).toContain("11 hours");
    // The condition on the exception travels with it.
    expect(rule?.detail).toContain("non-consecutive");
  });

  it("says nothing about rest when there is only one day", () => {
    expect(find(weekRules({ ...base, derivation: derivation() }), "turnaround")).toBeUndefined();
  });
});

describe("what else a week can trigger", () => {
  it("reports daily overtime separately from the weekly guarantee", () => {
    // A short week can still carry daily overtime — five of the six sample
    // cards with a long day inside the guarantee were paid it.
    const rules = weekRules({
      ...base,
      derivation: derivation({ workHours: 20, dailyOvertimeHours: 2, doubleTimeHours: 1 }),
    });
    const rule = find(rules, "daily_overtime");
    expect(rule?.status).toBe("applies");
    expect(rule?.evidence).toContain("2h at time-and-a-half");
    expect(rule?.evidence).toContain("1h at double time");
    expect(find(rules, "guarantee")?.status).toBe("check");
  });

  it("stays quiet about overtime that was not worked", () => {
    expect(find(weekRules({ ...base, derivation: derivation() }), "daily_overtime")).toBeUndefined();
  });

  it("names a sixth and a seventh day", () => {
    expect(find(weekRules({ ...base, derivation: derivation({ sixthDay: true, days: 6 }) }), "consecutive_days")?.title).toBe("Sixth day");
    expect(find(weekRules({ ...base, derivation: derivation({ seventhDay: true, days: 7 }) }), "consecutive_days")?.title).toBe("Seventh day");
  });

  it("flags days with no times rather than letting the total read low in silence", () => {
    const rule = find(
      weekRules({ ...base, derivation: derivation({ daysWithoutCalculation: 2 }) }),
      "incomplete"
    );
    expect(rule?.status).toBe("check");
    expect(rule?.evidence).toContain("2 days have");
  });
});
