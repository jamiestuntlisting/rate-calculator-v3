/**
 * The slice of Twilio this app speaks: verifying that a webhook call
 * really came from Twilio, and answering it in TwiML.
 *
 * Twilio signs each request with HMAC-SHA1 over the exact public URL it
 * called plus every POST parameter, sorted by name and concatenated as
 * name+value, keyed by the account's auth token, base64-encoded, sent
 * as X-Twilio-Signature. No SDK — the Worker bundle stays as it was.
 */

const encoder = new TextEncoder();

/** The string Twilio signs: url + sorted (name + value) pairs. */
export function twilioSignedPayload(
  url: string,
  params: Record<string, string>
): string {
  const keys = Object.keys(params).sort();
  return url + keys.map((key) => key + params[key]).join("");
}

export async function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(twilioSignedPayload(url, params))
  );
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

/** Constant-time-ish comparison; both sides are short base64 strings. */
export async function validateTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string
): Promise<boolean> {
  const expected = await twilioSignature(authToken, url, params);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

/** A one-message TwiML reply, escaped. */
export function twimlMessage(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}
