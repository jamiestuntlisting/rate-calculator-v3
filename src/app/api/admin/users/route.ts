import { NextResponse } from "next/server";
import { listUsers, parseUserPrefs } from "@/lib/repos/users";
import { getSession } from "@/lib/auth";

/**
 * GET /api/admin/users
 * Returns all users. Admin only.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const users = await listUsers();

    return NextResponse.json({
      users: users.map((u) => ({
        id: u._id,
        stuntlistingUserId: u.stuntlistingUserId,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        tier: u.tier,
        role: u.role,
        lastLogin: u.lastLogin,
        imdbId: parseUserPrefs(u.prefs).imdbId ?? null,
      })),
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
