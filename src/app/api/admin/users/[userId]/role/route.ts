import { NextResponse } from "next/server";
import { getSession, isAdminEmail } from "@/lib/auth";
import { findUserById, setUserRole } from "@/lib/repos/users";

/**
 * PATCH /api/admin/users/[userId]/role — { role: "admin" | "user" }.
 * Admin only. An allowlisted admin (src/lib/admin-emails.ts) stays an
 * admin whatever is stored. The change reaches the member's session at
 * their next sign-in.
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
    const user = await findUserById(userId);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const body = (await request.json()) as { role?: string };
    if (body.role !== "admin" && body.role !== "user") {
      return NextResponse.json({ error: "role must be admin or user" }, { status: 400 });
    }
    if (body.role === "user" && isAdminEmail(user.email)) {
      return NextResponse.json(
        { error: "That address is on the code's admin list — edit src/lib/admin-emails.ts to change it." },
        { status: 409 }
      );
    }
    await setUserRole(userId, body.role);
    return NextResponse.json({ role: body.role });
  } catch (error) {
    console.error("admin role PATCH error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
