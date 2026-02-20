import { getSession, type SessionPayload } from "@/lib/auth";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const VIEW_AS_COOKIE = "stl_view_as";

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
 * Build a MongoDB filter scoped to the effective user.
 *
 * - Regular users: always scoped to their own userId
 * - Admins: scoped to their own userId by default.
 *   If the admin has set a "view as" cookie, scope to that userId instead.
 */
export async function userFilter(session: SessionPayload): Promise<Record<string, unknown>> {
  // Regular users always see only their own data
  if (session.role !== "admin") {
    return { userId: session.userId };
  }

  // Admins: check for "view as" cookie
  const cookieStore = await cookies();
  const viewAsUserId = cookieStore.get(VIEW_AS_COOKIE)?.value;

  if (viewAsUserId) {
    return { userId: viewAsUserId };
  }

  // Default: admin sees their own data
  return { userId: session.userId };
}

/**
 * Get the effective userId for creating records.
 * If admin is viewing as another user, new records are created
 * under the viewed user's account (so data belongs to that member).
 */
export async function getCreateUserId(session: SessionPayload): Promise<string> {
  if (session.role === "admin") {
    const cookieStore = await cookies();
    const viewAsUserId = cookieStore.get(VIEW_AS_COOKIE)?.value;
    if (viewAsUserId) {
      return viewAsUserId;
    }
  }
  return session.userId;
}
