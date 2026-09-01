/**
 * A transcribed pay stub, and how it compares with what the day or week
 * came to.
 *
 * Stubs are laid out in three columns — what the payment was for, the hours
 * it covered, and the money. Transcribing them that way means a shortfall
 * can be pointed at a line rather than left as a difference in a total,
 * which is the difference between "this is wrong" and "this is wrong
 * because the second meal penalty is missing".
 */

import type { CalculationBreakdown } from "@/types";

/** A stub covers one work day, or one week of a weekly contract. */
export type PayStubScope = "day" | "week";

export interface PayStubLine {
  /** What the payment was for, as the stub words it. */
  label: string;
  /** Hours it covered, where the stub gives them. */
  hours: number | null;
  amount: number;
}

/** The lines stubs usually carry, offered so they need not be typed out. */
export const STUB_LINE_LABELS = [
  "Straight time",
  "Time and a half",
  "Double time",
  "Forced call",
  "Adjustment",
  "Meal penalty",
  "Other",
] as const;

/** Anything under this is rounding, not a shortfall worth raising. */
export const SETTLED_WITHIN = 0.005;

/**
 * A record's working, read into the three columns a stub is read in —
 * what for, the hours, the money — so ours and theirs can sit side by
 * side. Empty when the day has no calculation yet.
 */
export function owedLinesFromRecord(record: {
  calculation?: CalculationBreakdown | null;
  stuntAdjustment?: number | null;
}): PayStubLine[] {
  const calculation = record.calculation;
  if (!calculation) return [];
  const lines: PayStubLine[] = calculation.segments.map((segment) => ({
    label: segment.label,
    hours: segment.hours,
    amount: segment.subtotal,
  }));
  if (calculation.penalties?.totalPenalties) {
    lines.push({
      label: "Meal penalties",
      hours: null,
      amount: calculation.penalties.totalPenalties,
    });
  }
  if (record.stuntAdjustment) {
    lines.push({
      label: "Stunt adjustment",
      hours: null,
      amount: record.stuntAdjustment,
    });
  }
  return lines;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Summed at full precision and rounded once, as money is everywhere here. */
export function stubTotal(lines: PayStubLine[]): number {
  return round2(
    lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)
  );
}

export interface StubComparison {
  /** What the stub adds up to. */
  paid: number;
  /** What we make it. */
  owed: number;
  /** Owed less paid: positive means short. */
  difference: number;
  short: boolean;
  over: boolean;
  settled: boolean;
}

export function compareStub(
  owed: number,
  lines: PayStubLine[]
): StubComparison {
  const paid = stubTotal(lines);
  const difference = round2((Number(owed) || 0) - paid);
  return {
    paid,
    owed: round2(Number(owed) || 0),
    difference,
    short: difference > SETTLED_WITHIN,
    over: difference < -SETTLED_WITHIN,
    settled: Math.abs(difference) <= SETTLED_WITHIN,
  };
}

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export interface DisputeMessageInput {
  performerName: string;
  showName: string;
  /** "the work day of 26 August 2026" or "the week of 23 August 2026". */
  period: string;
  comparison: StubComparison;
  /** What we say the money is made up of. */
  owedLines: PayStubLine[];
  /** What the stub said. */
  paidLines: PayStubLine[];
}

/**
 * The note that goes to payroll.
 *
 * Deliberately flat and short. It is a request to check a figure, not an
 * accusation, and the person reading it has a hundred cards to get through
 * — so it leads with the amount and the difference, and puts the working
 * underneath where they can check it against their own.
 */
export function disputeMessage(input: DisputeMessageInput): string {
  const { comparison: c, performerName, showName, period } = input;

  const lines: string[] = [];
  lines.push("Hello,");
  lines.push("");
  lines.push(
    `${performerName} has received payment for ${period} on ${showName}, ` +
      `and it looks as though the amount may not be right.`
  );
  lines.push("");
  lines.push(`Paid:      ${money(c.paid)}`);
  lines.push(`Our total: ${money(c.owed)}`);
  lines.push(
    c.short
      ? `Difference: ${money(c.difference)} short`
      : `Difference: ${money(Math.abs(c.difference))} over`
  );
  lines.push("");

  if (input.owedLines.length) {
    lines.push("We make it up as follows:");
    for (const line of input.owedLines) {
      const hours = line.hours ? ` (${line.hours} hrs)` : "";
      lines.push(`  ${line.label}${hours}: ${money(line.amount)}`);
    }
    lines.push("");
  }

  if (input.paidLines.length) {
    lines.push("The stub shows:");
    for (const line of input.paidLines) {
      const hours = line.hours ? ` (${line.hours} hrs)` : "";
      lines.push(`  ${line.label}${hours}: ${money(line.amount)}`);
    }
    lines.push("");
  }

  lines.push(
    "Could you take a look and let us know? Happy to be told we have it " +
      "wrong — if there is something on our side we have missed, we would " +
      "like to correct it."
  );
  lines.push("");
  lines.push("Thank you,");
  lines.push("StuntListing Bookkeeper");

  return lines.join("\n");
}

/** Subject line for the same note. */
export function disputeSubject(showName: string, period: string): string {
  return `${showName} — payment query for ${period}`;
}
