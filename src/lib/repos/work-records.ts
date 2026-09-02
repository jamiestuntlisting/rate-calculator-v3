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
  threeDayLength: string | null;
  paymentFlag: string | null;
  weeklyContract: number;
  contractLength: string | null;
  weeklyId: string | null;
  contracts: number;
  multipleEpisodeWeekly: number;
  forcedCall: number;
  isSixthDay: number;
  isSeventhDay: number;
  isHoliday: number;
  workStatus: string | null;
  characterName: string;
  actorDoubled: string | null;
  notes: string;
  recordStatus: string;
  /** The Google Calendar event mirroring this day, once written. */
  googleEventId: string | null;
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
  threeDayLength: string | null;
  paymentFlag: "late" | "done" | null;
  weeklyContract: boolean;
  /** daily | three_day | weekly — how long the deal runs. */
  contractLength: string | null;
  /** The saved weekly this day is grouped under, if any. Repo-managed. */
  weeklyId: string | null;
  contracts: number;
  multipleEpisodeWeekly: boolean;
  forcedCall: boolean;
  isSixthDay: boolean;
  isSeventhDay: boolean;
  isHoliday: boolean;
  workStatus: string | null;
  characterName: string;
  actorDoubled: string | null;
  notes: string;
  recordStatus: string;
  googleEventId: string | null;
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
    threeDayLength: row.threeDayLength ?? null,
    paymentFlag:
      row.paymentFlag === "late" || row.paymentFlag === "done"
        ? row.paymentFlag
        : null,
    weeklyContract: i2b(row.weeklyContract),
    // NULL means the length was never stated — such a day calculates as
    // a daily but may still be pulled into a weekly. 'daily' is a choice.
    contractLength:
      row.contractLength === "daily" ||
      row.contractLength === "weekly" ||
      row.contractLength === "three_day"
        ? row.contractLength
        : null,
    weeklyId: row.weeklyId ?? null,
    contracts: row.contracts ?? 1,
    multipleEpisodeWeekly: i2b(row.multipleEpisodeWeekly),
    forcedCall: i2b(row.forcedCall),
    isSixthDay: i2b(row.isSixthDay),
    isSeventhDay: i2b(row.isSeventhDay),
    isHoliday: i2b(row.isHoliday),
    workStatus: row.workStatus,
    characterName: row.characterName,
    actorDoubled: row.actorDoubled ?? null,
    notes: row.notes,
    recordStatus: row.recordStatus,
    googleEventId: row.googleEventId ?? null,
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
  threeDayLength: (v) => (v === "short" || v === "long" ? v : null),
  // A human mark, never derived: 'late' is being chased, 'done' is closed.
  paymentFlag: (v) => (v === "late" || v === "done" ? v : null),
  weeklyContract: (v) => b2i(v),
  // 'daily' only when actually chosen; anything else stores as unset.
  contractLength: (v) =>
    v === "three_day" || v === "weekly" || v === "daily" ? v : null,
  // A day is one contract unless told otherwise, never zero.
  contracts: (v) => Math.max(1, Math.floor(Number(v) || 1)),
  multipleEpisodeWeekly: (v) => b2i(v),
  forcedCall: (v) => b2i(v),
  isSixthDay: (v) => b2i(v),
  isSeventhDay: (v) => b2i(v),
  isHoliday: (v) => b2i(v),
  workStatus: (v) => (v == null || v === "" ? null : String(v)),
  characterName: (v) => String(v ?? ""),
  // Only a stunt double has one; an empty box stores as nothing.
  actorDoubled: (v) => {
    const s = String(v ?? "").trim();
    return s ? s : null;
  },
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

/**
 * The highest number any of this user's placeholder titles has reached.
 * Ten Exhibit Gs photographed in one sitting all land on the same date,
 * and without a number in the title the tracker shows ten identical rows —
 * the number is the only thing telling them apart until each is
 * transcribed and takes its real show name. The max rather than the count,
 * so a number is never reissued while an older placeholder still holds it.
 */
/**
 * The shows this member actually worked in the last `days` days, most
 * recently worked first. This feeds the Show autocomplete: the job
 * being logged is almost always one of the last few jobs, and a
 * ten-year alphabetical catalogue buried it. Placeholder titles stay
 * out; typing an older show still works — this is only what is offered.
 */
export async function recentShowNames(
  userId: string,
  days = 60
): Promise<string[]> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - days * 86400000)
    .toISOString()
    .slice(0, 10);
  const { results } = await db
    .prepare(
      `SELECT showName, MAX(workDate) AS latest FROM work_records
       WHERE userId = ?1 AND workDate >= ?2 AND TRIM(showName) != ''
         AND showName NOT LIKE 'Untranscribed Exhibit G %'
         AND showName NOT LIKE '% \u2014 Day %'
       GROUP BY showName ORDER BY latest DESC`
    )
    .bind(userId, cutoff)
    .all<{ showName: string }>();
  return results.map((r) => r.showName);
}

export async function maxUntranscribedTitle(userId: string): Promise<number> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT showName FROM work_records WHERE userId = ?1 AND showName LIKE 'Untranscribed Exhibit G%'"
    )
    .bind(userId)
    .all<{ showName: string }>();
  let max = 0;
  for (const row of results ?? []) {
    const n = Number(/^Untranscribed Exhibit G (\d+)$/.exec(row.showName)?.[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
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

/** Remember the calendar event a day was mirrored to. */
export async function setWorkRecordEventId(
  id: string,
  userId: string,
  googleEventId: string | null
): Promise<void> {
  const db = await getDb();
  await db
    .prepare("UPDATE work_records SET googleEventId = ?1 WHERE _id = ?2 AND userId = ?3")
    .bind(googleEventId, id, userId)
    .run();
}
