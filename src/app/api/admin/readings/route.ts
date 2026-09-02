import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listGReadingScores, listGReadings } from "@/lib/repos/g-readings";
import { battingAverage } from "@/lib/g-reader/score";
import { PROMPT_VERSION, READER_MODEL } from "@/lib/g-reader/prompt";

/**
 * GET /api/admin/readings — the batting average of Claude's Exhibit G
 * readings: overall, per field, per prompt version, and a rolling
 * figure over the most recent scored readings, plus the readings
 * themselves. Admin only.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const [scores, readings] = await Promise.all([
      listGReadingScores(),
      listGReadings(200),
    ]);

    const byField = new Map<string, typeof scores>();
    const byVersion = new Map<string, typeof scores>();
    const byReading = new Map<string, typeof scores>();
    for (const s of scores) {
      byField.set(s.field, [...(byField.get(s.field) ?? []), s]);
      byVersion.set(s.promptVersion, [...(byVersion.get(s.promptVersion) ?? []), s]);
      byReading.set(s.readingId, [...(byReading.get(s.readingId) ?? []), s]);
    }
    // Scores are newest first; the rolling window is the last N readings.
    const readingOrder = [...byReading.keys()];
    const rolling = (n: number) =>
      battingAverage(readingOrder.slice(0, n).flatMap((id) => byReading.get(id) ?? []));

    return NextResponse.json({
      model: READER_MODEL,
      promptVersion: PROMPT_VERSION,
      overall: battingAverage(scores),
      rolling10: rolling(10),
      rolling20: rolling(20),
      scoredReadings: readingOrder.length,
      fields: [...byField.entries()].map(([field, rows]) => ({
        field,
        ...battingAverage(rows),
      })),
      versions: [...byVersion.entries()].map(([promptVersion, rows]) => ({
        promptVersion,
        readings: new Set(rows.map((r) => r.readingId)).size,
        ...battingAverage(rows),
      })),
      readings: readings.map((r) => ({
        id: r._id,
        gUploadId: r.gUploadId,
        uploadTitle: r.uploadTitle,
        userEmail: r.userEmail,
        model: r.model,
        servedModel: r.servedModel,
        promptVersion: r.promptVersion,
        error: r.error,
        durationMs: r.durationMs,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        createdAt: r.createdAt,
        scored: r.scored,
        reading: r.reading,
        scores: (byReading.get(r._id) ?? []).map((s) => ({
          field: s.field,
          readValue: s.readValue,
          finalValue: s.finalValue,
          outcome: s.outcome,
          delta: s.delta,
        })),
      })),
    });
  } catch (error) {
    console.error("Error loading readings:", error);
    return NextResponse.json({ error: "Failed to load readings" }, { status: 500 });
  }
}
