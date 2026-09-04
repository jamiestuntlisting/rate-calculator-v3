import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/auth";
import { listTranscriptionQueue } from "@/lib/repos/g-uploads";
import { getDb } from "@/lib/db";

/** The transcription queue across every member, admins only. */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (auth.session.role !== "admin" && !isAdminEmail(auth.session.email)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  try {
    const queue = await listTranscriptionQueue();
    // Name the member each upload belongs to, so the queue reads as people.
    const db = await getDb();
    const ids = [...new Set(queue.map((q) => q.queueUserId))];
    const emails = new Map<string, string>();
    if (ids.length > 0) {
      const placeholders = ids.map((_, i) => `?${i + 1}`).join(", ");
      const { results } = await db
        .prepare(`SELECT _id, email, firstName, lastName FROM users WHERE _id IN (${placeholders})`)
        .bind(...ids)
        .all<{ _id: string; email: string; firstName: string | null; lastName: string | null }>();
      for (const u of results ?? []) {
        emails.set(u._id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email);
      }
    }
    return NextResponse.json({
      queue: queue.map((q) => ({
        _id: q._id,
        userId: q.queueUserId,
        performer: emails.get(q.queueUserId) ?? q.queueUserId,
        displayTitle: q.displayTitle,
        path: q.path,
        thumbPath: q.thumbPath,
        workRecordId: q.workRecordId,
        contentType: q.contentType,
        rotation: q.rotation,
        kind: q.kind,
        createdAt: q.createdAt,
        requested: Boolean(q.transcriptionRequested),
      })),
    });
  } catch (error) {
    console.error("transcribe-queue error:", error);
    return NextResponse.json({ error: "Failed to load queue" }, { status: 500 });
  }
}
