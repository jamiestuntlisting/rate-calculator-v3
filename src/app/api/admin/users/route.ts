import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
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

    await dbConnect();

    const users = await User.find({})
      .select("stuntlistingUserId email firstName lastName tier role lastLogin")
      .sort({ lastLogin: -1 })
      .lean();

    return NextResponse.json({
      users: users.map((u) => ({
        id: u._id.toString(),
        stuntlistingUserId: u.stuntlistingUserId,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        tier: u.tier,
        role: u.role,
        lastLogin: u.lastLogin,
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
