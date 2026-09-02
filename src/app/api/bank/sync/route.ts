import { NextResponse } from "next/server";
import { requireTester } from "@/lib/bank-access";
import { plaidConfig, PlaidError, syncTransactions } from "@/lib/plaid";
import {
  findBankConnection,
  listBankDeposits,
  markBankSynced,
  saveDepositMatches,
  upsertBankDeposits,
} from "@/lib/repos/bank";
import { listWorkRecords } from "@/lib/repos/work-records";
import { listWeeklies } from "@/lib/repos/weeklies";
import { paymentDueDate } from "@/lib/payment-due";
import { matchDeposits, DEFAULT_FLOOR, type ExpectedPayment } from "@/lib/bank-match";
import { shortDay } from "@/lib/format-date";

/**
 * POST /api/bank/sync — pull new transactions, keep the deposits, and
 * match every deposit to the calculated pay it lines up with. Matching
 * re-runs over all deposits each time, because a day priced after the
 * money landed still deserves its match.
 */
export async function POST(request: Request) {
  const gate = await requireTester();
  if (gate.error) return gate.error;
  try {
    const config = await plaidConfig();
    if (!config) return NextResponse.json({ error: "Plaid is not configured" }, { status: 503 });
    const connection = await findBankConnection(gate.userId);
    if (!connection) return NextResponse.json({ error: "No bank connected" }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { floor?: number };
    const floor = Number.isFinite(body.floor) && body.floor! >= 0 ? body.floor! : DEFAULT_FLOOR;

    const { added, removed, cursor } = await syncTransactions(
      config,
      connection.accessToken,
      connection.cursor
    );
    // Plaid signs money IN as negative. Only credits are kept — this is
    // about what came in, never about what was spent.
    const deposits = added
      .filter((t) => t.amount < 0)
      .map((t) => ({
        transactionId: t.transaction_id,
        accountId: t.account_id,
        amount: Math.round(-t.amount * 100) / 100,
        date: t.date,
        name: t.merchant_name || t.name || null,
        pending: t.pending,
      }));
    await upsertBankDeposits(gate.userId, connection._id, deposits, removed);
    await markBankSynced(connection._id, cursor);

    const [{ records }, weeklies, all] = await Promise.all([
      listWorkRecords({ userId: gate.userId, limit: 5000 }),
      listWeeklies(gate.userId),
      listBankDeposits(gate.userId),
    ]);
    const expected: ExpectedPayment[] = [
      ...records
        .filter((r) => r.workType !== "other" && !r.weeklyId && (r.expectedAmount || 0) > 0)
        .map((r) => ({
          id: r._id,
          kind: "day" as const,
          label: `${r.showName} · ${shortDay(r.workDate)}`,
          amount: r.expectedAmount,
          dueDate: paymentDueDate(r.workDate) ?? r.workDate.slice(0, 10),
        })),
      ...weeklies
        .filter((w) => (w.expectedAmount || 0) > 0)
        .map((w) => ({
          id: w._id,
          kind: "weekly" as const,
          label: `${w.title} · week of ${shortDay(w.weekStart)}`,
          amount: w.expectedAmount,
          dueDate: paymentDueDate(w.weekStart) ?? w.weekStart,
        })),
    ];
    const matches = matchDeposits(
      all.map((d) => ({ transactionId: d.transactionId, amount: d.amount, date: d.date, name: d.name })),
      expected,
      floor
    );
    await saveDepositMatches(gate.userId, matches);
    return NextResponse.json({
      added: deposits.length,
      removed: removed.length,
      deposits: all.length,
      matched: matches.filter((m) => m.matchKind === "day" || m.matchKind === "weekly").length,
      residuals: matches.filter((m) => m.matchKind === "residual").length,
    });
  } catch (e) {
    console.error("bank sync error:", e);
    const message = e instanceof PlaidError ? `${e.code}: ${e.message}` : "Couldn't sync";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
