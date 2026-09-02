import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import {
  findUserById,
  mergeUserPrefs,
  parseUserPrefs,
  type UserPrefs,
} from "@/lib/repos/users";

/**
 * The signed-in member's own UI preferences — deliberately NOT the
 * effective (viewed-as) user: an admin transcribing on someone's
 * behalf keeps their own habits, and must not rewrite the member's.
 */

const TIME_ORDERS = ["chrono", "card"] as const;
const MODES = ["form", "guided"] as const;

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  try {
    const user = await findUserById(auth.session.userId);
    return NextResponse.json({ prefs: parseUserPrefs(user?.prefs) });
  } catch (error) {
    console.error("prefs GET error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    // Only known keys with legal values land; anything else is a 400
    // rather than a silent write of junk that every later read parses.
    const patch: UserPrefs = {};
    if (body.transcribeTimeOrder !== undefined) {
      const value = body.transcribeTimeOrder;
      if (!TIME_ORDERS.includes(value as (typeof TIME_ORDERS)[number])) {
        return NextResponse.json(
          { error: "Unknown time order" },
          { status: 400 }
        );
      }
      patch.transcribeTimeOrder = value as UserPrefs["transcribeTimeOrder"];
    }
    if (body.transcribeMode !== undefined) {
      const value = body.transcribeMode;
      if (!MODES.includes(value as (typeof MODES)[number])) {
        return NextResponse.json(
          { error: "Unknown transcribe mode" },
          { status: 400 }
        );
      }
      patch.transcribeMode = value as UserPrefs["transcribeMode"];
    }
    if (body.depositFloor !== undefined) {
      const floor = Number(body.depositFloor);
      if (!Number.isFinite(floor) || floor < 0 || floor > 100000) {
        return NextResponse.json({ error: "depositFloor must be a dollar amount" }, { status: 400 });
      }
      patch.depositFloor = Math.round(floor * 100) / 100;
    }
    const prefs = await mergeUserPrefs(auth.session.userId, patch);
    return NextResponse.json({ prefs });
  } catch (error) {
    console.error("prefs PUT error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
