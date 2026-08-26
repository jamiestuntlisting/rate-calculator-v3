/**
 * Parser for ShowBiz "SAG Cards Export" CSV files.
 *
 * Format notes live in docs/showbiz-csv-format.md. In short: UTF-16 encoded,
 * 280 columns, no header row, and several columns pack one value per worked
 * day separated by ASCII Group Separator (0x1D).
 */

/** Column indices, verified against a 414-card export. */
const COL = {
  cardNumber: 9,
  cardId: 12,
  firstName: 54,
  lastName: 57,
  payrollCompany: 101,
  productionCompany: 102,
  project: 103,
  contractCategory: 142,
  cardDate: 157,
  studio: 158,
  production: 159,
  employmentType: 182,
  /** Hours at 1.5x from exceeding the weekly guarantee. */
  weeklyOvertimeHours: 183,
  contractType: 184,
  guaranteedHours: 185,
  contractRate: 188,
  derivedRate: 189,
  /** Allowances and meal penalties, added after the subtotal. */
  postSubtotalAdjustments: 190,
  sixthDay: 191,
  seventhDay: 192,
  extras: 194,
  role: 196,
  sagCategory: 200,
  location: 201,
  /** Per-day stunt adjustments; the week's figure is their sum. */
  adjustmentsPerDay: 202,
  /** Hours at 1.5x from daily overtime. */
  dailyOvertimeHours: 205,
  /** Hours at 2x. */
  doubleTimeHours: 206,
  /** Hours at 1.5x from penalties. */
  penaltyOvertimeHours: 207,
  gross: 209,
  subtotal: 211,
  baseScaleRate: 214,
  datesWorked: 252,
  daysWorked: 253,
  hoursPerDay: 257,
  dayCodes: 276,
} as const;

const GROUP_SEPARATOR = "\x1d";

export interface ShowbizCard {
  /** Position in the file, so a card can be pointed at unambiguously. */
  index: number;
  cardId: string;
  performer: string;
  cardDate: string;
  production: string;
  studio: string;
  employmentType: string;
  contractType: string;
  sagCategory: string;
  role: string;
  /** "Studio" or "Distant" (overnight location). */
  location: string;
  guaranteedHours: number;
  contractRate: number;
  derivedRate: number;
  baseScaleRate: number;
  /**
   * Per-day stunt adjustments (col 202). The week's adjustment figure is the
   * sum of these — not col 190, which is a different number that lands after
   * the subtotal.
   */
  adjustmentsPerDay: number[];
  dailyOvertimeHours: number;
  doubleTimeHours: number;
  penaltyOvertimeHours: number;
  weeklyOvertimeHours: number;
  /** Allowances and meal penalties added after the subtotal (col 190). */
  postSubtotalAdjustments: number;
  isSixthDay: boolean;
  isSeventhDay: boolean;
  extras: string;
  daysWorked: number;
  datesWorked: string[];
  hoursPerDay: number[];
  dayCodes: string[];
  /** What ShowBiz paid — the number our calculation has to reproduce. */
  gross: number;
  subtotal: number;
}

/** Strip $ and thousands separators; empty or unparseable becomes 0. */
export function parseMoney(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Split a packed multi-day field into its non-empty values. */
export function splitDays(value: string): string[] {
  if (!value) return [];
  return value
    .split(GROUP_SEPARATOR)
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Decode a ShowBiz export. The files are UTF-16 (little-endian, BOM) but
 * accept UTF-8 too, since a file may have been converted on the way in.
 */
export function decodeShowbizFile(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buffer);
  }
  return new TextDecoder("utf-8").decode(buffer);
}

/** Split one CSV line into fields, honouring "" quoting. */
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export function parseShowbizCsv(text: string): ShowbizCard[] {
  const cards: ShowbizCard[] = [];

  const lines = text.split(/\r\n|\r|\n/);
  let index = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const f = parseLine(line);
    // Real cards have the full column set; anything shorter is a stray line.
    if (f.length < 277) continue;

    const get = (i: number) => (f[i] ?? "").trim();
    index++;

    cards.push({
      index,
      cardId: get(COL.cardId),
      performer: `${get(COL.firstName)} ${get(COL.lastName)}`.trim(),
      cardDate: get(COL.cardDate),
      production: get(COL.production),
      studio: get(COL.studio),
      employmentType: get(COL.employmentType),
      contractType: get(COL.contractType),
      sagCategory: get(COL.sagCategory),
      role: get(COL.role),
      location: get(COL.location),
      guaranteedHours: parseMoney(get(COL.guaranteedHours)),
      contractRate: parseMoney(get(COL.contractRate)),
      derivedRate: parseMoney(get(COL.derivedRate)),
      baseScaleRate: parseMoney(get(COL.baseScaleRate)),
      adjustmentsPerDay: splitDays(get(COL.adjustmentsPerDay)).map(parseMoney),
      dailyOvertimeHours: parseMoney(get(COL.dailyOvertimeHours)),
      doubleTimeHours: parseMoney(get(COL.doubleTimeHours)),
      penaltyOvertimeHours: parseMoney(get(COL.penaltyOvertimeHours)),
      weeklyOvertimeHours: parseMoney(get(COL.weeklyOvertimeHours)),
      postSubtotalAdjustments: parseMoney(get(COL.postSubtotalAdjustments)),
      isSixthDay: get(COL.sixthDay).toLowerCase().includes("6th"),
      isSeventhDay: get(COL.seventhDay).toLowerCase().includes("7th"),
      extras: get(COL.extras),
      daysWorked: parseMoney(get(COL.daysWorked)),
      datesWorked: splitDays(get(COL.datesWorked)),
      hoursPerDay: splitDays(get(COL.hoursPerDay)).map(parseMoney),
      dayCodes: splitDays(get(COL.dayCodes)),
      gross: parseMoney(get(COL.gross)),
      subtotal: parseMoney(get(COL.subtotal)),
    });
  }

  return cards;
}

export function isWeeklyCard(card: ShowbizCard): boolean {
  return card.employmentType.toLowerCase().includes("weekly");
}
