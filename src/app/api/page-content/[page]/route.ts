import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/auth";

/**
 * Copy overrides for the public-facing pages, so an admin can reword a
 * headline or move a price without a deploy. One app_config row per page,
 * holding a JSON object of key → replacement text; a key that is absent
 * falls back to what is written in the code, which stays the source of
 * truth for structure.
 *
 * Reading is public — these pages are public, and the override IS the
 * page. Writing is admins only.
 */

const PAGES = new Set(["how-it-works", "membership", "membership-quiz"]);

const keyFor = (page: string) => `page_content:${page}`;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ page: string }> }
) {
  const { page } = await params;
  if (!PAGES.has(page)) {
    return NextResponse.json({ error: "Unknown page" }, { status: 404 });
  }
  try {
    const db = await getDb();
    const row = await db
      .prepare("SELECT value FROM app_config WHERE key = ?1")
      .bind(keyFor(page))
      .first<{ value: string }>();
    return NextResponse.json({ values: row ? JSON.parse(row.value) : {} });
  } catch (error) {
    console.error("page-content GET error:", error);
    return NextResponse.json({ values: {} });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ page: string }> }
) {
  const { page } = await params;
  if (!PAGES.has(page)) {
    return NextResponse.json({ error: "Unknown page" }, { status: 404 });
  }
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  if (auth.session.role !== "admin" && !isAdminEmail(auth.session.email)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as { values?: Record<string, unknown> };
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.values ?? {})) {
      if (typeof v === "string" && k.length <= 200 && v.length <= 4000) {
        clean[k] = v;
      }
    }

    const db = await getDb();
    await db
      .prepare(
        "INSERT INTO app_config (key, value) VALUES (?1, ?2) " +
          "ON CONFLICT(key) DO UPDATE SET value = ?2"
      )
      .bind(keyFor(page), JSON.stringify(clean))
      .run();
    return NextResponse.json({ values: clean });
  } catch (error) {
    console.error("page-content PUT error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
