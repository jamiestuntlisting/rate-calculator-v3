import { describe, it, expect } from "vitest";
import type { WorkRecord } from "@/types";
import {
  DEFAULT_TURNAROUND_HOURS,
  TURNAROUND_RULES,
  turnaroundsFor,
} from "./turnaround";

const day = (
  workDate: string,
  callTime: string,
  dismissOnSet: string,
  wrap: string | null = null
): WorkRecord =>
  ({
    _id: workDate,
    workDate,
    callTime,
    dismissOnSet,
    dismissMakeupWardrobe: wrap,
    showName: "Show",
  }) as unknown as WorkRecord;

describe("rest between one day and the next", () => {
  it("checks against twelve hours, which is the rule", () => {
    // Eleven was the default for a while. It is an exception with conditions
    // on it, and using it as the default called a studio forced call fine.
    expect(DEFAULT_TURNAROUND_HOURS).toBe(12);
    expect(TURNAROUND_RULES.map((r) => r.hours)).toEqual([12, 11, 10]);
    expect(TURNAROUND_RULES[0].hours).toBe(DEFAULT_TURNAROUND_HOURS);
  });

  it("calls a twelve-hour studio day short at eleven and a half", () => {
    const [rest] = turnaroundsFor([
      day("2026-08-24", "07:00", "19:30"),
      day("2026-08-25", "07:00", "19:00"),
    ]);
    expect(rest.hours).toBe(11.5);
    expect(rest.short).toBe(true);
    // ...and not short if the deal allows the eleven-hour location rest.
    const [allowed] = turnaroundsFor(
      [
        day("2026-08-24", "07:00", "19:30"),
        day("2026-08-25", "07:00", "19:00"),
      ],
      11
    );
    expect(allowed.short).toBe(false);
  });

  it("measures wrap to the next call", () => {
    const [rest] = turnaroundsFor([
      day("2026-08-24", "07:00", "19:00"),
      day("2026-08-25", "07:00", "19:00"),
    ]);
    expect(rest.hours).toBe(12);
    expect(rest.short).toBe(false);
  });

  it("counts a short one as short", () => {
    const [rest] = turnaroundsFor([
      day("2026-08-24", "07:00", "21:00"),
      day("2026-08-25", "06:00", "18:00"),
    ]);
    expect(rest.hours).toBe(9);
    expect(rest.short).toBe(true);
  });

  it("prefers the wrap over the set dismissal when there is one", () => {
    // Dismissed on set at 19:00 but not released until 21:00.
    const [rest] = turnaroundsFor([
      day("2026-08-24", "07:00", "19:00", "21:00"),
      day("2026-08-25", "07:00", "19:00"),
    ]);
    expect(rest.hours).toBe(10);
    expect(rest.short).toBe(true);
  });

  it("carries a wrap past midnight onto the next date", () => {
    // Called 16:00 Monday, wrapped 02:00 Tuesday, called 14:00 Tuesday.
    const [rest] = turnaroundsFor([
      day("2026-08-24", "16:00", "02:00"),
      day("2026-08-25", "14:00", "22:00"),
    ]);
    expect(rest.hours).toBe(12);
  });

  it("reports a long rest across a day off rather than hiding it", () => {
    const [rest] = turnaroundsFor([
      day("2026-08-24", "07:00", "19:00"),
      day("2026-08-27", "07:00", "19:00"),
    ]);
    expect(rest.hours).toBe(60);
    expect(rest.short).toBe(false);
  });

  it("respects a minimum the deal sets", () => {
    // Wrapped 20:30, called 07:00: ten and a half hours of rest.
    const days = [
      day("2026-08-24", "07:00", "20:30"),
      day("2026-08-25", "07:00", "19:00"),
    ];
    expect(turnaroundsFor(days, 11)[0].short).toBe(true);
    expect(turnaroundsFor(days, 10)[0].short).toBe(false);
  });

  it("treats rest that exactly meets the minimum as met", () => {
    // Eleven hours against an eleven-hour minimum is compliance, not a breach.
    const [rest] = turnaroundsFor(
      [day("2026-08-24", "07:00", "20:00"), day("2026-08-25", "07:00", "19:00")],
      11
    );
    expect(rest.hours).toBe(11);
    expect(rest.short).toBe(false);
  });

  it("skips a day missing the times rather than guessing", () => {
    expect(
      turnaroundsFor([
        day("2026-08-24", "07:00", ""),
        day("2026-08-25", "07:00", "19:00"),
      ])
    ).toEqual([]);
  });

  it("says nothing when the times cannot both be right", () => {
    // Called before the previous day was released.
    expect(
      turnaroundsFor([
        day("2026-08-24", "07:00", "23:00"),
        day("2026-08-24", "06:00", "18:00"),
      ])
    ).toEqual([]);
  });

  it("orders the days before pairing them", () => {
    const rests = turnaroundsFor([
      day("2026-08-26", "07:00", "19:00"),
      day("2026-08-24", "07:00", "19:00"),
      day("2026-08-25", "07:00", "19:00"),
    ]);
    expect(rests).toHaveLength(2);
    expect(rests.map((r) => r.from.workDate)).toEqual([
      "2026-08-24",
      "2026-08-25",
    ]);
  });
});
