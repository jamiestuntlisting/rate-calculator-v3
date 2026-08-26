import { getDb, newId, nowIso } from "@/lib/db";

export interface GUploadRow {
  _id: string;
  userId: string;
  title: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  sha256: string;
  rotation: number;
  transcription: string | null;
  /** The tracker row this Exhibit G belongs to — one G is one work day. */
  workRecordId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GUpload extends Omit<GUploadRow, "transcription"> {
  /** Display title — falls back to the uploaded file's name. */
  displayTitle: string;
  path: string;
  transcription: unknown | null;
}

function toDoc(row: GUploadRow): GUpload {
  return {
    ...row,
    displayTitle: row.title.trim() || row.originalName,
    path: `/api/uploads/${row.filename}`,
    transcription: row.transcription ? JSON.parse(row.transcription) : null,
  };
}

export async function listGUploads(userId: string): Promise<GUpload[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT * FROM g_uploads WHERE userId = ?1 ORDER BY createdAt DESC"
    )
    .bind(userId)
    .all<GUploadRow>();
  return results.map(toDoc);
}

export async function findGUpload(
  id: string,
  userId: string
): Promise<GUpload | null> {
  const db = await getDb();
  const row = await db
    .prepare("SELECT * FROM g_uploads WHERE _id = ?1 AND userId = ?2")
    .bind(id, userId)
    .first<GUploadRow>();
  return row ? toDoc(row) : null;
}

/** Uniqueness check — same bytes already uploaded by this user. */
export async function findGUploadByHash(
  userId: string,
  sha256: string
): Promise<GUpload | null> {
  const db = await getDb();
  const row = await db
    .prepare("SELECT * FROM g_uploads WHERE userId = ?1 AND sha256 = ?2")
    .bind(userId, sha256)
    .first<GUploadRow>();
  return row ? toDoc(row) : null;
}

export interface CreateGUploadInput {
  userId: string;
  title: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  sha256: string;
  workRecordId?: string | null;
}

export async function createGUpload(
  input: CreateGUploadInput
): Promise<GUpload> {
  const db = await getDb();
  const now = nowIso();
  const row = await db
    .prepare(
      `INSERT INTO g_uploads
        (_id, userId, title, filename, originalName, contentType, size, sha256, rotation, transcription, workRecordId, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, NULL, ?9, ?10, ?10)
       RETURNING *`
    )
    .bind(
      newId(),
      input.userId,
      input.title,
      input.filename,
      input.originalName,
      input.contentType,
      input.size,
      input.sha256,
      input.workRecordId ?? null,
      now
    )
    .first<GUploadRow>();

  if (!row) throw new Error("Failed to create upload record");
  return toDoc(row);
}

export interface UpdateGUploadInput {
  title?: string;
  rotation?: number;
  transcription?: unknown;
  workRecordId?: string | null;
}

export async function updateGUpload(
  id: string,
  userId: string,
  patch: UpdateGUploadInput
): Promise<GUpload | null> {
  const db = await getDb();

  const sets: string[] = ["updatedAt = ?"];
  const params: unknown[] = [nowIso()];

  if (patch.title !== undefined) {
    sets.push("title = ?");
    params.push(String(patch.title));
  }
  if (patch.rotation !== undefined) {
    sets.push("rotation = ?");
    // Normalize to 0/90/180/270 so the UI never has to guess.
    params.push(((Math.round(Number(patch.rotation) / 90) * 90) % 360 + 360) % 360);
  }
  if (patch.workRecordId !== undefined) {
    sets.push("workRecordId = ?");
    params.push(patch.workRecordId);
  }
  if (patch.transcription !== undefined) {
    sets.push("transcription = ?");
    params.push(
      patch.transcription === null ? null : JSON.stringify(patch.transcription)
    );
  }

  params.push(id, userId);
  const row = await db
    .prepare(
      `UPDATE g_uploads SET ${sets.join(", ")} WHERE _id = ? AND userId = ? RETURNING *`
    )
    .bind(...params)
    .first<GUploadRow>();

  return row ? toDoc(row) : null;
}

export async function deleteGUpload(
  id: string,
  userId: string
): Promise<GUpload | null> {
  const db = await getDb();
  const row = await db
    .prepare(
      "DELETE FROM g_uploads WHERE _id = ?1 AND userId = ?2 RETURNING *"
    )
    .bind(id, userId)
    .first<GUploadRow>();
  return row ? toDoc(row) : null;
}

/** How many of this member's Exhibit Gs we transcribed since `sinceIso`. */
export async function countTranscribedSince(
  userId: string,
  sinceIso: string
): Promise<number> {
  const db = await getDb();
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM g_uploads
        WHERE userId = ?1 AND transcription IS NOT NULL AND updatedAt >= ?2`
    )
    .bind(userId, sinceIso)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
