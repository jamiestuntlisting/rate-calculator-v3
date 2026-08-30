/**
 * What the bundled reference export is, without the export itself.
 *
 * Split from showbiz-sample.ts so a client component can name the file
 * without pulling 65 KB of base64 into the browser bundle.
 */
export const SHOWBIZ_SAMPLE = {
  filename: "ShowBiz_SAG_Cards_Anonymized_042826.csv",
  cards: 414,
  weeklyCards: 133,
} as const;
