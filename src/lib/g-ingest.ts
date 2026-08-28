import { v4 as uuidv4 } from "uuid";
import { getUploadsBucket } from "@/lib/db";
import {
  createGUpload,
  findGUploadByHash,
  type GUpload,
} from "@/lib/repos/g-uploads";
import {
  createWorkRecord,
  maxUntranscribedTitle,
} from "@/lib/repos/work-records";

/**
 * One Exhibit G entering the system, however it arrived — the upload
 * button, the bulk page, or an email forwarded in. Everything downstream
 * is identical on purpose: identical bytes the user already sent are
 * reported as duplicates rather than stored twice, the file lands in R2,
 * and the day gets its numbered tracker row until transcription names it.
 */

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

export interface IngestFile {
  name: string;
  type: string;
  bytes: ArrayBuffer;
}

export interface IngestResult {
  created: GUpload[];
  duplicates: Array<{ originalName: string; existing: GUpload }>;
}

export async function ingestGUploads(
  userId: string,
  files: IngestFile[]
): Promise<IngestResult> {
  const bucket = await getUploadsBucket();
  const created: GUpload[] = [];
  const duplicates: IngestResult["duplicates"] = [];

  let untranscribedCount = await maxUntranscribedTitle(userId);

  for (const file of files) {
    const hash = await sha256Hex(file.bytes);

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

    await bucket.put(filename, file.bytes, {
      httpMetadata: { contentType },
      customMetadata: { originalName: file.name },
    });

    // An Exhibit G is one work day, so it gets a tracker row straight
    // away. It sits as attachment-only, dated the day it was uploaded,
    // until someone transcribes the real date and show off the form.
    // Several arriving together share that date, so each carries a
    // numbered placeholder title until transcription gives it a real
    // one — otherwise the tracker shows indistinguishable rows.
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
        size: file.bytes.byteLength,
        sha256: hash,
        workRecordId: workRecord._id,
      })
    );
  }

  return { created, duplicates };
}
