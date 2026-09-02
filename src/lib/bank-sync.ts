import { plaidConfig, syncTransactions, type PlaidConfig } from "@/lib/plaid";
import {
  findBankConnection,
  listBankConnections,
  listBankDeposits,
  markBankSynced,
  saveDepositMatches,
  upsertBankDeposits,
} from "@/lib/repos/bank";
import { getUserPrefs } from "@/lib/repos/users";
import { listWorkRecords } from "@/lib/repos/work-records";
import { listWeeklies } from "@/lib/repos/weeklies";
import { paymentDueDate } from "@/lib/payment-due";
import { matchDeposits, DEFAULT_FLOOR, type ExpectedPayment } from "@/lib/bank-match";
import { shortDay } from "@/lib/format-date";

/**
 * Pull a member's new bank transactions, keep the deposits, and match
 * every deposit to the calculated pay it lines up with. Run for one
 * member from the page, and for every connected member by the daily
 * cron (scripts/cron-worker.js → /api/cron/bank-sync). Matching re-runs over all
 * deposits each time, because a day priced after the money landed
 * still deserves its match.
 */

export interface SyncSummary {
  added: number;
  removed: number;
  deposits: number;
  matched: number;
  residuals: number;
}

/** The smallest deposit that could be a paycheck, from the member's preferences. */
export async function depositFloorFor(userId: string): Promise<number> {
  const prefs = await getUserPrefs(userId);
  const floor = Number(prefs.depositFloor);
  return Number.isFinite(floor) && floor >= 0 ? floor : DEFAULT_FLOOR;
}

export async function syncUserDeposits(
  userId: string,
  config?: PlaidConfig | null
): Promise<SyncSummary | null> {
  const cfg = config ?? (await plaidConfig());
  if (!cfg) return null;
  const connection = await findBankConnection(userId);
  if (!connection) return null;
  const floor = await depositFloorFor(userId);

  const { added, removed, cursor } = await syncTransactions(cfg, connection.accessToken, connection.cursor);
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
  await upsertBankDeposits(userId, connection._id, deposits, removed);
  await markBankSynced(connection._id, cursor);

  const [{ records }, weeklies, all] = await Promise.all([
    listWorkRecords({ userId, limit: 5000 }),
    listWeeklies(userId),
    listBankDeposits(userId),
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
  await saveDepositMatches(userId, matches);
  return {
    added: deposits.length,
    removed: removed.length,
    deposits: all.length,
    matched: matches.filter((m) => m.matchKind === "day" || m.matchKind === "weekly").length,
    residuals: matches.filter((m) => m.matchKind === "residual").length,
  };
}

/** Every connected member, one after another; a failure on one does not stop the rest. */
export async function syncAllBanks(): Promise<{
  members: number;
  synced: number;
  failed: Array<{ userId: string; error: string }>;
}> {
  const config = await plaidConfig();
  const connections = await listBankConnections();
  if (!config) return { members: connections.length, synced: 0, failed: [] };
  let synced = 0;
  const failed: Array<{ userId: string; error: string }> = [];
  for (const c of connections) {
    try {
      if (await syncUserDeposits(c.userId, config)) synced += 1;
    } catch (e) {
      failed.push({ userId: c.userId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { members: connections.length, synced, failed };
}
