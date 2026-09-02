import { NextResponse } from "next/server";
import { getSession, isAdminEmail } from "@/lib/auth";
import { findUserById, updateMembership } from "@/lib/repos/users";
import { findPlan, PLANS, type PlanId } from "@/lib/membership-plans";

const PLAN_IDS: PlanId[] = PLANS.map((p) => p.id);

/**
 * PATCH /api/admin/users/[userId]/membership — { planId }. Admin only.
 * Sets the member's tier by hand (tierOverride), which wins over Stripe
 * and the StuntListing profile until cleared.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "admin" && !isAdminEmail(session.email))) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const { userId } = await params;
    if (!(await findUserById(userId))) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const body = (await request.json()) as { planId?: PlanId };
    if (!body.planId || !PLAN_IDS.includes(body.planId)) {
      return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
    }
    const plan = findPlan(body.planId);
    await updateMembership(userId, plan.tier, plan.transcription);
    return NextResponse.json({ planId: body.planId, tier: plan.tier });
  } catch (error) {
    console.error("admin membership PATCH error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
