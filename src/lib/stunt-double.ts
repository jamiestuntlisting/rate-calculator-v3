/**
 * Whether a character reads as a stunt double — the one kind of day that
 * has an actor behind it. The form asks "Name of Actor Doubled" only
 * then; the answer is the line a résumé and a StuntListing profile want,
 * and a card never carries it. "Stunt Double", "Stunt Dbl", "#X4 Marcus
 * Stunt Dbl", "Stunt Double - Lead" and "Utility Stunt Double" all read
 * as one; "Stunt Performer" and "Utility Stunts" do not.
 */
export function isStuntDouble(character: string | null | undefined): boolean {
  return /\bstunt\s*(double|dbl)\b/i.test(character ?? "");
}

/** The field's label, in one place. */
export const ACTOR_DOUBLED_LABEL = "Name of Actor Doubled";
