import { getDb, newId, nowIso, toIso, b2i, i2b } from "@/lib/db";
import type { CalculationBreakdown, WorkDocument } from "@/types";

/** Raw D1 row (booleans as 0/1, nested structures as JSON TEXT). */
interface WorkRecordRow {
  _id: string;
  userId: string | null;
  workType: string;
  otherWorkCategory: string | null;
  showName: string;
  workDate: string;
  callTime: string | null;
  dismissOnSet: string | null;
  dismissMakeupWardrobe: string | null;
  ndMealIn: string | null;
  ndMealOut: string | null;
  firstMealStart: string | null;
  firstMealFinish: string | null;
  secondMealStart: string | null;
  secondMealFinish: string | null;
  stuntAdjustment: number;
  flatDayRate: number | null;
  weeklyContract: number;
  contracts: number;
  multipleEpisodeWeekly: number;
  forcedCall: number;
  isSixthDay: number;
  isSeventhDay: number;
  isHoliday: number;
  workStatus: string | null;
  characterName: string;
  notes: string;
  recordStatus: string;
  documents: string;
  calculation: string | null;
  paymentStatus: string;
  paidAmount: number;
  paidDate: string | null;
  expectedAmount: number;
  paymentDueDate: string | null;
  missingExhibitG: number;
  photos: string;
  createdAt: string;
  updatedAt: string;
}

/** API shape — identical to what the Mongoose `.lean()` docs serialized to. */
export interface WorkRecordDoc {
  _id: string;
  userId: string | null;
  workType: string;
  otherWorkCategory: string | null;
  showName: string;
  workDate: string;
  callTime: string | null;
  dismissOnSet: string | null;
  dismissMakeupWardrobe: string | null;
  ndMealIn: string | null;
  ndMealOut: string | null;
  firstMealStart: string | null;
  firstMealFinish: string | null;
  secondMealStart: string | null;
  secondMealFinish: string | null;
  stuntAdjustment: number;
  flatDayRate: number | null;
  weeklyContract: boolean;
  contracts: number;
  multipleEpisodeWeekly: boolean;
  forcedCall: boolean;
  isSixthDay: boolean;
  isSeventhDay: boolean;
  isHoliday: boolean;
  workStatus: string | null;
  characterName: string;
  notes: string;
  recordStatus: string;
  documents: WorkDocument[];
  calculation: CalculationBreakdown | null;
  paymentStatus: string;
  paidAmount: number;
  paidDate: string | null;
  expectedAmount: number;
  paymentDueDate: string | null;
  missingExhibitG: boolean;
  photos: string[];
  createdAt: string;
  updatedAt: string;
}

