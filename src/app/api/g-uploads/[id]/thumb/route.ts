import { NextResponse } from "next/server";
import { getUploadsBucket } from "@/lib/db";
import { getSession, isAdminEmail } from "@/lib/auth";
import { findGUploadById, thumbnailKey, updateGUpload } from "@/lib/repos/g-uploads";
import { getEffectiveUserId, requireAuth } from "@/lib/api-auth";

/** A thumbnail is small by definition; anything bigger is not one. */
const MAX_THUMB_BYTES = 400 * 1024;

/**
 * PUT /api/g-uploads/[id]/thumb — store the small copy a browser made
 * of this upload (src/lib/thumbnail). The owner may, and so may an
 * admin, who sees other members' files on the transcription queue.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { id } = await params;
    const upload = await findGUploadById(id);
    if (!upload) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

    const session = await getSession();
    const admin = !!session && (session.role === "admin" || isAdminEmail(session.email));
    const userId = await getEffectiveUserId(auth.session);
    if (!admin && upload.userId !== userId) {
      return NextResponse.json({ error: "Not yours" }, { status: 403 });
    }

    const type = request.headers.get("content-type") || "";
    if (!type.startsWith("image/")) {
      return NextResponse.json({ error: "Send the image bytes" }, { status: 400 });
    }
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_THUMB_BYTES) {
      return NextResponse.json({ error: "Not a thumbnail" }, { status: 400 });
    }

    const key = thumbnailKey(upload.filename);
    const bucket = await getUploadsBucket();
    await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
    const updated = await updateGUpload(id, upload.userId, { thumbnail: key });
    return NextResponse.json({ thumbPath: updated?.thumbPath ?? null });
  } catch (error) {
    console.error("thumbnail error:", error);
    return NextResponse.json({ error: "Couldn't store the thumbnail" }, { status: 500 });
  }
}
