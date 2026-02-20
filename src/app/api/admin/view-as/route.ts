import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { cookies } from "next/headers";

const VIEW_AS_COOKIE = "stl_view_as";

/**
 * GET /api/admin/view-as
 * Returns the current "view as" userId, or null if viewing own data.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const viewAsUserId = cookieStore.get(VIEW_AS_COOKIE)?.value || null;

  return NextResponse.json({ viewAsUserId });
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

  const cookieStore = await cookies();
  cookieStore.set(VIEW_AS_COOKIE, userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 hours max
    path: "/",
  });

  return NextResponse.json({ success: true, viewAsUserId: userId });
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

  const cookieStore = await cookies();
  cookieStore.delete(VIEW_AS_COOKIE);

  return NextResponse.json({ success: true, viewAsUserId: null });
}
