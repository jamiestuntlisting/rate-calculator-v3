import { SCORED_FIELDS, type FieldKind, type Reading, type ScoredField } from "./schema";

/**
 * How well Claude read a card, field by field, against what the
 * performer finally saved. One outcome per field:
 *
 *   exact     the same value
 *   small     close — a time within 15 minutes, money within $50, text
 *             that differs only in case, spacing or a contained word
 *   meridiem  a time exactly twelve hours out: AM read as PM or back —
 *             the classic error, so it gets its own bucket
 *   large     wrong by more than that
 *   missed    Claude left it blank and the performer filled it
 *   spurious  Claude filled it and the performer left it blank
 *   blank     both blank — not counted in any average
 *
 * The batting average is exact hits over counted fields; "close enough"
 * adds the small ones. Both are kept because a prompt change can move
 * one without the other.
 */

export type Outcome =
  | "exact"
  | "small"
  | "meridiem"
  | "large"
  | "missed"
  | "spurious"
  | "blank";

export interface FieldScore {
  field: ScoredField;
  kind: FieldKind;
  readValue: string | null;
  finalValue: string | null;
  outcome: Outcome;
  /** Minutes for a time, dollars for money (final − read); null otherwise. */
  delta: number | null;
}

const SMALL_MINUTES = 15;
const SMALL_DOLLARS = 50;

const isBlank = (v: unknown) =>
  v == null || (typeof v === "string" && v.trim() === "") || v === 0;

const toMinutes = (v: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

const normalizeText = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

const asString = (v: unknown): string | null => {
  if (isBlank(v)) return null;
  return String(v).trim();
};

/** Score one field: what was read against what was finally saved. */
export function scoreField(
  kind: FieldKind,
  read: unknown,
  final: unknown
): { outcome: Outcome; delta: number | null } {
  const r = asString(read);
  const f = asString(final);
  if (r == null && f == null) return { outcome: "blank", delta: null };
  if (r == null) return { outcome: "missed", delta: null };
  if (f == null) return { outcome: "spurious", delta: null };

  if (kind === "time") {
    const a = toMinutes(r);
    const b = toMinutes(f);
    if (a == null || b == null) {
      return { outcome: r === f ? "exact" : "large", delta: null };
    }
    let delta = b - a;
    if (delta > 720) delta -= 1440;
    if (delta < -720) delta += 1440;
    const gap = Math.abs(delta);
    if (gap === 0) return { outcome: "exact", delta: 0 };
    if (gap === 720) return { outcome: "meridiem", delta };
    if (gap <= SMALL_MINUTES) return { outcome: "small", delta };
    return { outcome: "large", delta };
  }

  if (kind === "money") {
    const a = Number(r);
    const b = Number(f);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return { outcome: r === f ? "exact" : "large", delta: null };
    }
    const delta = b - a;
    if (delta === 0) return { outcome: "exact", delta: 0 };
    if (Math.abs(delta) <= SMALL_DOLLARS) return { outcome: "small", delta };
    return { outcome: "large", delta };
  }

  if (kind === "date") {
    if (r === f) return { outcome: "exact", delta: null };
    const a = Date.parse(r.slice(0, 10));
    const b = Date.parse(f.slice(0, 10));
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const days = Math.abs(b - a) / 86_400_000;
      if (days <= 2) return { outcome: "small", delta: Math.round((b - a) / 86_400_000) };
    }
    return { outcome: "large", delta: null };
  }

  // text
  const a = normalizeText(r);
  const b = normalizeText(f);
  if (a === b) return { outcome: "exact", delta: null };
  if (a.includes(b) || b.includes(a)) return { outcome: "small", delta: null };
  return { outcome: "large", delta: null };
}

/** What the performer finally saved, in the reading's field names. */
export interface FinalRow {
  showName?: string | null;
  workDate?: string | null;
  character?: string | null;
  callTime?: string | null;
  ndMealIn?: string | null;
  firstMealStart?: string | null;
  firstMealFinish?: string | null;
  secondMealStart?: string | null;
  secondMealFinish?: string | null;
  dismissOnSet?: string | null;
  dismissMakeupWardrobe?: string | null;
  stuntAdjustment?: string | number | null;
}

/** Score every field a reading is judged on. */
export function scoreReading(reading: Partial<Reading>, final: FinalRow): FieldScore[] {
  return SCORED_FIELDS.map(([field, kind]) => {
    const read = reading[field];
    const fin = final[field];
    const { outcome, delta } = scoreField(kind, read, fin);
    return {
      field,
      kind,
      readValue: asString(read),
      finalValue: asString(fin),
      outcome,
      delta,
    };
  });
}

export interface BattingAverage {
  /** Fields with something to compare (both blank are left out). */
  counted: number;
  exact: number;
  small: number;
  meridiem: number;
  large: number;
  missed: number;
  spurious: number;
  /** exact / counted, 0–1; null with nothing counted. */
  average: number | null;
  /** (exact + small) / counted. */
  closeEnough: number | null;
}

/** The batting average over any set of field scores. */
export function battingAverage(
  scores: Array<{ outcome: string }>
): BattingAverage {
  const tally = { exact: 0, small: 0, meridiem: 0, large: 0, missed: 0, spurious: 0 };
  for (const s of scores) {
    if (s.outcome in tally) tally[s.outcome as keyof typeof tally] += 1;
  }
  const counted = Object.values(tally).reduce((a, b) => a + b, 0);
  return {
    counted,
    ...tally,
    average: counted ? tally.exact / counted : null,
    closeEnough: counted ? (tally.exact + tally.small) / counted : null,
  };
}
