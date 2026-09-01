import { getDb } from "@/lib/db";
import { ingestGUploads, type IngestFile } from "@/lib/g-ingest";
import { isUploadable } from "@/lib/uploadable";
import { findUserByPhoneKey } from "@/lib/repos/users";
import { phoneKey } from "@/lib/phone";
import { twimlMessage, validateTwilioSignature } from "@/lib/twilio";

/**
 * Exhibit Gs arriving by text message.
 *
 * A performer texts a photo of their G to the intake number; Twilio
 * POSTs the message here and the pictures land in that member's uploads
 * exactly as if they had tapped Upload themselves: same dedupe, same
 * numbered tracker rows, same transcription queue (g-ingest.ts, shared
 * with the Upload button, the bulk page and the email intake).
 *
 * Auth is Twilio's own request signature (X-Twilio-Signature, HMAC over
 * the exact public URL called plus the sorted POST params, keyed by the
 * account's auth token) — not a session; the caller is Twilio. The
 * token lives in app_config (TWILIO_AUTH_TOKEN; a Worker env var of the
 * same name wins), alongside TWILIO_ACCOUNT_SID for fetching the media
 * and, optionally, TWILIO_WEBHOOK_URL when the public URL differs from
 * what the Worker sees. The sender is matched on their mobile number
 * against users.phone; an unknown number is told how to link itself
 * rather than guessed at, because a wrong guess files someone's
 * paperwork into a stranger's account.
 *
 * Every reply is TwiML with status 200 — Twilio re-delivers on errors,
 * and a re-delivered "unknown sender" helps nobody.
 */

async function configValue(key: string): Promise<string | null> {
  if (process.env[key]) return process.env[key] ?? null;
  try {
    const db = await getDb();
    const row = await db
      .prepare("SELECT value FROM app_config WHERE key = ?1")
      .bind(key)
      .first<{ value: string }>();
    return row?.value ?? null;
  } catch {
    return null;
  }
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

const reply = (text: string) =>
  new Response(twimlMessage(text), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });

export async function POST(request: Request) {
  try {
    const authToken = await configValue("TWILIO_AUTH_TOKEN");
    if (!authToken) {
      return new Response(
        JSON.stringify({ error: "Texting in is not configured" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    // Twilio sends application/x-www-form-urlencoded; the same params
    // feed the signature check, so read them once from the raw body.
    const raw = await request.text();
    const form = new URLSearchParams(raw);
    const params: Record<string, string> = {};
    for (const [key, value] of form.entries()) params[key] = value;

    const url = (await configValue("TWILIO_WEBHOOK_URL")) ?? request.url;
    const signature = request.headers.get("x-twilio-signature") ?? "";
    if (!(await validateTwilioSignature(authToken, url, params, signature))) {
      return new Response(JSON.stringify({ error: "Bad signature" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const from = params.From ?? "";
    const user = await findUserByPhoneKey(phoneKey(from));
    if (!user) {
      return reply(
        "This number isn't linked to a StuntListing Bookkeeper account. Sign in and add your mobile number under Preferences, then text your Exhibit G again."
      );
    }

    const mediaCount = Math.min(parseInt(params.NumMedia ?? "0", 10) || 0, 10);
    if (mediaCount === 0) {
      return reply(
        "Text a photo of your Exhibit G and it lands in your Bookkeeping tracker."
      );
    }

    // Fetch each picture from Twilio. Basic auth works whether or not
    // the account enforces auth on media URLs.
    const sid = await configValue("TWILIO_ACCOUNT_SID");
    const mediaAuth = sid ? "Basic " + btoa(`${sid}:${authToken}`) : null;
    const stamp = new Date().toISOString().slice(0, 10);
    const files: IngestFile[] = [];
    let unreadable = 0;
    for (let i = 0; i < mediaCount; i++) {
      const mediaUrl = params[`MediaUrl${i}`];
      const type = params[`MediaContentType${i}`] ?? "";
      const ext = EXT_BY_TYPE[type];
      if (!mediaUrl || !ext || !isUploadable(type, `g.${ext}`)) {
        unreadable++;
        continue;
      }
      try {
        const res = await fetch(mediaUrl, {
          headers: mediaAuth ? { Authorization: mediaAuth } : undefined,
          redirect: "follow",
        });
        if (!res.ok) throw new Error(String(res.status));
        files.push({
          name: `text-${stamp}-${i + 1}.${ext}`,
          type,
          bytes: await res.arrayBuffer(),
        });
      } catch {
        unreadable++;
      }
    }

    if (files.length === 0) {
      return reply(
        "Couldn't read that attachment — photos and PDFs work best. Try sending the picture again."
      );
    }

    const { created, duplicates } = await ingestGUploads(user._id, files);
    if (created.length === 0 && duplicates.length > 0) {
      return reply(
        "Got it — you'd already sent this one, so it's not added twice."
      );
    }
    const count =
      created.length > 1 ? ` (${created.length} pictures, one day each)` : "";
    const alsoDupes =
      duplicates.length > 0
        ? ` ${duplicates.length} you'd already sent ${duplicates.length === 1 ? "was" : "were"} skipped.`
        : "";
    const alsoUnreadable =
      unreadable > 0 ? ` ${unreadable} couldn't be read.` : "";
    return reply(
      `Got it. Adding this to your Bookkeeping tracker${count}.${alsoDupes}${alsoUnreadable}`
    );
  } catch (error) {
    console.error("inbound-sms error:", error);
    // 200 + apology on purpose: a 500 makes Twilio re-deliver, and the
    // member should hear something either way.
    return reply("Something went wrong on our side — try that again in a minute.");
  }
}
