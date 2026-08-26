/**
 * The reference ShowBiz SAG Cards export the weekly bench runs by default.
 *
 * The export is real payroll: named performers, their productions and what
 * they were paid. This repository is public, so it is kept in D1 — under
 * `app_config`, gzipped and base64'd across a few rows — rather than
 * committed here. Nothing about it reaches the browser except through the
 * admin-authenticated route that reads it.
 *
 * A database without those rows is fine: the bench just opens empty and
 * waits for someone to pick a file.
 */

import { getDb } from "@/lib/db";
import { SHOWBIZ_SAMPLE } from "./showbiz-sample-meta";

export { SHOWBIZ_SAMPLE };

/** How many rows the base64 is split over, and where they live. */
const PART_KEY_PREFIX = "showbiz_sample_";
const PART_COUNT_KEY = "showbiz_sample_parts";
const FILENAME_KEY = "showbiz_sample_filename";

/** Kept under D1's per-statement ceiling with room to spare. */
const PART_SIZE = 22000;

async function readBase64(): Promise<string | null> {
  const db = await getDb();

  const countRow = await db
    .prepare("SELECT value FROM app_config WHERE key = ?1")
    .bind(PART_COUNT_KEY)
    .first<{ value: string }>();
  const parts = Number.parseInt(countRow?.value ?? "", 10);
  if (!Number.isFinite(parts) || parts <= 0) return null;

  const keys = Array.from({ length: parts }, (_, i) => `${PART_KEY_PREFIX}${i}`);
  const placeholders = keys.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db
    .prepare(
      `SELECT key, value FROM app_config WHERE key IN (${placeholders})`
    )
    .bind(...keys)
    .all<{ key: string; value: string }>();

  if (results.length !== parts) return null;

  // Order by the index in the key, not by whatever the query returned.
  const byKey = new Map(results.map((r) => [r.key, r.value]));
  return keys.map((k) => byKey.get(k) ?? "").join("");
}

/**
 * The bundled export as CSV text, or null when the database has not been
 * seeded with one.
 */
export async function readShowbizSample(): Promise<string | null> {
  const base64 = await readBase64();
  if (!base64) return null;

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/** The name of whatever export is currently stored, if any. */
export async function readShowbizSampleName(): Promise<string | null> {
  const db = await getDb();
  const row = await db
    .prepare("SELECT value FROM app_config WHERE key = ?1")
    .bind(FILENAME_KEY)
    .first<{ value: string }>();
  return row?.value ?? null;
}

/**
 * Store a CSV as the reference export, replacing whatever was there.
 *
 * Gzipped first — a raw export is around a megabyte, which is more than a
 * single D1 row wants — then base64'd and split across rows.
 */
export async function writeShowbizSample(
  csv: string,
  filename: string
): Promise<void> {
  const compressed = new Blob([csv])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer());

  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);

  const parts: string[] = [];
  for (let i = 0; i < base64.length; i += PART_SIZE) {
    parts.push(base64.slice(i, i + PART_SIZE));
  }

  const db = await getDb();
  const upsert = (key: string, value: string) =>
    db
      .prepare(
        `INSERT INTO app_config (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2`
      )
      .bind(key, value);

  // Clear any longer previous export first, so stale trailing rows cannot be
  // read back as part of the new one.
  await db
    .prepare(`DELETE FROM app_config WHERE key LIKE '${PART_KEY_PREFIX}%'`)
    .run();

  await db.batch([
    ...parts.map((part, i) => upsert(`${PART_KEY_PREFIX}${i}`, part)),
    upsert(PART_COUNT_KEY, String(parts.length)),
    upsert(FILENAME_KEY, filename),
  ]);
}
