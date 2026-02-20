import { getSession, type SessionPayload } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Get the authenticated user from the session cookie.
 * Returns the session payload or a 401 NextResponse.
 */
export async function requireAuth(): Promise<
  | { session: SessionPayload; error?: never }
  | { session?: never; error: NextResponse }
> {
  const session = await getSession();

  if (!session) {
    return {
      error: NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      ),
    };
  }

  return { session };
}

/**
 * Build a MongoDB filter scoped to the current user.
 * Admins can see all records; regular users only see their own.
 */
export function userFilter(session: SessionPayload): Record<string, unknown> {
  if (session.role === "admin") {
    return {}; // admins see everything
  }
  return { userId: session.userId };
}
