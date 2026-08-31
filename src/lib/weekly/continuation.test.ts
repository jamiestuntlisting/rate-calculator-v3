import { describe, it, expect } from "vitest";
import { calculateWeekly } from "./weekly-engine";
import { isContinuationWeek, priorWeekStart } from "./weeks";

describe("prorated weeklies — a week riding the week before", () => {
  it("finds the immediately preceding week, across month ends too", () => {
    expect(priorWeekStart("2026-08-17")).toBe("2026-08-10");
    expect(priorWeekStart("2026-09-01")).toBe("2026-08-25");
  });
  it("a second consecutive week is a continuation; a gapped one is not", () => {
    const starts = ["2026-08-10", "2026-08-17"];
    expect(isContinuationWeek("2026-08-17", starts)).toBe(true);
    expect(isContinuationWeek("2026-08-10", starts)).toBe(false);
    expect(isContinuationWeek("2026-08-31", starts)).toBe(false);
  });

  it("the engagement's first week floors while its second prorates", () => {
    const terms = { scaleWeeklyRate: 4785, contractWeeklyRate: 4785 };
    const first = calculateWeekly({
      ...terms,
      daysWorked: 1,
      minimumWeekly: 4785,
    });
    const second = calculateWeekly({ ...terms, daysWorked: 2 });
    expect(first.grandTotal).toBe(4785);
    expect(second.grandTotal).toBe(1914);
    expect(
      second.lineItems.some((line) => line.label === "Weekly guarantee")
    ).toBe(false);
  });
});
