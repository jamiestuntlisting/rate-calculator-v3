import { NextResponse } from "next/server";
import { getSession, isAdminEmail } from "@/lib/auth";
import { findUserById, setUserTester } from "@/lib/repos/users";

/** PATCH /api/admin/users/[userId]/tester — { tester: boolean }. Admin only. */
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
    const body = (await request.json()) as { tester?: boolean };
    await setUserTester(userId, !!body.tester);
    return NextResponse.json({ tester: !!body.tester });
  } catch (error) {
    console.error("admin tester PATCH error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
