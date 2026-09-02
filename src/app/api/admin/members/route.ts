import { NextResponse } from "next/server";
import { getSession, isAdminEmail } from "@/lib/auth";
import { listMemberStats } from "@/lib/repos/users";
import { isTestUser } from "@/lib/test-users";

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
      })),
    });
  } catch (error) {
    console.error("admin members GET error:", error);
    return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
  }
}
