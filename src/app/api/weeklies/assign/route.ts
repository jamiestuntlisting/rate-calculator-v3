import { NextResponse } from "next/server";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";
import { assignRecordToWeekly } from "@/lib/repos/weeklies";

/** POST — put one day into a weekly, or take it out (weeklyId: null). */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  try {
    const body = (await req.json()) as {
      recordId?: string;
      weeklyId?: string | null;
    };
    if (!body.recordId) {
      return NextResponse.json({ error: "recordId required" }, { status: 400 });
    }
    const userId = await getEffectiveUserId(auth.session);
    await assignRecordToWeekly(userId, body.recordId, body.weeklyId ?? null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("weekly assign error:", error);
    return NextResponse.json({ error: "Failed to assign" }, { status: 500 });
  }
}
