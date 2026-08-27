import { describe, it, expect } from "vitest";
import {
  compareStub,
  disputeMessage,
  disputeSubject,
  type PayStubLine,
  SETTLED_WITHIN,
  stubTotal,
  STUB_LINE_LABELS,
} from "./pay-stub";

const line = (label: string, hours: number | null, amount: number): PayStubLine => ({
  label,
  hours,
  amount,
});

const STUB = [
  line("Straight time", 8, 1283),
  line("Time and a half", 2, 481.13),
  line("Meal penalty", null, 25),
];

describe("adding a stub up", () => {
  it("offers the lines a stub usually carries", () => {
    expect(STUB_LINE_LABELS).toContain("Straight time");
    expect(STUB_LINE_LABELS).toContain("Double time");
    expect(STUB_LINE_LABELS).toContain("Forced call");
    expect(STUB_LINE_LABELS).toContain("Meal penalty");
  });

  it("sums at full precision and rounds once", () => {
    expect(stubTotal(STUB)).toBe(1789.13);
    // Three thirds of a cent must not become a cent.
    expect(
      stubTotal([line("a", null, 0.334), line("b", null, 0.333), line("c", null, 0.333)])
    ).toBe(1);
  });

  it("treats a missing amount as nothing, not as a break", () => {
    expect(stubTotal([line("Straight time", 8, NaN)])).toBe(0);
    expect(stubTotal([])).toBe(0);
  });
});

describe("comparing it with what we make it", () => {
  it("calls a matching stub settled", () => {
    const c = compareStub(1789.13, STUB);
    expect(c.settled).toBe(true);
    expect(c.short).toBe(false);
    expect(c.difference).toBe(0);
  });

  it("says how far short, and that it is short", () => {
    const c = compareStub(1889.13, STUB);
    expect(c.short).toBe(true);
    expect(c.difference).toBe(100);
    expect(c.paid).toBe(1789.13);
  });

  it("notices an overpayment rather than only ever looking for a shortfall", () => {
    const c = compareStub(1700, STUB);
    expect(c.over).toBe(true);
    expect(c.short).toBe(false);
    expect(c.difference).toBe(-89.13);
  });

  it("does not raise a rounding cent as a shortfall", () => {
    const c = compareStub(1789.13 + SETTLED_WITHIN / 2, STUB);
    expect(c.settled).toBe(true);
  });
});

describe("the note to payroll", () => {
  const message = disputeMessage({
    performerName: "Jamie Northrup",
    showName: "Grown Ups 3",
    period: "the work day of 26 August 2026",
    comparison: compareStub(1889.13, STUB),
    owedLines: [line("Straight time", 8, 1283), line("Time and a half", 2, 481.13)],
    paidLines: STUB,
  });

  it("leads with the money, because that is the question", () => {
    expect(message).toContain("Paid:      $1,789.13");
    expect(message).toContain("Our total: $1,889.13");
    expect(message).toContain("$100.00 short");
  });

  it("names the performer, the show and the period", () => {
    expect(message).toContain("Jamie Northrup");
    expect(message).toContain("Grown Ups 3");
    expect(message).toContain("the work day of 26 August 2026");
  });

  it("shows both sets of working, so it can be checked", () => {
    expect(message).toContain("We make it up as follows:");
    expect(message).toContain("The stub shows:");
    expect(message).toContain("Straight time (8 hrs): $1,283.00");
    expect(message).toContain("Meal penalty: $25.00");
  });

  it("asks rather than accuses, and leaves room to be wrong", () => {
    expect(message).toMatch(/could you take a look/i);
    expect(message).toMatch(/happy to be told we have it wrong/i);
    // Nothing that reads as a threat or a demand.
    expect(message).not.toMatch(/immediately|demand|owed to me|must be paid|legal/i);
  });

  it("words an overpayment as over, not short", () => {
    const over = disputeMessage({
      performerName: "Jamie Northrup",
      showName: "Grown Ups 3",
      period: "the week of 23 August 2026",
      comparison: compareStub(1700, STUB),
      owedLines: [],
      paidLines: STUB,
    });
    expect(over).toContain("$89.13 over");
    expect(over).not.toContain("short");
  });

  it("names the show and period in the subject", () => {
    expect(disputeSubject("Grown Ups 3", "the week of 23 August 2026")).toBe(
      "Grown Ups 3 — payment query for the week of 23 August 2026"
    );
  });
});
