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
 * Resolve the userId whose data this request operates on.
 *
 * - Regular users: always their own userId
 * - Admins: their own userId by default; if the admin has set a
 *   "view as" cookie, that userId instead (reads AND writes, so records
 *   created while viewing-as belong to the viewed member).
 */
export async function getEffectiveUserId(
  session: SessionPayload
): Promise<string> {
  if (session.role === "admin") {
    const cookieStore = await cookies();
    const viewAsUserId = cookieStore.get(VIEW_AS_COOKIE)?.value;
    if (viewAsUserId) {
      return viewAsUserId;
    }
  }
  return session.userId;
}
