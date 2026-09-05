import { NextResponse } from "next/server";
import { findUserById, updateMembership } from "@/lib/repos/users";
import { countTranscribedSince } from "@/lib/repos/g-uploads";
import { requireAuth } from "@/lib/api-auth";
import { createSession, setSessionCookie } from "@/lib/auth";
import { BOOKKEEPER_PLUS_CREDITS, findPlan, planFor, type PlanId } from "@/lib/membership-plans";

const PLAN_IDS: PlanId[] = ["free", "plus", "plus_per_g", "plus_transcription"];

/** First moment of the current month, for per-G usage. */
function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** GET /api/membership — the member's current plan and this month's usage. */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const user = await findUserById(auth.session.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const planId = planFor(
      user.tierOverride ?? user.tier,
      user.transcriptionBilling
    );

    // Credits used this month, when the plan has an allowance. Each
    // transcribed G counts as a daily until the transcription records
    // the contract it was on.
    const transcribedThisMonth =
      user.transcriptionBilling === "per_g"
        ? await countTranscribedSince(user._id, startOfMonthIso())
        : 0;

    return NextResponse.json({
      planId,
      tier: user.tierOverride ?? user.tier,
      transcriptionBilling: user.transcriptionBilling,
      transcribedThisMonth,
      creditsUsed: transcribedThisMonth,
      creditsIncluded: user.transcriptionBilling === "per_g" ? BOOKKEEPER_PLUS_CREDITS : null,
      /** True once billing exists and the tier is not hand-set. */
      billed: false,
    });
  } catch (error) {
    console.error("membership GET error:", error);
    return NextResponse.json(
      { error: "Failed to load membership" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/membership — choose a plan.
 * Nothing is charged: the chosen tier is stored as an override and the
 * session is reissued so unlocked features apply straight away.
 */
export async function PUT(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { planId } = (await request.json()) as { planId?: PlanId };
    if (!planId || !PLAN_IDS.includes(planId)) {
      return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
    }

    const plan = findPlan(planId);
    const user = await updateMembership(
      auth.session.userId,
      plan.tier,
      plan.transcription
    );
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Refresh the session so the new tier is in effect immediately.
    const token = await createSession({ ...auth.session, tier: plan.tier });
    await setSessionCookie(token);

    return NextResponse.json({
      planId,
      tier: plan.tier,
      transcriptionBilling: plan.transcription,
      billed: false,
    });
  } catch (error) {
    console.error("membership PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update membership" },
      { status: 500 }
    );
  }
}
