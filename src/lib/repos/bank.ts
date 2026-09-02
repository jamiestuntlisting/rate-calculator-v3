import { getDb, newId, nowIso } from "@/lib/db";
import type { DepositMatch } from "@/lib/bank-match";

export interface BankConnection {
  _id: string;
  userId: string;
  itemId: string;
  accessToken: string;
  institution: string | null;
  cursor: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankDeposit {
  _id: string;
  userId: string;
  connectionId: string;
  transactionId: string;
  accountId: string | null;
  amount: number;
  date: string;
  name: string | null;
  pending: number;
  matchKind: string;
  matchId: string | null;
  matchLabel: string | null;
  expectedAmount: number | null;
  expectedDate: string | null;
  daysOff: number | null;
  createdAt: string;
  updatedAt: string;
}

export async function findBankConnection(userId: string): Promise<BankConnection | null> {
  const db = await getDb();
  return db
    .prepare("SELECT * FROM bank_connections WHERE userId = ?1 ORDER BY createdAt DESC LIMIT 1")
    .bind(userId)
    .first<BankConnection>();
}

export async function createBankConnection(input: {
  userId: string;
  itemId: string;
  accessToken: string;
  institution: string | null;
}): Promise<BankConnection> {
  const db = await getDb();
  const now = nowIso();
  const row = await db
    .prepare(
      `INSERT INTO bank_connections (_id, userId, itemId, accessToken, institution, cursor, lastSyncedAt, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, ?6, ?6) RETURNING *`
    )
    .bind(newId(), input.userId, input.itemId, input.accessToken, input.institution, now)
    .first<BankConnection>();
  if (!row) throw new Error("Failed to save the connection");
  return row;
}

export async function markBankSynced(id: string, cursor: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db
    .prepare("UPDATE bank_connections SET cursor = ?1, lastSyncedAt = ?2, updatedAt = ?2 WHERE _id = ?3")
    .bind(cursor, now, id)
    .run();
}

export async function deleteBankConnection(userId: string, id: string): Promise<void> {
  const db = await getDb();
  await db.batch([
    db.prepare("DELETE FROM bank_deposits WHERE userId = ?1 AND connectionId = ?2").bind(userId, id),
    db.prepare("DELETE FROM bank_connections WHERE userId = ?1 AND _id = ?2").bind(userId, id),
  ]);
}

/** Add or refresh deposits from a sync; removed ones are dropped. */
export async function upsertBankDeposits(
  userId: string,
  connectionId: string,
  deposits: Array<{
    transactionId: string;
    accountId: string | null;
    amount: number;
    date: string;
    name: string | null;
    pending: boolean;
  }>,
  removed: string[]
): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  const statements = [
    ...deposits.map((d) =>
      db
        .prepare(
          `INSERT INTO bank_deposits (_id, userId, connectionId, transactionId, accountId, amount, date, name, pending, createdAt, updatedAt)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
           ON CONFLICT(transactionId) DO UPDATE SET amount = excluded.amount, date = excluded.date,
             name = excluded.name, pending = excluded.pending, updatedAt = excluded.updatedAt`
        )
        .bind(newId(), userId, connectionId, d.transactionId, d.accountId, d.amount, d.date, d.name, d.pending ? 1 : 0, now)
    ),
    ...removed.map((id) =>
      db.prepare("DELETE FROM bank_deposits WHERE userId = ?1 AND transactionId = ?2").bind(userId, id)
    ),
  ];
  if (statements.length) await db.batch(statements);
}

export async function listBankDeposits(userId: string): Promise<BankDeposit[]> {
  const db = await getDb();
  const { results } = await db
    .prepare("SELECT * FROM bank_deposits WHERE userId = ?1 ORDER BY date DESC")
    .bind(userId)
    .all<BankDeposit>();
  return results;
}

/** Write the matcher's verdicts back onto the deposits. */
export async function saveDepositMatches(userId: string, matches: DepositMatch[]): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  const statements = matches.map((m) =>
    db
      .prepare(
        `UPDATE bank_deposits SET matchKind = ?1, matchId = ?2, matchLabel = ?3, expectedAmount = ?4,
           expectedDate = ?5, daysOff = ?6, updatedAt = ?7 WHERE userId = ?8 AND transactionId = ?9`
      )
      .bind(m.matchKind, m.matchId, m.matchLabel, m.expectedAmount, m.expectedDate, m.daysOff, now, userId, m.transactionId)
  );
  if (statements.length) await db.batch(statements);
}
