import { z } from "zod";

/**
 * What Claude reads off an Exhibit G for one performer — the same
 * fields the transcription form asks for, in the form's own units, so
 * a reading can pre-fill the form and be scored against what the
 * performer finally saves. Blank, dashed and unreadable cells are null;
 * the rule book forbids guessing one.
 */

const time = z
  .string()
  .nullable()
  .describe(
    "24-hour HH:MM (e.g. 06:12, 17:31), or null when the cell is blank, a dash, or unreadable"
  );

export const FieldConfidenceSchema = z.object({
  field: z.string().describe("The field name, as in this schema"),
  confidence: z.number().describe("0 to 1 — how sure the reading is"),
  note: z
    .string()
    .nullable()
    .describe("What made it hard, or what the handwriting actually shows"),
});

export const ReadingSchema = z.object({
  performerRowFound: z
    .boolean()
    .describe("Whether the named performer's row was found on the card"),
  showName: z
    .string()
    .nullable()
    .describe("PICTURE TITLE / SERIES TITLE as printed, plus the episode if one is shown"),
  workDate: z
    .string()
    .nullable()
    .describe("YYYY-MM-DD — the DATE on the card, a handwritten correction winning over the printed one"),
  character: z
    .string()
    .nullable()
    .describe("The CHARACTER column of the performer's row, as written"),
  workStatusMark: z
    .string()
    .nullable()
    .describe("The W/S/F/R/T style letter(s) in the performer's row, as written"),
  callTime: time.describe(
    "MAKE-UP / HAIR / WRDRBE report time (the call), 24-hour HH:MM or null"
  ),
  reportOnSet: time.describe("REPORT ON SET, 24-hour HH:MM or null"),
  ndMealIn: time.describe("N.D. BRKFST — OUT column (when it began), or null"),
  ndMealOut: time.describe("N.D. BRKFST — IN column (when it ended), or null"),
  firstMealStart: time.describe("1ST MEAL — OUT column (when lunch began), or null"),
  firstMealFinish: time.describe("1ST MEAL — IN column (when lunch ended), or null"),
  secondMealStart: time.describe("2ND MEAL — OUT column (when it began), or null"),
  secondMealFinish: time.describe("2ND MEAL — IN column (when it ended), or null"),
  dismissOnSet: time.describe("DISMISS ON SET, 24-hour HH:MM or null"),
  dismissMakeupWardrobe: time.describe(
    "DISMISS MU/HAIR/WRDRBE (the wrap), 24-hour HH:MM or null"
  ),
  stuntAdjustment: z
    .number()
    .nullable()
    .describe("STUNT ADJUST as dollars (100, 250, 500, 1000, 5000…), or null when blank"),
  travel: z
    .string()
    .nullable()
    .describe("Anything in the TRAVEL TIME columns for this row, as written, or null"),
  otherNotes: z
    .string()
    .nullable()
    .describe(
      "Anything else on the row or card worth keeping: mileage, MPV, a remark, a signature note"
    ),
  fieldConfidence: z
    .array(FieldConfidenceSchema)
    .describe("One entry per field that was read, hardest first"),
});

export type Reading = z.infer<typeof ReadingSchema>;

/** The fields a reading pre-fills and is scored on, with their kinds. */
export const SCORED_FIELDS = [
  ["showName", "text"],
  ["workDate", "date"],
  ["character", "text"],
  ["callTime", "time"],
  ["ndMealIn", "time"],
  ["firstMealStart", "time"],
  ["firstMealFinish", "time"],
  ["secondMealStart", "time"],
  ["secondMealFinish", "time"],
  ["dismissOnSet", "time"],
  ["dismissMakeupWardrobe", "time"],
  ["stuntAdjustment", "money"],
] as const;

export type ScoredField = (typeof SCORED_FIELDS)[number][0];
export type FieldKind = (typeof SCORED_FIELDS)[number][1];
