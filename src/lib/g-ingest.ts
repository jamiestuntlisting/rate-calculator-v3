import { v4 as uuidv4 } from "uuid";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getUploadsBucket } from "@/lib/db";
import { findUserById } from "@/lib/repos/users";
import { autoReadsExhibitG } from "@/lib/test-users";
import { readExhibitG } from "@/lib/g-reader/read";
import { documentTypeForKind, kindForUpload } from "@/lib/upload-kind";
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

/**
 * How a G arrived, written into the day's notes so the tracker row and
 * the transcription form both say so: "Received by text from (484)
 * 978-8687 on Sep 2, 2026 at 9:20 PM." A G that came through the
 * Upload button carries no note — the app is where it came from.
 */
export function originNote(
  channel: "text" | "email",
  sender: string,
  when: Date = new Date()
): string {
  const stamp = when.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  // "Sep 2, 2026, 9:20 PM" → "Sep 2, 2026 at 9:20 PM"
  const [date, time] = stamp.split(/,\s(?=\d{1,2}:\d{2})/);
  const at = time ? `${date} at ${time}` : stamp;
  return `Received by ${channel} from ${sender} on ${at}.`;
}

export async function ingestGUploads(
  userId: string,
  files: IngestFile[],
  /** A note on where the G came from, kept on the day (see originNote). */
  origin?: string
): Promise<IngestResult> {
  const bucket = await getUploadsBucket();
  const created: GUpload[] = [];
  const duplicates: IngestResult["duplicates"] = [];

  // A tester's G is read by Claude as it lands (the feature under test)
  // — in the background, after the response, so the upload never waits
  // on the model. The reading, or the error, is recorded either way.
  const owner = await findUserById(userId);
  const reader =
    owner && autoReadsExhibitG(owner.email)
      ? {
          name: `${owner.firstName ?? ""} ${owner.lastName ?? ""}`.trim() || owner.email,
        }
      : null;

  let untranscribedCount = await maxUntranscribedTitle(userId);

  for (const file of files) {
    const hash = await sha256Hex(file.bytes);

    const existing = await findGUploadByHash(userId, hash);
    if (existing) {
      duplicates.push({ originalName: file.name, existing });
      continue;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    // A PDF is taken for the call sheet, a photo for the Exhibit G;
    // either can be reclassified later. Both start a work day.
    const kind = kindForUpload(file.type, file.name);
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
        showName:
          kind === "exhibit_g"
            ? `Untranscribed Exhibit G ${untranscribedCount}`
            : `${kind === "call_sheet" ? "Call sheet" : "File"} ${untranscribedCount}`,
        workDate: uploadedOn,
        recordStatus: "attachment_only",
        ...(origin ? { notes: origin } : {}),
        documents: [
          {
            filename,
            originalName: file.name,
            documentType: documentTypeForKind(kind),
            uploadedAt: uploadedOn,
          },
        ],
      },
      userId
    );

    const upload = await createGUpload({
      userId,
      title: "",
      filename,
      originalName: file.name,
      contentType,
      size: file.bytes.byteLength,
      sha256: hash,
      workRecordId: workRecord._id,
      kind,
    });
    created.push(upload);
    // Only an Exhibit G is read; a call sheet has no row to transcribe.
    if (reader && kind === "exhibit_g") scheduleReading(upload, reader.name);
  }

  return { created, duplicates };
}

/**
 * Run the reading after the response goes out. On the Worker that is
 * ctx.waitUntil; in `next dev` there is no such context, so the promise
 * simply runs on. Errors land in g_readings, never in the request.
 */
function scheduleReading(upload: GUpload, performerName: string): void {
  const work = readExhibitG(upload, performerName).then(
    () => undefined,
    (e) => console.error("Exhibit G reading failed:", e)
  );
  getCloudflareContext({ async: true })
    .then(({ ctx }) => ctx?.waitUntil?.(work))
    .catch(() => undefined);
}
