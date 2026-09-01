/**
 * Phone numbers, reduced to something two systems can agree on.
 *
 * Twilio hands us E.164 ("+19293250311"); people type anything
 * ("(929) 325-0311", "929.325.0311", "+1 929 325 0311"). Everything is
 * reduced to bare digits for storage, and matching compares the last
 * ten — the national number — so the presence or absence of a leading
 * 1 never decides whose tracker a card lands in.
 */

/** "+1 (929) 325-0311" -> "19293250311"; "" when nothing usable. */
export function phoneDigits(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

/** The last ten digits — the national number two formats share. */
export function phoneKey(raw: string): string {
  const digits = phoneDigits(raw);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/** Enough digits to be a real number worth storing. */
export function isPlausiblePhone(raw: string): boolean {
  return phoneDigits(raw).length >= 10;
}
