import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getUploadsBucket } from "@/lib/db";
import {
  createGUpload,
  findGUploadByHash,
  listGUploads,
} from "@/lib/repos/g-uploads";
import {
  createWorkRecord,
  maxUntranscribedTitle,
} from "@/lib/repos/work-records";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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

    const bucket = await getUploadsBucket();
    const created = [];
    const duplicates = [];

    let untranscribedCount = await maxUntranscribedTitle(userId);


    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const hash = await sha256Hex(bytes);

      const existing = await findGUploadByHash(userId, hash);
      if (existing) {
        duplicates.push({ originalName: file.name, existing });
        continue;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      // Flat key: /api/uploads/[filename] serves R2 objects and rejects
      // slashes in the path segment.
      const filename = `${uuidv4()}.${ext}`;
      const contentType =
        MIME_TYPES[ext] || file.type || "application/octet-stream";

      await bucket.put(filename, bytes, {
        httpMetadata: { contentType },
        customMetadata: { originalName: file.name },
      });

      // An Exhibit G is one work day, so it gets a tracker row straight
      // away. It sits as attachment-only, dated the day it was uploaded,
      // until someone transcribes the real date and show off the form.
      // Ten uploaded in one sitting share that date, so each carries a
      // numbered placeholder title until transcription gives it a real
      // one — otherwise the tracker shows ten indistinguishable rows.
      untranscribedCount += 1;
      const uploadedOn = new Date().toISOString();
      const workRecord = await createWorkRecord(
        {
          showName: `Untranscribed Exhibit G ${untranscribedCount}`,
          workDate: uploadedOn,
          recordStatus: "attachment_only",
          documents: [
            {
              filename,
              originalName: file.name,
              documentType: "exhibit_g",
              uploadedAt: uploadedOn,
            },
          ],
        },
        userId
      );

      created.push(
        await createGUpload({
          userId,
          title: "",
          filename,
          originalName: file.name,
          contentType,
          size: file.size,
          sha256: hash,
          workRecordId: workRecord._id,
        })
      );
    }

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
