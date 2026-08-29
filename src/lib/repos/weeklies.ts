import { getDb, newId, nowIso } from "@/lib/db";
import { RATES } from "@/lib/rate-constants";
import { DEFAULT_WEEK_STARTS_ON } from "@/lib/weekly/weeks";

/** The calendar-week window containing `date`, for a given week start. */
function weekWindowOf(date: string, weekStartsOn: number) {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)!;
  const utc = Date.UTC(+parsed[1], +parsed[2] - 1, +parsed[3]);
  const shift = (new Date(utc).getUTCDay() - weekStartsOn + 7) % 7;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return {
    start: iso(utc - shift * 86400000),
    end: iso(utc - shift * 86400000 + 6 * 86400000),
  };
}

export interface WeeklyRow {
  _id: string;
  userId: string;
  title: string;
  weekStart: string;
  weekStartsOn: number;
  agreement: string;
  weeklyRate: number;
  distantLocation: number;
  expectedAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaveWeeklyInput {
  title: string;
  weekStart: string;
  weekStartsOn: number;
  agreement: string;
  weeklyRate: number;
  distantLocation: boolean;
  expectedAmount: number;
  recordIds: string[];
}

/** The user's saved weeklies, newest week first. */
export async function listWeeklies(userId: string): Promise<WeeklyRow[]> {
  const db = await getDb();
  const { results } = await db
    .prepare("SELECT * FROM weeklies WHERE userId = ?1 ORDER BY weekStart DESC")
    .bind(userId)
    .all<WeeklyRow>();
  return results ?? [];
}

/**
 * Save a week as one contract. Saving the same title + week again updates
 * it in place rather than stacking a second copy — re-working a week is
 * normal, duplicate weeklies in the tracker are not.
 *
 * Membership is re-stamped from scratch: days picked into the week get its
 * weeklyId, days previously in it and no longer picked are released. A
 * member day with no real show name takes the weekly's title with a
 * "Day N" suffix so it can be told apart until it is transcribed — the
 * dates on untranscribed uploads are all the upload day, so the number is
 * the only honest label there is.
 */
export async function saveWeekly(
  userId: string,
  input: SaveWeeklyInput
): Promise<WeeklyRow> {
  const db = await getDb();
  const now = nowIso();

  // A weekly is named by the first day actually worked, so its weekStart
  // moves if an earlier day joins the week. Matching on the exact date
  // would then fork a second weekly for the same show and week — so the
  // match is by calendar-week bucket: any existing weekly for this title
  // whose start falls in the same payroll week is the one to update.
  const bucket = weekWindowOf(input.weekStart, input.weekStartsOn);

  const existing = await db
    .prepare(
      "SELECT * FROM weeklies WHERE userId = ?1 AND title = ?2 AND weekStart BETWEEN ?3 AND ?4"
    )
    .bind(userId, input.title, bucket.start, bucket.end)
    .first<WeeklyRow>();

  const id = existing?._id ?? newId();
  if (existing) {
    await db
      .prepare(
        "UPDATE weeklies SET weekStart = ?8, weekStartsOn = ?2, agreement = ?3, weeklyRate = ?4, distantLocation = ?5, expectedAmount = ?6, updatedAt = ?7 WHERE _id = ?1"
      )
      .bind(
        id,
        input.weekStartsOn,
        input.agreement,
        input.weeklyRate,
        input.distantLocation ? 1 : 0,
        input.expectedAmount,
        now,
        input.weekStart
      )
      .run();
    await db
      .prepare("UPDATE work_records SET weeklyId = NULL, updatedAt = ?2 WHERE weeklyId = ?1 AND userId = ?3")
      .bind(id, now, userId)
      .run();
  } else {
    await db
      .prepare(
        "INSERT INTO weeklies (_id, userId, title, weekStart, weekStartsOn, agreement, weeklyRate, distantLocation, expectedAmount, createdAt, updatedAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)"
      )
      .bind(
        id,
        userId,
        input.title,
        input.weekStart,
        input.weekStartsOn,
        input.agreement,
        input.weeklyRate,
        input.distantLocation ? 1 : 0,
        input.expectedAmount,
        now
      )
      .run();
  }

  // "other" is a negotiated deal, not a schedule — days keep the
  // workStatus they already have rather than taking a name the daily
  // engine has never heard of.
  const stampStatus = input.agreement in RATES ? input.agreement : null;

  let day = 0;
  for (const recordId of input.recordIds) {
    day += 1;
    const row = await db
      .prepare("SELECT showName FROM work_records WHERE _id = ?1 AND userId = ?2")
      .bind(recordId, userId)
      .first<{ showName: string }>();
    if (!row) continue;

    const unnamed =
      !row.showName.trim() ||
      /^Untranscribed Exhibit G \d+$/.test(row.showName) ||
      row.showName.startsWith(`${input.title} — Day `);

    if (unnamed && input.title.trim()) {
      await db
        .prepare(
          "UPDATE work_records SET weeklyId = ?2, weeklyContract = 1, contractLength = 'weekly', workStatus = COALESCE(?3, workStatus), showName = ?4, updatedAt = ?5 WHERE _id = ?1 AND userId = ?6"
        )
        .bind(recordId, id, stampStatus, `${input.title} — Day ${day}`, now, userId)
        .run();
    } else {
      await db
        .prepare(
          "UPDATE work_records SET weeklyId = ?2, weeklyContract = 1, contractLength = 'weekly', workStatus = COALESCE(?3, workStatus), updatedAt = ?4 WHERE _id = ?1 AND userId = ?5"
        )
        .bind(recordId, id, stampStatus, now, userId)
        .run();
    }
  }

  const saved = await db
    .prepare("SELECT * FROM weeklies WHERE _id = ?1")
    .bind(id)
    .first<WeeklyRow>();
  return saved!;
}

/**
 * Put one day into a weekly (or take it out), after the fact.
 *
 * The weekly page stamps a whole week at once; the tracker assigns days
 * one at a time as people tidy up history. An unnamed day joining a
 * weekly takes the weekly's title with the next free Day number, same as
 * a bulk save, so the tracker never shows an anonymous row inside a
 * named group.
 */
export async function assignRecordToWeekly(
  userId: string,
  recordId: string,
  weeklyId: string | null
): Promise<void> {
  const db = await getDb();
  const now = nowIso();

  if (weeklyId === null) {
    await db
      .prepare(
        "UPDATE work_records SET weeklyId = NULL, weeklyContract = 0, contractLength = 'daily', updatedAt = ?2 WHERE _id = ?1 AND userId = ?3"
      )
      .bind(recordId, now, userId)
      .run();
    return;
  }

  const weekly = await db
    .prepare("SELECT * FROM weeklies WHERE _id = ?1 AND userId = ?2")
    .bind(weeklyId, userId)
    .first<WeeklyRow>();
  if (!weekly) throw new Error("No such weekly");

  const row = await db
    .prepare("SELECT showName FROM work_records WHERE _id = ?1 AND userId = ?2")
    .bind(recordId, userId)
    .first<{ showName: string }>();
  if (!row) throw new Error("No such record");

  const unnamed =
    !row.showName.trim() ||
    /^Untranscribed Exhibit G \d+$/.test(row.showName) ||
    row.showName.startsWith(`${weekly.title} — Day `);

  const stampStatus = weekly.agreement in RATES ? weekly.agreement : null;

  if (unnamed) {
    const { results } = await db
      .prepare(
        "SELECT showName FROM work_records WHERE userId = ?1 AND weeklyId = ?2"
      )
      .bind(userId, weeklyId)
      .all<{ showName: string }>();
    let max = 0;
    for (const member of results ?? []) {
      const n = Number(/ — Day (\d+)$/.exec(member.showName)?.[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
    await db
      .prepare(
        "UPDATE work_records SET weeklyId = ?2, weeklyContract = 1, contractLength = 'weekly', workStatus = COALESCE(?3, workStatus), showName = ?4, updatedAt = ?5 WHERE _id = ?1 AND userId = ?6"
      )
      .bind(
        recordId,
        weeklyId,
        stampStatus,
        `${weekly.title} — Day ${max + 1}`,
        now,
        userId
      )
      .run();
  } else {
    await db
      .prepare(
        "UPDATE work_records SET weeklyId = ?2, weeklyContract = 1, contractLength = 'weekly', workStatus = COALESCE(?3, workStatus), updatedAt = ?4 WHERE _id = ?1 AND userId = ?5"
      )
      .bind(recordId, weeklyId, stampStatus, now, userId)
      .run();
  }
}

/**
 * Make a day marked "weekly" belong to a weekly object, immediately.
 *
 * Ticking Weekly on a day form used to set a flag and nothing else — no
 * weekly existed anywhere, so nothing showed in the tracker groups or on
 * the weekly page's saved list. This finds the weekly for the day's show
 * whose week contains the day (judged by each weekly's own week-start
 * setting), creates one if the show has none there, walks the weekly's
 * start date back when an earlier day joins, and stamps the record. Days
 * with no real show name are left alone: a weekly named after an
 * untranscribed upload would be junk, and those days can be assigned by
 * hand from the tracker once they have a title.
 */
export async function ensureWeeklyForRecord(
  userId: string,
  recordId: string
): Promise<WeeklyRow | null> {
  const db = await getDb();
  const now = nowIso();

  const record = await db
    .prepare(
      "SELECT _id, showName, workDate, workStatus, weeklyId FROM work_records WHERE _id = ?1 AND userId = ?2"
    )
    .bind(recordId, userId)
    .first<{
      _id: string;
      showName: string | null;
      workDate: string | null;
      workStatus: string | null;
      weeklyId: string | null;
    }>();
  if (!record || record.weeklyId) return null;

  const title = (record.showName ?? "").trim();
  if (!title || /^Untranscribed Exhibit G \d+$/.test(title)) return null;
  const date = (record.workDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const { results } = await db
    .prepare("SELECT * FROM weeklies WHERE userId = ?1 AND title = ?2")
    .bind(userId, title)
    .all<WeeklyRow>();
  let weekly =
    (results ?? []).find((w) => {
      const window = weekWindowOf(w.weekStart, w.weekStartsOn);
      return date >= window.start && date <= window.end;
    }) ?? null;

  if (weekly) {
    // The weekly is named by its first worked day.
    if (date < weekly.weekStart) {
      await db
        .prepare("UPDATE weeklies SET weekStart = ?2, updatedAt = ?3 WHERE _id = ?1")
        .bind(weekly._id, date, now)
        .run();
      weekly = { ...weekly, weekStart: date };
    }
  } else {
    const agreement =
      record.workStatus && record.workStatus in RATES
        ? record.workStatus
        : "theatrical_basic";
    weekly = {
      _id: newId(),
      userId,
      title,
      weekStart: date,
      weekStartsOn: DEFAULT_WEEK_STARTS_ON,
      agreement,
      weeklyRate: 0,
      distantLocation: 0,
      expectedAmount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db
      .prepare(
        "INSERT INTO weeklies (_id, userId, title, weekStart, weekStartsOn, agreement, weeklyRate, distantLocation, expectedAmount, createdAt, updatedAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)"
      )
      .bind(
        weekly._id,
        userId,
        title,
        date,
        weekly.weekStartsOn,
        agreement,
        0,
        0,
        0,
        now
      )
      .run();
  }

  await db
    .prepare(
      "UPDATE work_records SET weeklyId = ?2, updatedAt = ?3 WHERE _id = ?1 AND userId = ?4"
    )
    .bind(recordId, weekly._id, now, userId)
    .run();
  return weekly;
}

/** A day edited off a weekly contract leaves its weekly's membership. */
export async function releaseRecordFromWeekly(
  userId: string,
  recordId: string
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      "UPDATE work_records SET weeklyId = NULL, updatedAt = ?2 WHERE _id = ?1 AND userId = ?3 AND weeklyId IS NOT NULL"
    )
    .bind(recordId, nowIso(), userId)
    .run();
}
