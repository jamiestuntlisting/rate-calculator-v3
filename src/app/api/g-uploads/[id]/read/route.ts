import { NextResponse } from "next/server";
import { findGUpload } from "@/lib/repos/g-uploads";
import { findUserById } from "@/lib/repos/users";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";
import { autoReadsExhibitG } from "@/lib/test-users";
import { readExhibitG } from "@/lib/g-reader/read";

/**
 * POST /api/g-uploads/[id]/read — read the card with Claude now.
 * The transcription page calls it when a tester opens a G that has no
 * reading yet (an upload from before the feature, or one whose
 * background read did not run), and its "Read again" button. Testers'
 * own uploads only; an admin viewing as a tester counts as them.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const userId = await getEffectiveUserId(auth.session);
    const owner = await findUserById(userId);
    if (!owner || !autoReadsExhibitG(owner.email)) {
      return NextResponse.json({ error: "Not a test account" }, { status: 403 });
    }
    const { id } = await params;
    const upload = await findGUpload(id, userId);
    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }
    const name =
      `${owner.firstName ?? ""} ${owner.lastName ?? ""}`.trim() || owner.email;
    const reading = await readExhibitG(upload, name);
    return NextResponse.json({ reading });
  } catch (error) {
    console.error("Exhibit G read error:", error);
    return NextResponse.json({ error: "Failed to read the card" }, { status: 500 });
  }
}
