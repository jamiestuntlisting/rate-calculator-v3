import { describe, expect, it } from "vitest";
import { matchDeposits, looksLikePayroll } from "./bank-match";

const expected = [
  { id: "day1", kind: "day" as const, label: "Grown Ups 3 · Tue 8/11", amount: 2405.63, dueDate: "2026-08-26" },
  { id: "wk1", kind: "weekly" as const, label: "The Equalizer · week of 8/17", amount: 6120, dueDate: "2026-09-02" },
];

describe("matching deposits to expected pay", () => {
  it("lands a net deposit on the day whose check was due that week", () => {
    const [m] = matchDeposits(
      [{ transactionId: "t1", amount: 1790.2, date: "2026-08-27", name: "ENTERTAINMENT PARTNERS PAYROLL" }],
      expected
    );
    expect(m.matchKind).toBe("day");
    expect(m.matchId).toBe("day1");
    expect(m.daysOff).toBe(1);
    expect(m.netRatio).toBeCloseTo(0.744, 3);
  });

  it("will not call a deposit a paycheck when the money is impossible", () => {
    // More than the gross, or under half of it.
    expect(matchDeposits([{ transactionId: "t", amount: 2600, date: "2026-08-26" }], expected)[0].matchKind).not.toBe("day");
    expect(matchDeposits([{ transactionId: "t", amount: 900, date: "2026-08-26" }], expected)[0].matchKind).not.toBe("day");
  });

  it("stays within the window around the due date", () => {
    expect(matchDeposits([{ transactionId: "t", amount: 1800, date: "2026-09-20" }], expected)[0].matchKind).toBe("unmatched");
    expect(matchDeposits([{ transactionId: "t", amount: 1800, date: "2026-08-18" }], expected)[0].matchKind).toBe("day");
  });

  it("gives each expected payment one deposit, the bigger deposit claiming first", () => {
    const ms = matchDeposits(
      [
        { transactionId: "small", amount: 1800, date: "2026-09-12" },
        { transactionId: "big", amount: 4500, date: "2026-09-02" },
      ],
      expected
    );
    expect(ms.find((m) => m.transactionId === "big")!.matchId).toBe("wk1");
    // The weekly is taken and the day's due date is seventeen days back.
    expect(ms.find((m) => m.transactionId === "small")!.matchKind).toBe("unmatched");
  });

  it("an unmatched deposit from a payroll house is a residual; a small one is nothing", () => {
    const ms = matchDeposits(
      [
        { transactionId: "r", amount: 1250, date: "2026-07-01", name: "CAST & CREW RESIDUALS" },
        { transactionId: "v", amount: 1250, date: "2026-07-01", name: "VENMO" },
        { transactionId: "s", amount: 120, date: "2026-07-01", name: "CAST & CREW" },
      ],
      expected
    );
    expect(ms.map((m) => m.matchKind)).toEqual(["residual", "unmatched", "unmatched"]);
  });

  it("knows the payroll houses", () => {
    expect(looksLikePayroll("EP PAYROLL SVCS")).toBe(true);
    expect(looksLikePayroll("Wrapbook Inc")).toBe(true);
    expect(looksLikePayroll("Zelle from Mom")).toBe(false);
  });
});
