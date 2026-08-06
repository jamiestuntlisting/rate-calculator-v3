import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Access to Cloudflare bindings (D1 database, R2 bucket).
 * Works in `next dev` (via initOpenNextCloudflareForDev), `wrangler dev`,
 * and deployed Workers.
 */
export async function getEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}

/** The D1 database holding all app data. */
export async function getDb(): Promise<D1Database> {
  return (await getEnv()).DB;
}

/** The R2 bucket holding uploaded documents/photos. */
export async function getUploadsBucket(): Promise<R2Bucket> {
  return (await getEnv()).UPLOADS;
}

/** New document id — UUID string stored in `_id` columns. */
export function newId(): string {
  return crypto.randomUUID();
}

/** Current time as ISO-8601 UTC string (D1 date storage format). */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Normalize a date-ish value ("YYYY-MM-DD", ISO string, Date, timestamp)
 * to a full ISO-8601 UTC string, or null when absent/invalid.
 * Matches how Mongoose casted these fields to Date before.
 */
export function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value as string | number | Date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** SQLite boolean helpers (stored as INTEGER 0/1). */
export function b2i(value: unknown): number {
  return value ? 1 : 0;
}

export function i2b(value: unknown): boolean {
  return value === 1 || value === true;
}
