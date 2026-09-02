import { SignJWT, importPKCS8 } from "jose";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb, getEnv } from "@/lib/db";
import { findUserById, setUserCalendar } from "@/lib/repos/users";
import {
  findWorkRecord,
  listWorkRecords,
  setWorkRecordEventId,
  type WorkRecordDoc,
} from "@/lib/repos/work-records";
import { formatCurrency } from "@/lib/time-utils";

/**
 * A Google Calendar work log per member, the company owning it.
 *
 * The company's Google identity here is a service account: it owns one
 * calendar per member, shares it to the member's email as a reader
 * (Google sends the invitation), and writes each logged day onto it as
 * an all-day event. The member sees "Jamie Northrup — StuntListing Work
 * Log" beside their own calendars, toggles it on or off, and never has
 * to grant the app anything. The app's work_records stay the source of
 * truth; the event id rides the row so an edit patches the same event
 * and a delete removes it, and the record id rides the event's private
 * extended properties so a resync can always find its way back.
 *
 * Credentials: GOOGLE_SERVICE_ACCOUNT_JSON — the service account's key
 * file as one JSON string — on the Worker or in app_config. The
 * Calendar API must be enabled on its project.
 */

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const API = "https://www.googleapis.com/calendar/v3";
/** Everything is dated in New York: that is where the work is. */
const TIME_ZONE = "America/New_York";
const PROP_KEY = "stuntlisting_work_record_id";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

async function serviceAccount(): Promise<ServiceAccount | null> {
  const env = (await getEnv()) as unknown as { GOOGLE_SERVICE_ACCOUNT_JSON?: string };
  let raw = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    const row = await (await getDb())
      .prepare("SELECT value FROM app_config WHERE key = 'GOOGLE_SERVICE_ACCOUNT_JSON'")
      .first<{ value: string }>();
    raw = row?.value;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return null;
  }
}

export async function calendarConfigured(): Promise<boolean> {
  return (await serviceAccount()) !== null;
}

