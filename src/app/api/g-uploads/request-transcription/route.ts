import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

/**
 * "Do the typing for me", for everything I have uploaded.
 *
 * Marks every one of the caller's not-yet-transcribed Exhibit G uploads as
 * transcription-requested, so the admin queue can see the ask. Asking is
 * free to do and idempotent; how transcription is billed lives on the user
 * (users.transcriptionBilling) and nothing is charged here — Stripe is not
 * wired yet, and a request must never quietly become a charge.
 */
export async function POST() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const db = await getDb();
    const result = await db
      .prepare(
        "UPDATE g_uploads SET transcriptionRequested = 1, updatedAt = ?1 " +
          "WHERE userId = ?2 AND transcription IS NULL AND transcriptionRequested = 0"
      )
      .bind(new Date().toISOString(), auth.session.userId)
      .run();

    const row = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM g_uploads WHERE userId = ?1 AND transcriptionRequested = 1 AND transcription IS NULL"
      )
      .bind(auth.session.userId)
      .first<{ n: number }>();

    return NextResponse.json({
      newlyRequested: result.meta.changes ?? 0,
      awaitingTranscription: row?.n ?? 0,
    });
  } catch (error) {
    console.error("request-transcription error:", error);
    return NextResponse.json({ error: "Failed to request" }, { status: 500 });
  }
}
