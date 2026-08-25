import { NextResponse } from "next/server";
import { getUploadsBucket } from "@/lib/db";
import {
  deleteGUpload,
  findGUpload,
  updateGUpload,
} from "@/lib/repos/g-uploads";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const upload = await findGUpload(
      id,
      await getEffectiveUserId(auth.session)
    );

    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }
    return NextResponse.json(upload);
  } catch (error) {
    console.error("Error fetching Exhibit G upload:", error);
    return NextResponse.json(
      { error: "Failed to fetch upload" },
      { status: 500 }
    );
  }
}

/** PATCH — rename, rotate, or save the transcription. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await request.json();

    const upload = await updateGUpload(
      id,
      await getEffectiveUserId(auth.session),
      {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.rotation !== undefined ? { rotation: body.rotation } : {}),
        ...(body.transcription !== undefined
          ? { transcription: body.transcription }
          : {}),
      }
    );

    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }
    return NextResponse.json(upload);
  } catch (error) {
    console.error("Error updating Exhibit G upload:", error);
    return NextResponse.json(
      { error: "Failed to update upload" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const deleted = await deleteGUpload(
      id,
      await getEffectiveUserId(auth.session)
    );

    if (!deleted) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    // Remove the object too — the row is gone, so nothing references it.
    try {
      const bucket = await getUploadsBucket();
      await bucket.delete(deleted.filename);
    } catch (error) {
      console.error("Failed to delete R2 object:", error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting Exhibit G upload:", error);
    return NextResponse.json(
      { error: "Failed to delete upload" },
      { status: 500 }
    );
  }
}
