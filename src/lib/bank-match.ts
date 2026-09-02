/**
 * Lining bank deposits up with what the calculator says a performer
 * was owed. A paycheck deposit is NET — after withholding — while the
 * app's figure is GROSS, so the two never agree to the cent; what they
 * do agree on is timing. A SAG check is due by the Wednesday of the
 * second week after the work week (payment-due.ts), and payroll houses
 * hit that within a few days, so the match is made on the calendar
 * first and sanity-checked on the money: a deposit lands on an expected
 * payment when it falls within a few days of the due date and its
 * amount sits between a plausible net and the gross.
 *
 * Deposits that match nothing but come from a payroll house are called
 * residuals — residual checks come through the same payroll companies
 * and never have a work day behind them. Everything else stays
 * unmatched.
 */

/** Something the calculator expected a check for. */
export interface ExpectedPayment {
  id: string;
  kind: "day" | "weekly";
  label: string;
  /** The gross the app calculated. */
  amount: number;
  /** When the check was due, YYYY-MM-DD. */
  dueDate: string;
}

export interface DepositIn {
  transactionId: string;
  amount: number;
  date: string;
  name?: string | null;
}

export type MatchKind = "day" | "weekly" | "residual" | "unmatched";

export interface DepositMatch {
  transactionId: string;
  matchKind: MatchKind;
  matchId: string | null;
  matchLabel: string | null;
  expectedAmount: number | null;
  expectedDate: string | null;
  /** Deposit date minus due date, in days; negative is early. */
  daysOff: number | null;
  /** Deposit ÷ gross, when matched. */
  netRatio: number | null;
}

/** Deposits below this are not paychecks — a floor of about $500 to $1,000. */
export const DEFAULT_FLOOR = 500;
/** How far from the due date a check still counts as that check. */
export const MATCH_WINDOW_DAYS = 10;
/** Net pay is rarely under half the gross, and never over it. */
export const MIN_NET_RATIO = 0.5;
export const MAX_NET_RATIO = 1.001;

/** The payroll houses that pay SAG work — and residuals. */
export const PAYROLL_NAMES = [
  "entertainment partners",
  "ep payroll",
  "cast & crew",
  "cast and crew",
  "castandcrew",
  "team services",
  "gep",
  "greenslate",
  "media services",
  "extreme reach",
  "wrapbook",
  "sag-aftra",
  "residual",
];

export function looksLikePayroll(name: string | null | undefined): boolean {
  const n = (name ?? "").toLowerCase();
  return PAYROLL_NAMES.some((p) => n.includes(p));
}

const dayNumber = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || "");
  if (!m) return null;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000);
};

/**
 * Match each deposit to at most one expected payment, and each expected
 * payment to at most one deposit. Nearest by date wins; among equals,
 * the amount closest to the gross. Deposits under the floor are left
 * alone as unmatched without being called residuals.
 */
export function matchDeposits(
  deposits: DepositIn[],
  expected: ExpectedPayment[],
  floor: number = DEFAULT_FLOOR
): DepositMatch[] {
  const taken = new Set<string>();
  const out: DepositMatch[] = [];
  // Biggest deposits first: a weekly's check should not be stolen by a
  // day's because the day happened to be listed first.
  const ordered = [...deposits].sort((a, b) => b.amount - a.amount);
  for (const d of ordered) {
    const dDay = dayNumber(d.date);
    let best: { p: ExpectedPayment; days: number; ratio: number } | null = null;
    if (dDay != null && d.amount >= floor) {
      for (const p of expected) {
        if (taken.has(p.id) || p.amount <= 0) continue;
        const due = dayNumber(p.dueDate);
        if (due == null) continue;
        const days = dDay - due;
        if (Math.abs(days) > MATCH_WINDOW_DAYS) continue;
        const ratio = d.amount / p.amount;
        if (ratio < MIN_NET_RATIO || ratio > MAX_NET_RATIO) continue;
        if (
          !best ||
          Math.abs(days) < Math.abs(best.days) ||
          (Math.abs(days) === Math.abs(best.days) && ratio > best.ratio)
        ) {
          best = { p, days, ratio };
        }
      }
    }
    if (best) {
      taken.add(best.p.id);
      out.push({
        transactionId: d.transactionId,
        matchKind: best.p.kind,
        matchId: best.p.id,
        matchLabel: best.p.label,
        expectedAmount: best.p.amount,
        expectedDate: best.p.dueDate,
        daysOff: best.days,
        netRatio: Math.round(best.ratio * 1000) / 1000,
      });
    } else {
      out.push({
        transactionId: d.transactionId,
        matchKind: d.amount >= floor && looksLikePayroll(d.name) ? "residual" : "unmatched",
        matchId: null,
        matchLabel: null,
        expectedAmount: null,
        expectedDate: null,
        daysOff: null,
        netRatio: null,
      });
    }
  }
  // Back in the caller's order.
  const byId = new Map(out.map((m) => [m.transactionId, m]));
  return deposits.map((d) => byId.get(d.transactionId)!);
}
