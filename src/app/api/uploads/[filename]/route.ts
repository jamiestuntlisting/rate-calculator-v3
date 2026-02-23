import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Upload from "@/models/Upload";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    if (filename.includes("..") || filename.includes("/")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    await dbConnect();

    const upload = await Upload.findOne({ filename });
    if (!upload) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(upload.data), {
      headers: {
        "Content-Type": upload.contentType,
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
