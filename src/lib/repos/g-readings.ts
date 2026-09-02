import { getDb, newId, nowIso } from "@/lib/db";
import type { Reading } from "@/lib/g-reader/schema";
import type { FieldScore } from "@/lib/g-reader/score";

/**
 * Claude's readings of Exhibit Gs and how each scored — the data behind
 * the batting average on /admin/readings. A reading is one attempt on
 * one upload; scores are one row per judged field, written when the
 * performer marks the G done and replaced if they reopen and finish it
 * again.
 */

export interface GReadingRow {
  _id: string;
  gUploadId: string;
  userId: string;
  model: string;
  servedModel: string | null;
  promptVersion: string;
  reading: string | null;
  error: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
}

export interface GReading extends Omit<GReadingRow, "reading"> {
  reading: Reading | null;
}

const toDoc = (row: GReadingRow): GReading => ({
  ...row,
  reading: row.reading ? (JSON.parse(row.reading) as Reading) : null,
});

export async function createGReading(input: {
  gUploadId: string;
  userId: string;
  model: string;
  servedModel?: string | null;
  promptVersion: string;
  reading: Reading | null;
  error?: string | null;
  durationMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): Promise<GReading> {
  const db = await getDb();
  const row = await db
    .prepare(
      `INSERT INTO g_readings
        (_id, gUploadId, userId, model, servedModel, promptVersion, reading, error, durationMs, inputTokens, outputTokens, createdAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
       RETURNING *`
    )
    .bind(
      newId(),
      input.gUploadId,
      input.userId,
      input.model,
      input.servedModel ?? null,
      input.promptVersion,
      input.reading ? JSON.stringify(input.reading) : null,
      input.error ?? null,
      input.durationMs ?? null,
      input.inputTokens ?? null,
      input.outputTokens ?? null,
      nowIso()
    )
    .first<GReadingRow>();
  if (!row) throw new Error("Failed to record reading");
  return toDoc(row);
}

/** The newest reading of an upload, error or not. */
export async function latestGReading(
  gUploadId: string,
  userId: string
): Promise<GReading | null> {
  const db = await getDb();
  const row = await db
    .prepare(
      "SELECT * FROM g_readings WHERE gUploadId = ?1 AND userId = ?2 ORDER BY createdAt DESC LIMIT 1"
    )
    .bind(gUploadId, userId)
    .first<GReadingRow>();
  return row ? toDoc(row) : null;
}

/** Replace a reading's scores with a fresh judgement. */
export async function replaceGReadingScores(
  reading: Pick<GReading, "_id" | "gUploadId" | "userId" | "promptVersion">,
  scores: FieldScore[]
): Promise<void> {
  const db = await getDb();
  const at = nowIso();
  const statements = [
    db.prepare("DELETE FROM g_reading_scores WHERE readingId = ?1").bind(reading._id),
    ...scores.map((s) =>
      db
        .prepare(
          `INSERT INTO g_reading_scores
            (_id, readingId, gUploadId, userId, promptVersion, field, readValue, finalValue, outcome, delta, scoredAt)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
        )
        .bind(
          newId(),
          reading._id,
          reading.gUploadId,
          reading.userId,
          reading.promptVersion,
          s.field,
          s.readValue,
          s.finalValue,
          s.outcome,
          s.delta,
          at
        )
    ),
  ];
  await db.batch(statements);
}

export interface GReadingScoreRow {
  _id: string;
  readingId: string;
  gUploadId: string;
  userId: string;
  promptVersion: string;
  field: string;
  readValue: string | null;
  finalValue: string | null;
  outcome: string;
  delta: number | null;
  scoredAt: string;
}

/** Every score, newest first — the analytics page works from these. */
export async function listGReadingScores(limit = 5000): Promise<GReadingScoreRow[]> {
  const db = await getDb();
  const { results } = await db
    .prepare("SELECT * FROM g_reading_scores ORDER BY scoredAt DESC LIMIT ?1")
    .bind(limit)
    .all<GReadingScoreRow>();
  return results;
}

/** Recent readings with the upload's title, newest first. */
export async function listGReadings(limit = 100): Promise<
  Array<GReading & { uploadTitle: string; scored: boolean; userEmail: string | null }>
> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT r.*, COALESCE(NULLIF(u.title, ''), u.originalName, '') AS uploadTitle,
              us.email AS userEmail,
              EXISTS(SELECT 1 FROM g_reading_scores s WHERE s.readingId = r._id) AS scored
         FROM g_readings r
         LEFT JOIN g_uploads u ON u._id = r.gUploadId
         LEFT JOIN users us ON us._id = r.userId
        ORDER BY r.createdAt DESC LIMIT ?1`
    )
    .bind(limit)
    .all<GReadingRow & { uploadTitle: string; scored: number; userEmail: string | null }>();
  return results.map((row) => ({
    ...toDoc(row),
    uploadTitle: row.uploadTitle,
    scored: !!row.scored,
    userEmail: row.userEmail,
  }));
}
