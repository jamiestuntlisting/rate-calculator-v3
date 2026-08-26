import { describe, it, expect } from "vitest";
import type { CalculationBreakdown, TimeSegment, WorkRecord } from "@/types";
import {
  groupRecordsForWeekly,
  MIN_DAYS_FOR_WEEKLY,
  workRecordsToWeeklyInput,
} from "./from-work-records";
import { calculateWeekly } from "./weekly-engine";

const RATES = { scaleWeeklyRate: 4785, contractWeeklyRate: 5500 };

function segment(label: string, hours: number, multiplier: number): TimeSegment {
  return { label, hours, rate: 100, multiplier, subtotal: hours * 100 * multiplier };
}

function calculation(
  segments: TimeSegment[],
  totalPenalties = 0
): CalculationBreakdown {
  return {
    baseRate: 1283,
    hourlyRate: 160.375,
    adjustedBaseRate: 1283,
    adjustedHourlyRate: 160.375,
    totalWorkHours: 0,
    totalMealTime: 0,
    netWorkHours: segments.reduce((s, x) => s + x.hours, 0),
    segments,
    penalties: { mealPenalties: [], forcedCallPenalty: 0, totalPenalties },
    dayMultiplier: { applied: false, type: null, multiplier: 1 },
    grandTotal: 0,
  };
}

function day(over: Partial<WorkRecord> = {}): WorkRecord {
  return {
    _id: Math.random().toString(36).slice(2),
    showName: "Action Movie 3",
    workDate: "2026-08-24",
    dismissMakeupWardrobe: null,
    ndMealIn: null,
    ndMealOut: null,
    firstMealStart: null,
    firstMealFinish: null,
    secondMealStart: null,
    secondMealFinish: null,
    stuntAdjustment: 0,
    forcedCall: false,
    isSixthDay: false,
    isSeventhDay: false,
    isHoliday: false,
    workStatus: "theatrical_basic",
    characterName: "",
    notes: "",
    recordStatus: "complete",
    documents: [],
    paymentStatus: "unpaid",
    paidAmount: 0,
    paidDate: null,
    paymentDueDate: null,
    photos: [],
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

/** An ordinary ten-hour day: eight straight, two at time-and-a-half. */
const TEN_HOUR_DAY = calculation([
  segment("Straight Time (Hrs 1-8)", 8, 1),
  segment("Time-and-a-Half (Hrs 9-10)", 2, 1.5),
]);

describe("combining work days into a weekly contract", () => {
  it("needs a full week of days", () => {
    expect(MIN_DAYS_FOR_WEEKLY).toBe(5);
  });

  it("counts the days and sums the overtime across them", () => {
    const records = Array.from({ length: 5 }, () =>
      day({ calculation: TEN_HOUR_DAY })
    );
    const { input, derivation } = workRecordsToWeeklyInput(records, RATES);

    expect(input.daysWorked).toBe(5);
    expect(derivation.dailyOvertimeHours).toBe(10); // 2 hours over 5 days
    expect(input.dailyOvertimeHours).toBe(10);
    expect(input.doubleTimeHours).toBe(0);
  });

  it("separates double time from time-and-a-half", () => {
    const long = calculation([
      segment("Straight Time (Hrs 1-8)", 8, 1),
      segment("Time-and-a-Half (Hrs 9-10)", 2, 1.5),
      segment("Double Time (Hrs 11+)", 3, 2),
    ]);
    const { input } = workRecordsToWeeklyInput(
      [day({ calculation: long }), ...Array.from({ length: 4 }, () => day({ calculation: TEN_HOUR_DAY }))],
      RATES
    );

    expect(input.dailyOvertimeHours).toBe(10); // 2 × 5 days
    expect(input.doubleTimeHours).toBe(3);
  });

  it("does not read a sixth day's base hours as overtime", () => {
    // The daily engine raises every segment to the day multiplier on a 6th
    // day, so this card's straight time carries multiplier 1.5. Reading the
    // tier off that number would invent eight hours of overtime.
    const sixth = calculation([
      segment("Base Time (Hrs 1-8)", 8, 1.5),
      segment("Time-and-a-Half (Hrs 9-10)", 1, 1.5),
    ]);
    const { input } = workRecordsToWeeklyInput(
      [day({ calculation: sixth, isSixthDay: true })],
      RATES
    );

    expect(input.dailyOvertimeHours).toBe(1);
    expect(input.sixthDay).toBe(true);
  });

  it("carries the seventh day and worked holidays", () => {
    const { input } = workRecordsToWeeklyInput(
      [
        day({ calculation: TEN_HOUR_DAY, isSeventhDay: true }),
        day({ calculation: TEN_HOUR_DAY, isHoliday: true }),
        day({ calculation: TEN_HOUR_DAY, isHoliday: true }),
      ],
      RATES
    );

    expect(input.seventhDay).toBe(true);
    expect(input.holidayDays).toBe(2);
  });

  it("sums stunt adjustments, and lands meal penalties after the subtotal", () => {
    const withPenalty = calculation(
      [segment("Straight Time (Hrs 1-8)", 8, 1)],
      60
    );
    const { input } = workRecordsToWeeklyInput(
      [
        day({ calculation: withPenalty, stuntAdjustment: 250 }),
        day({ calculation: withPenalty, stuntAdjustment: 150 }),
      ],
      RATES
    );

    // Adjustments raise the overtime rate; penalties must not.
    expect(input.adjustments).toBe(400);
    expect(input.postSubtotalAdjustments).toBe(120);
  });

  it("reports days it could not read rather than counting them as zero", () => {
    const { derivation } = workRecordsToWeeklyInput(
      [
        day({ calculation: TEN_HOUR_DAY }),
        day(), // an uploaded G nobody has transcribed yet
        day(),
      ],
      RATES
    );

    expect(derivation.days).toBe(3);
    expect(derivation.daysWithoutCalculation).toBe(2);
    expect(derivation.dailyOvertimeHours).toBe(2);
  });

  it("produces something the weekly engine accepts", () => {
    const { input } = workRecordsToWeeklyInput(
      Array.from({ length: 5 }, () => day({ calculation: TEN_HOUR_DAY, stuntAdjustment: 100 })),
      RATES
    );
    const breakdown = calculateWeekly(input);

    // Full week, so the base is not prorated.
    expect(breakdown.prorationFactor).toBe(1);
    expect(breakdown.grandTotal).toBeGreaterThan(RATES.scaleWeeklyRate);
    expect(breakdown.lineItems.some((i) => i.label === "Daily overtime")).toBe(true);
  });

  it("groups by show and only offers weeks that have enough days", () => {
    const groups = groupRecordsForWeekly([
      ...Array.from({ length: 6 }, (_, i) =>
        day({ showName: "Big Show", workDate: `2026-08-2${i}` })
      ),
      ...Array.from({ length: 3 }, () => day({ showName: "Short Job" })),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].showName).toBe("Big Show");
    expect(groups[0].records).toHaveLength(6);
    // Sorted by date so the week reads in order.
    expect(groups[0].records[0].workDate).toBe("2026-08-20");
  });
});
