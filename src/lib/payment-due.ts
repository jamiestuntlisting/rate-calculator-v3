import { weekStartOf } from "@/lib/weekly/weeks";

/**
 * When a SAG check is due: the Wednesday of the second week after the
 * week you worked. Payroll processes the week after the work week and
 * the check lands the week after that — so a Friday is paid on the
 * second Wednesday after it, and the Monday of that same week on the
 * third Wednesday after it, which is the same calendar Wednesday:
 * every day of one work week shares one due date. Weeks run Monday,
 * matching the rest of the app.
 *
 * Late is derived from this, never hand-marked: a day with no payment
 * by its due Wednesday is late until money lands or the row is closed
 * as Done.
 */
export function paymentDueDate(workDate: string): string | null {
  const monday = weekStartOf((workDate || "").slice(0, 10), 1);
  if (!monday) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(monday)!;
  const due = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 16)
  );
  return due.toISOString().slice(0, 10);
}

/**
 * A day's check is late when nothing has been paid by its due
 * Wednesday and nobody has closed the row. A short check is a
 * different problem (Under), not a late one — the check arrived.
 */
export function isPaymentLate(
  record: {
    workDate: string;
    workType?: string | null;
    paidAmount?: number | null;
    paymentFlag?: string | null;
  },
  today: string = new Date().toISOString().slice(0, 10)
): boolean {
  if (record.workType === "other") return false;
  if ((record.paidAmount || 0) > 0) return false;
  if (record.paymentFlag === "done") return false;
  const due = paymentDueDate(record.workDate);
  return due !== null && today > due;
}
