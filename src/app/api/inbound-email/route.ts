import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ingestGUploads, type IngestFile } from "@/lib/g-ingest";
import { isUploadable } from "@/lib/uploadable";

/**
 * Exhibit Gs arriving by email.
 *
 * A performer mails their G (one attachment or several) to the intake
 * address; whatever watches that mailbox — today a Google Apps Script
 * inside the Gmail account, tomorrow anything else — POSTs the parsed
 * message here. The sender's address is looked up against our users, who
 * all sign in with their StuntListing email, and the attachments land in
 * that member's uploads exactly as if they had tapped Upload themselves:
 * same dedupe, same numbered tracker rows, same transcription queue.
 *
 * Auth is a shared secret, not a session: the caller is a machine. The
 * secret lives in app_config (INBOUND_EMAIL_SECRET; a Worker env var of
 * the same name wins if set) so it can be rotated with one SQL update.
 * An unknown sender is refused — mail from an address we cannot match is
 * not attached to anyone, because a wrong guess here files someone's
 * paperwork into a stranger's account.
 */

interface InboundAttachment {
  filename?: string;
  contentType?: string;
  dataBase64?: string;
}

async function inboundSecret(): Promise<string | null> {
  if (process.env.INBOUND_EMAIL_SECRET) return process.env.INBOUND_EMAIL_SECRET;
  try {
    const db = await getDb();
    const row = await db
      .prepare("SELECT value FROM app_config WHERE key = 'INBOUND_EMAIL_SECRET'")
      .bind()
      .first<{ value: string }>();
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/** "James Northrup <james@x.com>" → "james@x.com" */
function bareAddress(from: string): string {
  const angled = /<([^>]+)>/.exec(from);
  return (angled ? angled[1] : from).trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const secret = await inboundSecret();
    if (!secret) {
      return NextResponse.json(
        { error: "Inbound email is not configured" },
        { status: 503 }
      );
    }
    const given = request.headers.get("x-inbound-secret") ?? "";
    if (given !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      from?: string;
      attachments?: InboundAttachment[];
    };
    const from = bareAddress(String(body.from ?? ""));
    if (!from || !from.includes("@")) {
      return NextResponse.json({ error: "No sender address" }, { status: 400 });
    }

    const db = await getDb();
    const user = await db
      .prepare("SELECT _id FROM users WHERE lower(email) = ?1")
      .bind(from)
      .first<{ _id: string }>();
    if (!user) {
      // Say so plainly: the mailbox script marks these threads unmatched
      // so a human can see who mailed in from an address we do not know.
      return NextResponse.json(
        { error: "unknown_sender", from },
        { status: 404 }
      );
    }

    const files: IngestFile[] = [];
    const skipped: string[] = [];
    for (const attachment of body.attachments ?? []) {
      const name = String(attachment.filename || "attachment.jpg");
      const type = String(attachment.contentType || "");
      const data = attachment.dataBase64;
      if (!data || !isUploadable(type, name)) {
        skipped.push(name);
        continue;
      }
      const raw = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      files.push({ name, type, bytes: raw.buffer });
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No usable attachments", skipped },
        { status: 422 }
      );
    }

    const { created, duplicates } = await ingestGUploads(user._id, files);
    return NextResponse.json(
      {
        created: created.length,
        duplicates: duplicates.length,
        skipped,
      },
      { status: created.length > 0 ? 201 : 200 }
    );
  } catch (error) {
    console.error("inbound-email error:", error);
    return NextResponse.json({ error: "Failed to ingest" }, { status: 500 });
  }
}
