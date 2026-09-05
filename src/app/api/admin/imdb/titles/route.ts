import { NextResponse } from "next/server";
import { getSession, isAdminEmail } from "@/lib/auth";
import { listShowsWithImdb, setShowImdbId } from "@/lib/repos/name-suggestions";
import { normalizeImdbTitleId } from "@/lib/imdb";

async function requireAdmin() {
  const session = await getSession();
  if (!session || (session.role !== "admin" && !isAdminEmail(session.email))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return null;
}

/** GET /api/admin/imdb/titles — every show with work under it, and its IMDb title id when known. */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    return NextResponse.json({ shows: await listShowsWithImdb() });
  } catch (error) {
    console.error("imdb titles GET error:", error);
    return NextResponse.json({ error: "Failed to list shows" }, { status: 500 });
  }
}

/** PATCH /api/admin/imdb/titles — { name, imdbId: "tt…" | "" } sets or clears a show's title id. */
export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = (await request.json()) as { name?: string; imdbId?: string };
    const name = (body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Which show?" }, { status: 400 });
    const imdbId = normalizeImdbTitleId(body.imdbId);
    await setShowImdbId(name, imdbId);
    return NextResponse.json({ name, imdbId });
  } catch (error) {
    console.error("imdb titles PATCH error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
