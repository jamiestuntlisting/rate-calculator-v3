import { describe, it, expect } from "vitest";
import { calculateThreeDay } from "./three-day";

const base = {
  contractRate: 3000,
  dayCount: 3,
  mealPenalties: 0,
  stuntAdjustments: 0,
  overtimeHours: 0,
};

describe("a 3-day contract", () => {
  it("pays the contract for its three days", () => {
    const b = calculateThreeDay(base);
    expect(b.total).toBe(3000);
    expect(b.lines).toHaveLength(1);
  });

  it("pays a fourth and fifth day prorated at a third each", () => {
    const b = calculateThreeDay({ ...base, dayCount: 5 });
    expect(b.lines[1].amount).toBe(2000);
    expect(b.total).toBe(5000);
  });

  it("lands penalties and adjustments on top", () => {
    const b = calculateThreeDay({
      ...base,
      mealPenalties: 105,
      stuntAdjustments: 250,
    });
    expect(b.total).toBe(3355);
  });

  it("counts overtime hours instead of pricing them", () => {
    // The 3-day schedule's overtime rules are not built; the hours are
    // reported so the gap shows rather than a guessed figure.
    const b = calculateThreeDay({ ...base, overtimeHours: 4.25 });
    expect(b.total).toBe(3000);
    expect(b.unpricedOvertimeHours).toBe(4.3);
  });

  it("rounds once, at the end", () => {
    // A rate that does not divide by three evenly: 1000/3 per extra day.
    const b = calculateThreeDay({ ...base, contractRate: 1000, dayCount: 4 });
    expect(b.lines[1].amount).toBe(333.33);
    expect(b.total).toBe(1333.33);
  });
});
