import { NextResponse } from "next/server";
import { listGUploads } from "@/lib/repos/g-uploads";
import { ingestGUploads } from "@/lib/g-ingest";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const uploads = await listGUploads(await getEffectiveUserId(auth.session));
    return NextResponse.json({ uploads });
  } catch (error) {
    console.error("Error listing Exhibit G uploads:", error);
    return NextResponse.json(
      { error: "Failed to list uploads" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/g-uploads
 * Accepts one or more files (field name `file`). Identical bytes already
 * uploaded by this user are reported as duplicates rather than stored twice.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const userId = await getEffectiveUserId(auth.session);
    const formData = await request.formData();
    const files = formData.getAll("file").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ingest = await ingestGUploads(
      userId,
      await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          type: file.type,
          bytes: await file.arrayBuffer(),
        }))
      )
    );
    const { created, duplicates } = ingest;

    return NextResponse.json(
      { created, duplicates },
      { status: created.length > 0 ? 201 : 200 }
    );
  } catch (error) {
    console.error("Exhibit G upload error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to upload: ${message}` },
      { status: 500 }
    );
  }
}
