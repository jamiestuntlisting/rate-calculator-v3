import { getDb, nowIso } from "@/lib/db";

export type SuggestionKind = "show" | "character";

export interface NameSuggestion {
  kind: SuggestionKind;
  name: string;
  blocked: number;
  /** When blocked, the spelling people should use instead. */
  replacement: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Names offered for autocomplete: everything not blocked. */
export async function listSuggestions(kind: SuggestionKind): Promise<string[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT name FROM name_suggestions WHERE kind = ?1 AND blocked = 0 ORDER BY name"
    )
    .bind(kind)
    .all<{ name: string }>();
  return results.map((r) => r.name);
}

/** Every known name, blocked or not — the admin view. */
export async function listAllSuggestions(): Promise<NameSuggestion[]> {
  const db = await getDb();
  const { results } = await db
    .prepare("SELECT * FROM name_suggestions ORDER BY kind, blocked, name")
    .all<NameSuggestion>();
  return results;
}

/**
 * Record a name as entered, and return the spelling that should be stored.
 * A blocked spelling resolves to its replacement, so a typo someone types
 * never re-enters the suggestions or the data.
 */
export async function recordName(
  kind: SuggestionKind,
  raw: string
): Promise<string> {
  const name = (raw ?? "").trim();
  if (!name) return "";

  const db = await getDb();
  const existing = await db
    .prepare(
      "SELECT * FROM name_suggestions WHERE kind = ?1 AND name = ?2 COLLATE NOCASE"
    )
    .bind(kind, name)
    .first<NameSuggestion>();

  if (existing) {
    if (existing.blocked) return existing.replacement?.trim() || existing.name;
    // Reuse the stored capitalisation so spellings converge.
    return existing.name;
  }

  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO name_suggestions (kind, name, blocked, replacement, createdAt, updatedAt)
       VALUES (?1, ?2, 0, NULL, ?3, ?3)
       ON CONFLICT(kind, name) DO NOTHING`
    )
    .bind(kind, name, now)
    .run();
  return name;
}

/** Block a spelling, optionally naming the one to use instead. */
export async function blockName(
  kind: SuggestionKind,
  name: string,
  replacement: string | null
): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO name_suggestions (kind, name, blocked, replacement, createdAt, updatedAt)
       VALUES (?1, ?2, 1, ?3, ?4, ?4)
       ON CONFLICT(kind, name) DO UPDATE SET blocked = 1, replacement = ?3, updatedAt = ?4`
    )
    .bind(kind, name.trim(), replacement?.trim() || null, now)
    .run();
}

export async function unblockName(
  kind: SuggestionKind,
  name: string
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `UPDATE name_suggestions SET blocked = 0, replacement = NULL, updatedAt = ?3
        WHERE kind = ?1 AND name = ?2`
    )
    .bind(kind, name.trim(), nowIso())
    .run();
}

/** Seed the lists from names already used in work records. */
export async function backfillSuggestions(): Promise<number> {
  const db = await getDb();
  const now = nowIso();
  const [shows, characters] = await db.batch<unknown>([
    db
      .prepare(
        `INSERT INTO name_suggestions (kind, name, blocked, replacement, createdAt, updatedAt)
         SELECT DISTINCT 'show', TRIM(showName), 0, NULL, ?1, ?1
           FROM work_records WHERE TRIM(showName) <> ''
         ON CONFLICT(kind, name) DO NOTHING`
      )
      .bind(now),
    db
      .prepare(
        `INSERT INTO name_suggestions (kind, name, blocked, replacement, createdAt, updatedAt)
         SELECT DISTINCT 'character', TRIM(characterName), 0, NULL, ?1, ?1
           FROM work_records WHERE TRIM(characterName) <> ''
         ON CONFLICT(kind, name) DO NOTHING`
      )
      .bind(now),
  ]);
  return (shows.meta.changes ?? 0) + (characters.meta.changes ?? 0);
}
