import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdminEmail } from "@/lib/auth";
import { imdbSuggestionUrl, parseImdbSuggestions } from "@/lib/imdb";

/**
 * GET /api/admin/imdb/search?type=title|name&q=… — IMDb's suggestion
 * service, proxied for the admin pages (the browser cannot call it
 * cross-origin). Not a documented API: when it fails the page falls
 * back to IMDb's own search link and a pasted id.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && !isAdminEmail(session.email))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") === "name" ? "name" : "title";
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  try {
    const res = await fetch(imdbSuggestionUrl(type, q), {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (StuntListing Bookkeeper)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `IMDb answered ${res.status}`, results: [] }, { status: 502 });
    }
    const results = parseImdbSuggestions(await res.json(), type);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "IMDb did not answer", results: [] },
      { status: 502 }
    );
  }
}
