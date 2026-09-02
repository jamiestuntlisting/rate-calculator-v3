import { NextResponse } from "next/server";
import { getSession, isAdminEmail } from "@/lib/auth";
import { findUserById, mergeUserPrefs } from "@/lib/repos/users";
import { normalizeImdbId } from "@/lib/imdb";

/**
 * PATCH /api/admin/users/[userId]/imdb — set (or clear) a member's IMDb
 * person id. Body: { imdbId: "nm1234567" | "" }. An id or a pasted
 * profile URL both work; anything without an nm id clears it.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (session.role !== "admin" && !isAdminEmail(session.email)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const { userId } = await params;
    if (!(await findUserById(userId))) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const body = (await request.json()) as { imdbId?: string };
    const imdbId = normalizeImdbId(body.imdbId) ?? undefined;
    const prefs = await mergeUserPrefs(userId, { imdbId });
    return NextResponse.json({ imdbId: prefs.imdbId ?? null });
  } catch (error) {
    console.error("admin imdb PATCH error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
