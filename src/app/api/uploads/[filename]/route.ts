import { NextResponse } from "next/server";
import { getUploadsBucket } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    if (filename.includes("..") || filename.includes("/")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const bucket = await getUploadsBucket();
    // ?thumb=1 asks for the small copy a browser made for lists
    // (thumbs/<filename>); until one exists the original is served, so
    // a list never breaks for want of a thumbnail.
    const wantThumb = new URL(request.url).searchParams.get("thumb") === "1";
    const object =
      (wantThumb ? await bucket.get(`thumbs/${filename}`) : null) ??
      (await bucket.get(filename));
    if (!object) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Let R2 populate the content headers and stream the body as-is. Setting
    // Content-Length by hand truncates the response when the platform
    // re-encodes or compresses the stream.
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("ETag", object.httpEtag);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/octet-stream");
    }

    return new Response(object.body as unknown as BodyInit, { headers });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
