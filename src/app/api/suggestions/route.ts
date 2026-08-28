import { NextResponse } from "next/server";
import {
  blockName,
  listAllSuggestions,
  listSuggestions,
  setNameStatus,
  unblockName,
  type SuggestionKind,
  type SuggestionStatus,
} from "@/lib/repos/name-suggestions";
import { requireAuth } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/auth";

const KINDS: SuggestionKind[] = ["show", "character"];

/**
 * GET /api/suggestions?kind=show|character — names to offer for autocomplete.
 * GET /api/suggestions?all=1 — every name including blocked ones (admin).
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);

    if (searchParams.get("all")) {
      if (auth.session.role !== "admin" && !isAdminEmail(auth.session.email)) {
        return NextResponse.json(
          { error: "Admin access required" },
          { status: 403 }
        );
      }
      return NextResponse.json({ names: await listAllSuggestions() });
    }

    const kind = searchParams.get("kind") as SuggestionKind | null;
    if (!kind || !KINDS.includes(kind)) {
      return NextResponse.json(
        { error: "kind must be 'show' or 'character'" },
        { status: 400 }
      );
    }

    return NextResponse.json({ names: await listSuggestions(kind) });
  } catch (error) {
    console.error("suggestions GET error:", error);
    return NextResponse.json(
      { error: "Failed to load suggestions" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/suggestions — block or unblock a spelling. Admin only, so one
 * misspelling cannot quietly become a second version of a production.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    if (auth.session.role !== "admin" && !isAdminEmail(auth.session.email)) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const { kind, name, blocked, replacement, status } =
      (await request.json()) as {
        kind?: SuggestionKind;
        name?: string;
        blocked?: boolean;
        replacement?: string | null;
        status?: SuggestionStatus;
      };

    if (!kind || !KINDS.includes(kind) || !name?.trim()) {
      return NextResponse.json(
        { error: "kind and name are required" },
        { status: 400 }
      );
    }

    if (status !== undefined) {
      if (!["pending", "approved", "ignored"].includes(status)) {
        return NextResponse.json({ error: "Bad status" }, { status: 400 });
      }
      await setNameStatus(kind, name, status);
    } else if (blocked) {
      await blockName(kind, name, replacement ?? null);
    } else {
      await unblockName(kind, name);
    }

    return NextResponse.json({ names: await listAllSuggestions() });
  } catch (error) {
    console.error("suggestions POST error:", error);
    return NextResponse.json(
      { error: "Failed to update suggestions" },
      { status: 500 }
    );
  }
}