function toDoc(row: WorkRecordRow): WorkRecordDoc {
  return {
    _id: row._id,
    userId: row.userId,
    workType: row.workType,
    otherWorkCategory: row.otherWorkCategory,
    showName: row.showName,
    workDate: row.workDate,
    callTime: row.callTime,
    dismissOnSet: row.dismissOnSet,
    dismissMakeupWardrobe: row.dismissMakeupWardrobe,
    ndMealIn: row.ndMealIn,
    ndMealOut: row.ndMealOut,
    firstMealStart: row.firstMealStart,
    firstMealFinish: row.firstMealFinish,
    secondMealStart: row.secondMealStart,
    secondMealFinish: row.secondMealFinish,
    stuntAdjustment: row.stuntAdjustment,
    flatDayRate: row.flatDayRate ?? null,
    weeklyContract: i2b(row.weeklyContract),
    contracts: row.contracts ?? 1,
    multipleEpisodeWeekly: i2b(row.multipleEpisodeWeekly),
    forcedCall: i2b(row.forcedCall),
    isSixthDay: i2b(row.isSixthDay),
    isSeventhDay: i2b(row.isSeventhDay),
    isHoliday: i2b(row.isHoliday),
    workStatus: row.workStatus,
    characterName: row.characterName,
    notes: row.notes,
    recordStatus: row.recordStatus,
    documents: JSON.parse(row.documents || "[]"),
    calculation: row.calculation ? JSON.parse(row.calculation) : null,
    paymentStatus: row.paymentStatus,
    paidAmount: row.paidAmount,
    paidDate: row.paidDate,
    expectedAmount: row.expectedAmount,
    paymentDueDate: row.paymentDueDate,
    missingExhibitG: i2b(row.missingExhibitG),
    photos: JSON.parse(row.photos || "[]"),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Writable fields and how each serializes into its D1 column.
 * Unknown keys in incoming payloads are ignored (like Mongoose strict mode).
 */
const FIELD_SERIALIZERS: Record<string, (v: unknown) => unknown> = {
  workType: (v) => (v == null ? "sag_aftra" : String(v)),
  otherWorkCategory: (v) => (v == null ? null : String(v)),
  showName: (v) => String(v ?? ""),
  workDate: (v) => toIso(v),
  callTime: (v) => (v == null || v === "" ? null : String(v)),
  dismissOnSet: (v) => (v == null || v === "" ? null : String(v)),
  dismissMakeupWardrobe: (v) => (v == null || v === "" ? null : String(v)),
  ndMealIn: (v) => (v == null || v === "" ? null : String(v)),
  ndMealOut: (v) => (v == null || v === "" ? null : String(v)),
  firstMealStart: (v) => (v == null || v === "" ? null : String(v)),
  firstMealFinish: (v) => (v == null || v === "" ? null : String(v)),
  secondMealStart: (v) => (v == null || v === "" ? null : String(v)),
  secondMealFinish: (v) => (v == null || v === "" ? null : String(v)),
  stuntAdjustment: (v) => Number(v) || 0,
  // Null rather than zero: a flat deal either names a rate or does not exist.
  flatDayRate: (v) => (Number(v) > 0 ? Number(v) : null),
  weeklyContract: (v) => b2i(v),
  // A day is one contract unless told otherwise, never zero.
  contracts: (v) => Math.max(1, Math.floor(Number(v) || 1)),
  multipleEpisodeWeekly: (v) => b2i(v),
  forcedCall: (v) => b2i(v),
  isSixthDay: (v) => b2i(v),
  isSeventhDay: (v) => b2i(v),
  isHoliday: (v) => b2i(v),
  workStatus: (v) => (v == null || v === "" ? null : String(v)),
  characterName: (v) => String(v ?? ""),
  notes: (v) => String(v ?? ""),
  recordStatus: (v) => (v == null ? "complete" : String(v)),
  documents: (v) => JSON.stringify(Array.isArray(v) ? v : []),
  calculation: (v) => (v == null ? null : JSON.stringify(v)),
  paymentStatus: (v) => (v == null ? "unpaid" : String(v)),
  paidAmount: (v) => Number(v) || 0,
  paidDate: (v) => toIso(v),
  expectedAmount: (v) => Number(v) || 0,
  paymentDueDate: (v) => toIso(v),
  missingExhibitG: (v) => b2i(v),
  photos: (v) => JSON.stringify(Array.isArray(v) ? v : []),
};

const FIELD_NAMES = Object.keys(FIELD_SERIALIZERS);

export interface ListWorkRecordsOptions {
  userId: string;
  paymentStatus?: string | null;
  showNameLike?: string | null;
  recordStatus?: string | null;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

const SORTABLE = new Set([
  "workDate",
  "createdAt",
  "updatedAt",
  "showName",
  "paymentStatus",
  "recordStatus",
  "paymentDueDate",
  "expectedAmount",
  "paidAmount",
]);

export async function listWorkRecords(
  opts: ListWorkRecordsOptions
): Promise<{ records: WorkRecordDoc[]; total: number }> {
  const db = await getDb();

  const where: string[] = ["userId = ?"];
  const params: unknown[] = [opts.userId];

  if (opts.paymentStatus) {
    where.push("paymentStatus = ?");
    params.push(opts.paymentStatus);
  }
  if (opts.showNameLike) {
    where.push("showName LIKE ?");
    params.push(`%${opts.showNameLike}%`);
  }
  if (opts.recordStatus) {
    where.push("recordStatus = ?");
    params.push(opts.recordStatus);
  }

  const whereSql = where.join(" AND ");
  const sort = SORTABLE.has(opts.sort ?? "") ? (opts.sort as string) : "workDate";
  const dir = opts.order === "asc" ? "ASC" : "DESC";
  const limit = Math.max(1, opts.limit ?? 20);
  const offset = (Math.max(1, opts.page ?? 1) - 1) * limit;

  const [listRes, countRow] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM work_records WHERE ${whereSql} ORDER BY ${sort} ${dir}, _id LIMIT ? OFFSET ?`
      )
      .bind(...params, limit, offset)
      .all<WorkRecordRow>(),
    db
      .prepare(`SELECT COUNT(*) AS n FROM work_records WHERE ${whereSql}`)
      .bind(...params)
      .first<{ n: number }>(),
  ]);

  return {
    records: listRes.results.map(toDoc),
    total: countRow?.n ?? 0,
  };
}

export async function findWorkRecord(
  id: string,
  userId: string
): Promise<WorkRecordDoc | null> {
  const db = await getDb();
  const row = await db
    .prepare("SELECT * FROM work_records WHERE _id = ?1 AND userId = ?2")
    .bind(id, userId)
    .first<WorkRecordRow>();
  return row ? toDoc(row) : null;
}

export async function createWorkRecord(
  data: Record<string, unknown>,
  userId: string
): Promise<WorkRecordDoc> {
  const db = await getDb();
  const now = nowIso();

  const columns = ["_id", "userId", "createdAt", "updatedAt", ...FIELD_NAMES];
  const values: unknown[] = [newId(), userId, now, now];
  for (const field of FIELD_NAMES) {
    values.push(FIELD_SERIALIZERS[field](data[field]));
  }

  const placeholders = columns.map((_, i) => `?${i + 1}`).join(", ");
  const row = await db
    .prepare(
      `INSERT INTO work_records (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`
    )
    .bind(...values)
    .first<WorkRecordRow>();

  if (!row) throw new Error("Failed to create work record");
  return toDoc(row);
}

export async function updateWorkRecord(
  id: string,
  userId: string,
  patch: Record<string, unknown>
): Promise<WorkRecordDoc | null> {
  const db = await getDb();

  const sets: string[] = ["updatedAt = ?"];
  const params: unknown[] = [nowIso()];

  for (const field of FIELD_NAMES) {
    if (field in patch) {
      sets.push(`${field} = ?`);
      params.push(FIELD_SERIALIZERS[field](patch[field]));
    }
  }

  params.push(id, userId);
  const row = await db
    .prepare(
      `UPDATE work_records SET ${sets.join(", ")} WHERE _id = ? AND userId = ? RETURNING *`
    )
    .bind(...params)
    .first<WorkRecordRow>();

  return row ? toDoc(row) : null;
}

export async function deleteWorkRecord(
  id: string,
  userId: string
): Promise<boolean> {
  const db = await getDb();
  const res = await db
    .prepare("DELETE FROM work_records WHERE _id = ?1 AND userId = ?2")
    .bind(id, userId)
    .run();
  return res.meta.changes > 0;
}

/** Admin: list a user's records, optionally where `field` >= `since` (ISO). */
export async function listWorkRecordsForAdmin(
  userId: string,
  field: "workDate" | "updatedAt" | "createdAt",
  since: string | null
): Promise<WorkRecordDoc[]> {
  const db = await getDb();

  let sql = `SELECT * FROM work_records WHERE userId = ?1`;
  const params: unknown[] = [userId];
  if (since) {
    sql += ` AND ${field} >= ?2`;
    params.push(since);
  }
  sql += ` ORDER BY ${field} DESC`;

  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all<WorkRecordRow>();
  return results.map(toDoc);
}

/** Attach records that have no owner (legacy imports) to the given user. */
export async function assignOrphanWorkRecords(userId: string): Promise<number> {
  const db = await getDb();
  const res = await db
    .prepare(
      "UPDATE work_records SET userId = ?1, updatedAt = ?2 WHERE userId IS NULL"
    )
    .bind(userId, nowIso())
    .run();
  return res.meta.changes;
}
