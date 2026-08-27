import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getUploadsBucket } from "@/lib/db";
import { isUploadable, storedContentType } from "@/lib/uploadable";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // The picker's `accept` is only a hint, so the rule is enforced here too.
    if (!isUploadable(file.type, file.name)) {
      return NextResponse.json(
        { error: "Only photos and PDFs can be attached" },
        { status: 415 }
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filename = `${uuidv4()}.${ext}`;
    const contentType = storedContentType(file.type, file.name);
    const bytes = await file.arrayBuffer();

    const bucket = await getUploadsBucket();
    await bucket.put(filename, bytes, {
      httpMetadata: { contentType },
      customMetadata: { originalName: file.name },
    });

    return NextResponse.json({
      filename,
      path: `/api/uploads/${filename}`,
      size: file.size,
    });
  } catch (error) {
    console.error("Upload error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to upload file: ${message}` },
      { status: 500 }
    );
  }
}
