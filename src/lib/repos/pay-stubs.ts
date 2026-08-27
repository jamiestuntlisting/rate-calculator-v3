import { getDb, newId, nowIso } from "@/lib/db";
import type { PayStubLine, PayStubScope } from "@/lib/pay-stub";
import { stubTotal } from "@/lib/pay-stub";
import type { WorkDocument } from "@/types";

export interface PayStub {
  _id: string;
  scope: PayStubScope;
  /** Set when the stub covers one work day. */
  workRecordId: string | null;
  /** The Sunday a weekly stub runs from. */
  weekStart: string | null;
  showName: string;
  lineItems: PayStubLine[];
  total: number;
  documents: WorkDocument[];
  createdAt: string;
  updatedAt: string;
}

interface Row {
  _id: string;
  scope: string;
  workRecordId: string | null;
  weekStart: string | null;
  showName: string;
  lineItems: string;
  total: number;
  documents: string;
  createdAt: string;
  updatedAt: string;
}

const toStub = (row: Row): PayStub => ({
  _id: row._id,
  scope: row.scope as PayStubScope,
  workRecordId: row.workRecordId,
  weekStart: row.weekStart,
  showName: row.showName,
  lineItems: JSON.parse(row.lineItems || "[]"),
  total: row.total,
  documents: JSON.parse(row.documents || "[]"),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** The stub for one work day, if there is one. */
export async function findStubForRecord(
  userId: string,
  workRecordId: string
): Promise<PayStub | null> {
  const db = await getDb();
  const row = await db
    .prepare(
      "SELECT * FROM pay_stubs WHERE userId = ?1 AND workRecordId = ?2 LIMIT 1"
    )
    .bind(userId, workRecordId)
    .first<Row>();
  return row ? toStub(row) : null;
}

/** The stub for one week of a weekly contract, if there is one. */
export async function findStubForWeek(
  userId: string,
  weekStart: string,
  showName: string
): Promise<PayStub | null> {
  const db = await getDb();
  const row = await db
    .prepare(
      `SELECT * FROM pay_stubs
        WHERE userId = ?1 AND scope = 'week' AND weekStart = ?2
          AND showName = ?3 COLLATE NOCASE
        LIMIT 1`
    )
    .bind(userId, weekStart, showName)
    .first<Row>();
  return row ? toStub(row) : null;
}

export interface SaveStubInput {
  scope: PayStubScope;
  workRecordId?: string | null;
  weekStart?: string | null;
  showName?: string;
  lineItems: PayStubLine[];
  documents?: WorkDocument[];
}

/**
 * Store a stub, replacing whatever covered the same day or week. The total
 * is computed here rather than trusted from the caller, so what is stored
 * always adds up to its own lines.
 */
export async function saveStub(
  userId: string,
  input: SaveStubInput
): Promise<PayStub> {
  const db = await getDb();
  const now = nowIso();

  const existing =
    input.scope === "day" && input.workRecordId
      ? await findStubForRecord(userId, input.workRecordId)
      : input.scope === "week" && input.weekStart
        ? await findStubForWeek(userId, input.weekStart, input.showName ?? "")
        : null;

  const id = existing?._id ?? newId();
  const lineItems = JSON.stringify(input.lineItems ?? []);
  const documents = JSON.stringify(input.documents ?? []);
  const total = stubTotal(input.lineItems ?? []);

  await db
    .prepare(
      `INSERT INTO pay_stubs
         (_id, userId, scope, workRecordId, weekStart, showName, lineItems,
          total, documents, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
       ON CONFLICT(_id) DO UPDATE SET
         lineItems = ?7, total = ?8, documents = ?9, updatedAt = ?10`
    )
    .bind(
      id,
      userId,
      input.scope,
      input.workRecordId ?? null,
      input.weekStart ?? null,
      input.showName ?? "",
      lineItems,
      total,
      documents,
      now
    )
    .run();

  const row = await db
    .prepare("SELECT * FROM pay_stubs WHERE _id = ?1")
    .bind(id)
    .first<Row>();
  if (!row) throw new Error("Failed to save pay stub");
  return toStub(row);
}

export async function deleteStub(userId: string, id: string): Promise<void> {
  const db = await getDb();
  await db
    .prepare("DELETE FROM pay_stubs WHERE _id = ?1 AND userId = ?2")
    .bind(id, userId)
    .run();
}
