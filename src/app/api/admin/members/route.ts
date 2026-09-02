import { NextResponse } from "next/server";
import { getSession, isAdminEmail } from "@/lib/auth";
import { listMemberStats } from "@/lib/repos/users";
import { isTestUser } from "@/lib/test-users";
import { planFor, type Plan, type TranscriptionBilling } from "@/lib/membership-plans";
type Tier = Plan["tier"];

/** GET /api/admin/members — who is using the service, and how much. Admin only. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session || (session.role !== "admin" && !isAdminEmail(session.email))) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const members = await listMemberStats();
    return NextResponse.json({
      members: members.map((m) => ({
        ...m,
        tester: !!m.tester || isTestUser(m.email),
        /** On the code's seed list: an admin cannot switch that off here. */
        seeded: isTestUser(m.email),
        /** Admin by the code's allowlist: cannot be demoted here. */
        seededAdmin: isAdminEmail(m.email),
        role: isAdminEmail(m.email) ? "admin" : m.role,
        planId: planFor(
          (m.tierOverride || m.tier || "free") as Tier,
          (m.transcriptionBilling as TranscriptionBilling) ?? null
        ),
      })),
    });
  } catch (error) {
    console.error("admin members GET error:", error);
    return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
  }
}
