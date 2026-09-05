import { getDb, newId, nowIso } from "@/lib/db";
import type { GUpload, GUploadRow } from "@/lib/repos/g-uploads";
import { toGUpload } from "@/lib/repos/g-uploads";

/**
 * Audits: a show whose run is being checked card by card. The audit
 * holds the show, the performers involved and a note; its Exhibit Gs
 * are g_uploads rows with auditId set (see migration 0032).
 */
export interface Audit {
  _id: string;
  createdBy: string;
  showName: string;
  performers: string;
  notes: string;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

export async function createAudit(input: {
  createdBy: string;
  showName: string;
  performers?: string;
  notes?: string;
}): Promise<Audit> {
  const db = await getDb();
  const now = nowIso();
  const row = await db
    .prepare(
      `INSERT INTO audits (_id, createdBy, showName, performers, notes, status, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, 'open', ?6, ?6) RETURNING *`
    )
    .bind(newId(), input.createdBy, input.showName.trim(), input.performers ?? "", input.notes ?? "", now)
    .first<Audit>();
  if (!row) throw new Error("Failed to create audit");
  return row;
}

export async function listAudits(): Promise<Array<Audit & { cards: number; transcribed: number }>> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT a.*,
              (SELECT COUNT(*) FROM g_uploads g WHERE g.auditId = a._id) AS cards,
              (SELECT COUNT(*) FROM g_uploads g WHERE g.auditId = a._id AND g.transcribedAt IS NOT NULL) AS transcribed
       FROM audits a ORDER BY a.createdAt DESC`
    )
    .all<Audit & { cards: number; transcribed: number }>();
  return results ?? [];
}

export async function findAudit(id: string): Promise<Audit | null> {
  const db = await getDb();
  return (await db.prepare("SELECT * FROM audits WHERE _id = ?1").bind(id).first<Audit>()) ?? null;
}

export async function updateAudit(
  id: string,
  patch: Partial<Pick<Audit, "showName" | "performers" | "notes" | "status">>
): Promise<Audit | null> {
  const db = await getDb();
  const sets: string[] = ["updatedAt = ?"];
  const params: unknown[] = [nowIso()];
  for (const key of ["showName", "performers", "notes", "status"] as const) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(patch[key]);
    }
  }
  params.push(id);
  return (
    (await db
      .prepare(`UPDATE audits SET ${sets.join(", ")} WHERE _id = ? RETURNING *`)
      .bind(...params)
      .first<Audit>()) ?? null
  );
}

/** The audit's cards, oldest first — the order they came in. */
export async function listAuditUploads(auditId: string): Promise<GUpload[]> {
  const db = await getDb();
  const { results } = await db
    .prepare("SELECT * FROM g_uploads WHERE auditId = ?1 ORDER BY createdAt ASC")
    .bind(auditId)
    .all<GUploadRow>();
  return (results ?? []).map(toGUpload);
}
