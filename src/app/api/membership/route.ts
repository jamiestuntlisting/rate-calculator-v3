import { NextResponse } from "next/server";
import { findUserById, updateMembership } from "@/lib/repos/users";
import { requireAuth } from "@/lib/api-auth";
import { createSession, setSessionCookie } from "@/lib/auth";
import { findPlan, planFor, type PlanId } from "@/lib/membership-plans";

/** GET /api/membership — the member's current plan. */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const user = await findUserById(auth.session.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      planId: planFor(user.tierOverride ?? user.tier, user.transcriptionAddOn === 1),
      tier: user.tierOverride ?? user.tier,
      transcriptionAddOn: user.transcriptionAddOn === 1,
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
    if (!planId || !["free", "plus", "plus_transcription"].includes(planId)) {
      return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
    }

    const plan = findPlan(planId);
    const user = await updateMembership(
      auth.session.userId,
      plan.tier,
      plan.transcriptionAddOn
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
      transcriptionAddOn: plan.transcriptionAddOn,
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