/** A short-lived access token for the service account, via a signed JWT. */
async function accessToken(account: ServiceAccount): Promise<string> {
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({ scope: CALENDAR_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Google sign-in failed: ${data.error_description ?? res.status}`);
  }
  return data.access_token;
}

async function api<T>(
  token: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(`Google Calendar ${method} ${path}: ${data.error?.message ?? res.status}`);
  }
  return data;
}

/** What the event says: the show, the role, the times and the money. */
export function workDayEvent(
  record: Pick<
    WorkRecordDoc,
    | "_id"
    | "showName"
    | "workDate"
    | "characterName"
    | "actorDoubled"
    | "callTime"
    | "dismissMakeupWardrobe"
    | "expectedAmount"
    | "workType"
    | "recordStatus"
  >,
  appUrl: string
): {
  summary: string;
  description: string;
  start: { date: string };
  end: { date: string };
  extendedProperties: { private: Record<string, string> };
} {
  const date = (record.workDate || "").slice(0, 10);
  const next = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) return date;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1)).toISOString().slice(0, 10);
  })();
  const role = record.characterName?.trim();
  const doubled = record.actorDoubled?.trim();
  const summary = [record.showName || "Work day", role ? `${role}${doubled ? ` (for ${doubled})` : ""}` : null]
    .filter(Boolean)
    .join(" — ");
  const lines = [
    record.callTime ? `Call ${record.callTime}` : null,
    record.dismissMakeupWardrobe ? `Wrapped ${record.dismissMakeupWardrobe}` : null,
    record.expectedAmount ? `Expected pay ${formatCurrency(record.expectedAmount)}` : null,
    record.recordStatus === "attachment_only" ? "Not transcribed yet" : null,
    record.workType === "other" ? "Non-SAG work" : null,
    `${appUrl}/work/${record._id}`,
  ].filter((l): l is string => !!l);
  return {
    summary,
    description: lines.join("\n"),
    start: { date },
    end: { date: next },
    extendedProperties: { private: { [PROP_KEY]: record._id } },
  };
}

/** The link that adds a shared calendar to the member's Google Calendar list. */
export function addCalendarLink(calendarId: string): string {
  const b64 = btoa(calendarId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `https://calendar.google.com/calendar/u/0/r?cid=${b64}`;
}

const APP_URL = "https://rate-calculator.jamie-181.workers.dev";

/**
 * Make the member's calendar and share it to them. Idempotent: a member
 * who already has one keeps it (the ACL insert is repeated harmlessly).
 */
export async function ensureWorkLogCalendar(userId: string): Promise<{ calendarId: string; shared: boolean }> {
  const account = await serviceAccount();
  if (!account) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured");
  const user = await findUserById(userId);
  if (!user) throw new Error("User not found");
  const token = await accessToken(account);
  let calendarId = user.calendarId ?? null;
  if (!calendarId) {
    const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
    const created = await api<{ id: string }>(token, "POST", "/calendars", {
      summary: `${name} — StuntListing Work Log`,
      description:
        "Every work day logged in the StuntListing Bookkeeper, mirrored here by StuntListing. Read only — edit the day in the Bookkeeper.",
      timeZone: TIME_ZONE,
    });
    calendarId = created.id;
  }
  // Share it, read only, with an invitation email from Google.
  await api(token, "POST", `/calendars/${encodeURIComponent(calendarId)}/acl?sendNotifications=true`, {
    role: "reader",
    scope: { type: "user", value: user.email },
  });
  await setUserCalendar(userId, calendarId, new Date().toISOString());
  return { calendarId, shared: true };
}

/** Take the member off the calendar and forget it; the events stay with the company. */
export async function removeWorkLogCalendar(userId: string): Promise<void> {
  const account = await serviceAccount();
  const user = await findUserById(userId);
  if (!user?.calendarId) return;
  if (account) {
    try {
      const token = await accessToken(account);
      await api(
        token,
        "DELETE",
        `/calendars/${encodeURIComponent(user.calendarId)}/acl/${encodeURIComponent(`user:${user.email}`)}`
      );
    } catch (e) {
      console.error("calendar unshare failed (continuing):", e);
    }
  }
  await setUserCalendar(userId, null, null);
}

/** Write (or rewrite) one day's event. No-op for a member without a calendar. */
export async function mirrorWorkRecord(userId: string, recordId: string): Promise<void> {
  const user = await findUserById(userId);
  if (!user?.calendarId) return;
  const account = await serviceAccount();
  if (!account) return;
  const record = await findWorkRecord(recordId, userId);
  if (!record) return;
  const token = await accessToken(account);
  const body = workDayEvent(record, APP_URL);
  const base = `/calendars/${encodeURIComponent(user.calendarId)}/events`;
  if (record.googleEventId) {
    try {
      await api(token, "PATCH", `${base}/${encodeURIComponent(record.googleEventId)}`, body);
      return;
    } catch (e) {
      // The event is gone (deleted by hand?) — make it again below.
      console.error("calendar patch failed, recreating:", e);
    }
  }
  const created = await api<{ id: string }>(token, "POST", base, body);
  await setWorkRecordEventId(recordId, userId, created.id);
}

/** Remove a deleted day's event. */
export async function unmirrorWorkRecord(userId: string, googleEventId: string | null): Promise<void> {
  if (!googleEventId) return;
  const user = await findUserById(userId);
  if (!user?.calendarId) return;
  const account = await serviceAccount();
  if (!account) return;
  const token = await accessToken(account);
  try {
    await api(token, "DELETE", `/calendars/${encodeURIComponent(user.calendarId)}/events/${encodeURIComponent(googleEventId)}`);
  } catch (e) {
    console.error("calendar event delete failed:", e);
  }
}

/** Every day the member has logged, onto the calendar. */
export async function backfillWorkLog(userId: string): Promise<{ mirrored: number }> {
  const { records } = await listWorkRecords({ userId, limit: 5000 });
  let mirrored = 0;
  for (const r of records) {
    await mirrorWorkRecord(userId, r._id);
    mirrored += 1;
  }
  return { mirrored };
}

/**
 * Mirror after the response goes out (ctx.waitUntil on the Worker),
 * never in the request: a calendar hiccup must not fail a save.
 */
export function mirrorLater(userId: string, recordId: string): void {
  const work = mirrorWorkRecord(userId, recordId).catch((e) =>
    console.error("calendar mirror failed:", e)
  );
  getCloudflareContext({ async: true })
    .then(({ ctx }) => ctx?.waitUntil?.(work))
    .catch(() => undefined);
}

export function unmirrorLater(userId: string, googleEventId: string | null): void {
  const work = unmirrorWorkRecord(userId, googleEventId).catch((e) =>
    console.error("calendar unmirror failed:", e)
  );
  getCloudflareContext({ async: true })
    .then(({ ctx }) => ctx?.waitUntil?.(work))
    .catch(() => undefined);
}
