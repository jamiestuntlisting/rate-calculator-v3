import { NextResponse } from "next/server";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";
import { listWeeklies, saveWeekly } from "@/lib/repos/weeklies";

/** GET /api/weeklies — the saved weekly contracts, newest first. */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  try {
    const userId = await getEffectiveUserId(auth.session);
    return NextResponse.json({ weeklies: await listWeeklies(userId) });
  } catch (error) {
    console.error("weeklies GET error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

/** POST /api/weeklies — save one week as a contract, grouping its days. */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  try {
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    const weekStart = String(body.weekStart ?? "");
    const recordIds = Array.isArray(body.recordIds)
      ? body.recordIds.filter((x: unknown): x is string => typeof x === "string")
      : [];
    if (!title) {
      return NextResponse.json({ error: "A show title is required" }, { status: 400 });
    }
    // Days are optional: a weekly can be created bare from the tracker and
    // have its days assigned to it one at a time afterwards.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: "A start date is required" }, { status: 400 });
    }
    const userId = await getEffectiveUserId(auth.session);
    const weekly = await saveWeekly(userId, {
      title,
      weekStart,
      weekStartsOn: Math.min(6, Math.max(0, Math.floor(Number(body.weekStartsOn) || 1))),
      agreement: String(body.agreement || "theatrical_basic"),
      weeklyRate: Number(body.weeklyRate) || 0,
      distantLocation: Boolean(body.distantLocation),
      expectedAmount: Number(body.expectedAmount) || 0,
      recordIds,
    });
    return NextResponse.json(weekly, { status: 201 });
  } catch (error) {
    console.error("weeklies POST error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
