import { describe, it, expect } from "vitest";
import { parseShowbizCsv, isWeeklyCard } from "@/lib/showbiz";
import {
  checkWeeklyCard,
  checkWeeklyCards,
  readWeeklyExtra,
  showbizCardToWeeklyInput,
} from "./from-showbiz";

const GS = "\x1d";

/**
 * Build one export row. ShowBiz writes 280 columns with no header, so the
 * only way to prove a column index is wired to the right field is to put a
 * known value at that index and read it back out.
 */
function row(values: Record<number, string>): string {
  const fields = Array.from({ length: 280 }, (_, i) => values[i] ?? "");
  return fields
    .map((f) => (/[",]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f))
    .join(",");
}

/** A Distant six-day week: adjustments, double time, penalty OT, allowance. */
const S934 = row({
  12: "S934",
  54: "Derric",
  57: "Stotts",
  182: "Weekly Player",
  185: "48.00",
  188: "$5,500.00",
  190: "$1,457.20",
  194: "Loc Allowance",
  200: "H: Stunt Performer",
  201: "Distant",
  // Four booked days of $100, which the week reads as $400 in total.
  202: `${GS}100.00${GS}100.00${GS}100.00${GS}100.00${GS}`,
  206: "1.60",
  207: "6.70",
  209: "$7,493.11",
  211: "$6,035.91",
  214: "$3,936.00",
  252: `2/23${GS}2/24${GS}2/25${GS}2/26${GS}2/27${GS}2/28`,
  253: "6",
  276: `SW${GS}W${GS}W${GS}W${GS}W${GS}WF`,
});

/** A seven-day week carrying both premiums and weekly overtime. */
const S1415 = row({
  12: "S1415",
  182: "Weekly Player",
  183: "6.00",
  188: "$5,500.00",
  190: "$5,575.20",
  191: "6th Day",
  192: "7th Day",
  202: `${GS}700.00${GS}`,
  206: "14.00",
  209: "$18,878.90",
  211: "$13,303.70",
  214: "$4,646.00",
  253: "7",
});

describe("ShowBiz card → weekly input", () => {
  it("reads each column into the field the weekly rules name", () => {
    const [card] = parseShowbizCsv(S934);

    expect(card.cardId).toBe("S934");
    expect(card.performer).toBe("Derric Stotts");
    expect(card.employmentType).toBe("Weekly Player");
    expect(card.location).toBe("Distant");
    expect(card.baseScaleRate).toBe(3936);
    expect(card.contractRate).toBe(5500);
    expect(card.daysWorked).toBe(6);
    expect(card.doubleTimeHours).toBe(1.6);
    expect(card.penaltyOvertimeHours).toBe(6.7);
    expect(card.postSubtotalAdjustments).toBe(1457.2);
    expect(card.gross).toBe(7493.11);
    expect(card.dayCodes).toEqual(["SW", "W", "W", "W", "W", "WF"]);
  });

  it("sums the per-day adjustment column, not the post-subtotal one", () => {
    const [card] = parseShowbizCsv(S934);

    // The trap: col 190 is $1,457.20 and col 202 sums to $400. They are
    // different numbers doing different jobs, and swapping them still
    // produces a plausible-looking gross.
    expect(card.adjustmentsPerDay).toEqual([100, 100, 100, 100]);
    expect(showbizCardToWeeklyInput(card).adjustments).toBe(400);
    expect(showbizCardToWeeklyInput(card).postSubtotalAdjustments).toBe(1457.2);
  });

  it("maps a Distant week to exactly the input the derivation used", () => {
    const [card] = parseShowbizCsv(S934);

    expect(showbizCardToWeeklyInput(card)).toEqual({
      scaleWeeklyRate: 3936,
      contractWeeklyRate: 5500,
      daysWorked: 6,
      holidayDays: 0,
      adjustments: 400,
      dailyOvertimeHours: 0,
      doubleTimeHours: 1.6,
      penaltyOvertimeHours: 6.7,
      weeklyOvertimeHours: 0,
      extra: "loc_allowance",
      sixthDay: false,
      seventhDay: false,
      postSubtotalAdjustments: 1457.2,
    });
  });

  it("carries the 6th and 7th day flags and weekly overtime", () => {
    const [card] = parseShowbizCsv(S1415);
    const input = showbizCardToWeeklyInput(card);

    expect(input.sixthDay).toBe(true);
    expect(input.seventhDay).toBe(true);
    expect(input.weeklyOvertimeHours).toBe(6);
    expect(input.daysWorked).toBe(7);
  });

  it("counts worked holidays from the day codes", () => {
    const [card] = parseShowbizCsv(
      row({
        182: "Weekly Player",
        188: "$4,400.00",
        214: "$4,489.00",
        253: "5",
        276: `SW${GS}W${GS}HOL${GS}W${GS}WF`,
      })
    );

    expect(showbizCardToWeeklyInput(card).holidayDays).toBe(1);
  });

  it("pays only the two extras that are paid", () => {
    expect(readWeeklyExtra("Loc Allowance")).toBe("loc_allowance");
    expect(readWeeklyExtra("HOLIDAY")).toBe("holiday");
    // Recorded on the card but worth nothing — mapping them to a line item
    // would invent pay that payroll never issued.
    expect(readWeeklyExtra("Covid Test")).toBeNull();
    expect(readWeeklyExtra("Fitting")).toBeNull();
    expect(readWeeklyExtra("")).toBeNull();
  });
});

describe("checking a card against payroll", () => {
  it("reproduces the gross and subtotal on a Distant six-day week", () => {
    const [card] = parseShowbizCsv(S934);
    const check = checkWeeklyCard(card);

    expect(check.error).toBeNull();
    expect(check.breakdown?.grandTotal).toBe(7493.11);
    expect(check.breakdown?.subtotal).toBe(6035.91);
    expect(check.grossDelta).toBe(0);
    expect(check.matches).toBe(true);
  });

  it("reproduces a seven-day week with both premiums", () => {
    const [card] = parseShowbizCsv(S1415);
    const check = checkWeeklyCard(card);

    expect(check.breakdown?.grandTotal).toBe(18878.9);
    expect(check.breakdown?.subtotal).toBe(13303.7);
    expect(check.matches).toBe(true);
  });

  it("reports a card it cannot calculate instead of dropping it", () => {
    // A card with no scale rate is malformed, not a missing rule. The bench
    // has to show it, or the pass rate quietly counts fewer cards than the
    // file actually holds.
    const [card] = parseShowbizCsv(
      row({ 12: "S1234", 182: "Weekly Player", 188: "$5,500.00", 253: "5" })
    );
    const check = checkWeeklyCard(card);

    expect(check.breakdown).toBeNull();
    expect(check.error).toMatch(/scaleWeeklyRate/);
    expect(check.matches).toBe(false);
  });

  it("summarises a run and keeps the worst difference", () => {
    const cards = parseShowbizCsv([S934, S1415].join("\n"));
    const summary = checkWeeklyCards(cards);

    expect(summary.total).toBe(2);
    expect(summary.matched).toBe(2);
    expect(summary.mismatched).toBe(0);
    expect(summary.errored).toBe(0);
    expect(summary.worstDelta).toBe(0);
  });

  it("only picks up weekly cards", () => {
    const cards = parseShowbizCsv(
      [S934, row({ 12: "S770", 182: "Day Player", 214: "$1,030.00" })].join("\n")
    );

    expect(cards).toHaveLength(2);
    expect(cards.filter(isWeeklyCard).map((c) => c.cardId)).toEqual(["S934"]);
  });
});
