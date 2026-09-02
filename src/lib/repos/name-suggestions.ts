import { getDb, nowIso } from "@/lib/db";

export type SuggestionKind = "show" | "character";

export type SuggestionStatus = "pending" | "approved" | "ignored";

export interface NameSuggestion {
  kind: SuggestionKind;
  name: string;
  blocked: number;
  /** When blocked, the spelling people should use instead. */
  replacement: string | null;
  /** pending → not reviewed; approved → curated; ignored → not our problem. */
  status: SuggestionStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Names offered for autocomplete. Shows offer everything not blocked or
 * ignored — approval is monitoring, not a gate, or autocomplete would go
 * dark until an admin caught up. Character names offer only the approved
 * set: the standard roles are what typing should land on, and one-off
 * character names are noise there.
 */
export async function listSuggestions(kind: SuggestionKind): Promise<string[]> {
  const db = await getDb();
  const where =
    kind === "character"
      ? "s.kind = ?1 AND s.blocked = 0 AND s.status = 'approved'"
      : "s.kind = ?1 AND s.blocked = 0 AND s.status != 'ignored'";
  // Most-used first: the roles people actually log rise to the top of
  // the list, the rare ones sit under them, and ties fall to the name.
  const column = kind === "character" ? "characterName" : "showName";
  const { results } = await db
    .prepare(
      `SELECT s.name,
              (SELECT COUNT(*) FROM work_records w WHERE lower(w.${column}) = lower(s.name)) AS uses
         FROM name_suggestions s
        WHERE ${where}
        ORDER BY uses DESC, s.name`
    )
    .bind(kind)
    .all<{ name: string; uses: number }>();
  return results.map((r) => r.name);
}

/** Move a name between pending, approved and ignored. */
export async function setNameStatus(
  kind: SuggestionKind,
  name: string,
  status: SuggestionStatus
): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO name_suggestions (kind, name, blocked, replacement, status, createdAt, updatedAt)
       VALUES (?1, ?2, 0, NULL, ?3, ?4, ?4)
       ON CONFLICT(kind, name) DO UPDATE SET status = ?3, updatedAt = ?4`
    )
    .bind(kind, name.trim(), status, now)
    .run();
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
