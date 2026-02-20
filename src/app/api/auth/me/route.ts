import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

/**
 * GET /api/auth/me
 * Returns the current session user, or 401 if not authenticated.
 */
export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: session.userId,
      stuntlistingUserId: session.stuntlistingUserId,
      email: session.email,
      firstName: session.firstName,
      lastName: session.lastName,
      tier: session.tier,
      role: session.role,
    },
  });
}
