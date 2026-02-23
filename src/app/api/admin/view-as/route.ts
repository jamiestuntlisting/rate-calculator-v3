import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

const VIEW_AS_COOKIE = "stl_view_as";

/**
 * GET /api/admin/view-as
 * Returns the current "view as" user info, or null if viewing own data.
 * Looks up the user from MongoDB so the client doesn't need a second request.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const viewAsUserId = cookieStore.get(VIEW_AS_COOKIE)?.value || null;

  if (!viewAsUserId) {
    return NextResponse.json({ viewAsUserId: null, viewAsUser: null });
  }

  // Look up the user so we can return their name for the banner
  try {
    await dbConnect();
    const user = await User.findById(viewAsUserId)
      .select("email firstName lastName")
      .lean();

    if (user) {
      return NextResponse.json({
        viewAsUserId,
        viewAsUser: {
          id: viewAsUserId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });
    }
  } catch {
    // Fall through — return the userId even if lookup fails
  }

  // Cookie set but user not found — return userId so banner still shows
  return NextResponse.json({
    viewAsUserId,
    viewAsUser: {
      id: viewAsUserId,
      email: "",
      firstName: "User",
      lastName: viewAsUserId.slice(-6),
    },
  });
}

/**
 * POST /api/admin/view-as
 * Set the "view as" cookie to view another user's data.
 * Body: { userId: string }
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { userId } = await request.json();

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const response = NextResponse.json({ success: true, viewAsUserId: userId });
  response.cookies.set(VIEW_AS_COOKIE, userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 hours max
    path: "/",
  });

  return response;
}

/**
 * DELETE /api/admin/view-as
 * Clear the "view as" cookie — return to viewing own data.
 */
export async function DELETE() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const response = NextResponse.json({ success: true, viewAsUserId: null });
  response.cookies.delete(VIEW_AS_COOKIE);

  return response;
}
