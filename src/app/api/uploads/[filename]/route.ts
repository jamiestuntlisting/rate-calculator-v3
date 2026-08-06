import { NextResponse } from "next/server";
import { getUploadsBucket } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    if (filename.includes("..") || filename.includes("/")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const bucket = await getUploadsBucket();
    const object = await bucket.get(filename);
    if (!object) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return new NextResponse(object.body as unknown as BodyInit, {
      headers: {
        "Content-Type":
          object.httpMetadata?.contentType || "application/octet-stream",
        "Content-Length": String(object.size),
        ETag: object.httpEtag,
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
