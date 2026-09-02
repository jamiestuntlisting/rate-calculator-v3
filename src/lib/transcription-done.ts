/**
 * What a transcription needs before a G can be marked done. The form
 * and the g-uploads PATCH both judge by this, so no client can stamp a
 * G finished with less than the minimum: the show, the work date, the
 * day's brackets (call and wrap), and an answer to whether the
 * performer got lunch — with the lunch In and Out when they did. A day
 * with no lunch is priced with its meal penalties, which is the point
 * of asking; a lunch that happened but was never written down would
 * silently price the day as if it had not.
 *
 * Save is never gated; only Done is.
 */

/** Did the performer get lunch? Empty until answered. */
export type LunchAnswer = "yes" | "no" | "";

export interface DoneCheckInput {
  showName?: string | null;
  workDate?: string | null;
  callTime?: string | null;
  dismissMakeupWardrobe?: string | null;
  lunch?: LunchAnswer | null;
  firstMealStart?: string | null;
  firstMealFinish?: string | null;
}

const filled = (v: string | null | undefined) => !!(v && v.trim());

/**
 * What is still missing, in the order the form asks for it — empty
 * when the G may be marked done. A row saved before the lunch
 * question existed has no answer: lunch times on it count as "yes",
 * and none count as unanswered rather than as "no".
 */
export function doneBlockers(input: DoneCheckInput): string[] {
  const missing: string[] = [];
  if (!filled(input.showName)) missing.push("the show");
  if (!filled(input.workDate)) missing.push("the work date");
  if (!filled(input.callTime)) missing.push("the call time");
  if (!filled(input.dismissMakeupWardrobe)) missing.push("the wrap");
  const hasLunchTimes =
    filled(input.firstMealStart) && filled(input.firstMealFinish);
  const answer = input.lunch || (hasLunchTimes ? "yes" : "");
  if (answer === "") missing.push("whether you got lunch");
  else if (answer === "yes" && !hasLunchTimes) {
    missing.push("the lunch In and Out");
  }
  return missing;
}

/** "the show, the call time and the wrap" */
export function listMissing(missing: string[]): string {
  if (missing.length <= 1) return missing.join("");
  return `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
}
