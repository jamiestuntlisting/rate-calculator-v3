import { describe, it, expect } from "vitest";
import { isPaymentLate, paymentDueDate } from "./payment-due";

describe("payment due — the Wednesday of the second week after the work week", () => {
  it("a Friday is due on the second Wednesday after it", () => {
    // Fri 2026-08-07 → Wed 2026-08-19, twelve days on.
    expect(paymentDueDate("2026-08-07")).toBe("2026-08-19");
  });

  it("the Monday of that same week shares the same due Wednesday (its third)", () => {
    expect(paymentDueDate("2026-08-03")).toBe("2026-08-19");
  });

  it("every day of one work week shares one due date", () => {
    for (const d of ["03", "04", "05", "06", "07", "08", "09"]) {
      expect(paymentDueDate(`2026-08-${d}`)).toBe("2026-08-19");
    }
  });

  it("late starts the day after the due Wednesday, not on it", () => {
    const day = { workDate: "2026-08-07", paidAmount: 0 };
    expect(isPaymentLate(day, "2026-08-19")).toBe(false);
    expect(isPaymentLate(day, "2026-08-20")).toBe(true);
  });

  it("a payment, a Done mark, or non-SAG work is never late", () => {
    expect(
      isPaymentLate({ workDate: "2026-08-07", paidAmount: 500 }, "2026-09-30")
    ).toBe(false);
    expect(
      isPaymentLate(
        { workDate: "2026-08-07", paidAmount: 0, paymentFlag: "done" },
        "2026-09-30"
      )
    ).toBe(false);
    expect(
      isPaymentLate(
        { workDate: "2026-08-07", paidAmount: 0, workType: "other" },
        "2026-09-30"
      )
    ).toBe(false);
  });
});
