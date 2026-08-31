import {
  RATES,
  ratesForDate,
  threeDayRatesForDate,
  type RateSchedule,
  type ThreeDayLength,
} from "@/lib/rate-constants";

/**
 * The agreements a performer can pick, in the order they are offered.
 *
 * This is the only place the list is written down. `RATES` carries more
 * schedules than this — `television` is kept there so records saved under
 * it still calculate, but it is not offered: it pays the same as
 * Theatrical Basic, so one entry covers both and there is nothing to
 * explain. If the two ever diverge, split this entry and the old records
 * keep working either way.
 */
export const AGREEMENTS: ReadonlyArray<{
  id: RateSchedule;
  name: string;
  /** What the tier is, for anyone who has not met it before. */
  note?: string;
}> = [
  { id: "theatrical_basic", name: "Theatrical / Television" },
  {
    id: "low_budget",
    name: "Low Budget",
    note: "65% of basic scale",
  },
  {
    id: "modified_low_budget",
    name: "Modified Low Budget",
    note: "35% of basic scale",
  },
  {
    id: "ultra_low_budget",
    name: "Ultra Low Budget / Short Project",
    note: "20% of basic scale",
  },
  // Coordinators last: most people picking are performers.
  {
    id: "stunt_coordinator",
    name: "Stunt Coordinator — flat deal",
    note: "One number for the day, no overtime",
  },
  {
    id: "stunt_coordinator_daily",
    name: "Stunt Coordinator — daily",
    note: "Day rate, and overtime like anyone else",
  },
];

/**
 * What a 3-day (TV) contract offers: the player rates split by the
 * show's format, and the coordinator flat-deal 3-day the same way. Low
 * budget tiers have no 3-day rates — they are theatrical agreements —
 * so the 3-day picker offers exactly these.
 */
export const THREE_DAY_OPTIONS: ReadonlyArray<{
  workStatus: RateSchedule;
  length: ThreeDayLength;
  name: string;
}> = [
  { workStatus: "theatrical_basic", length: "short", name: "TV 3-day · ½ & 1-hr show" },
  { workStatus: "theatrical_basic", length: "long", name: "TV 3-day · 1½ & 2-hr show" },
  { workStatus: "stunt_coordinator", length: "short", name: "Coordinator flat 3-day · ½ & 1-hr" },
  { workStatus: "stunt_coordinator", length: "long", name: "Coordinator flat 3-day · 1½ & 2-hr" },
];

/** The 3-day contract figure for an agreement + show format, by date. */
export function threeDayContractRate(
  workStatus: string | null | undefined,
  length: ThreeDayLength | null | undefined,
  workDate?: string | null
): number {
  const t = threeDayRatesForDate(workDate);
  const coordinator = workStatus === "stunt_coordinator";
  return (length ?? "short") === "long"
    ? coordinator
      ? t.coordFlatLong
      : t.performerLong
    : coordinator
      ? t.coordFlatShort
      : t.performerShort;
}

/** "TV 3-day · ½ & 1-hr show ($3,252 / 3 days)". */
export function threeDayLabel(
  option: (typeof THREE_DAY_OPTIONS)[number],
  workDate?: string | null
): string {
  const rate = threeDayContractRate(option.workStatus, option.length, workDate);
  return `${option.name} ($${rate.toLocaleString("en-US")} / 3 days)`;
}

/**
 * Deals whose flatness comes from the contract itself: the picker offers
 * them beside the schedules, the performer types the rate, and the day
 * pays that number however long it ran. A commercial is the standing
 * example — it is not on the Basic Agreement, so calculating it at scale
 * would state a figure nobody is owed; the typed rate is the truth.
 */
export const FLAT_AGREEMENTS = [
  { id: "commercial", name: "Commercial", note: "Type the day rate from the deal" },
  { id: "flat_deal", name: "Flat deal", note: "Any contract that names one number" },
] as const;

export function isFlatAgreement(id: string | null | undefined): boolean {
  return id === "commercial" || id === "flat_deal";
}

/** "$1,283/day", and "$833.95/day" where the tier lands on cents. */
export function dayRate(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}/day`;
}

/** What to call a schedule, including the ones no longer offered. */
export function agreementName(id: string): string {
  const offered = AGREEMENTS.find((a) => a.id === id);
  if (offered) return offered.name;
  const flat = FLAT_AGREEMENTS.find((a) => a.id === id);
  if (flat) return flat.name;
  // Saved before Theatrical and Television were shown as one thing.
  if (id === "television") return "Theatrical / Television";
  return "Theatrical / Television";
}

/** "Low Budget ($833.95/day)" — the name plus what it pays. */
export function agreementLabel(id: string, workDate?: string | null): string {
  // Labeled at the schedule in force on the day being logged — a 2025
  // day offers 2025 figures, matching what the engine will pay.
  const table = ratesForDate(workDate);
  const rates = table[id as RateSchedule] ?? table.theatrical_basic;
  return `${agreementName(id)} (${dayRate(rates.daily)})`;
}

/** "$4,785/wk", cents only where the tier lands on them. */
export function weekRate(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}/wk`;
}

/**
 * The same agreement, named with its weekly scale — what the picker shows
 * when the day being logged belongs to a weekly contract. Same list, same
 * ids: a weekly Theatrical performer is still `theatrical_basic`, the
 * weekliness lives on the record, and the days are added into a week on
 * /weekly.
 */
export function weeklyAgreementLabel(id: string, workDate?: string | null): string {
  const table = ratesForDate(workDate);
  const rates = table[id as RateSchedule] ?? table.theatrical_basic;
  return `${agreementName(id)} (${weekRate(rates.weekly)})`;
}

/**
 * The day a weekly contract buys, approximately: the weekly scale spread
 * over five days, so five straight days sum back to the weekly exactly.
 * It is an approximation and is always shown with an asterisk — the week
 * itself is worked out for real on /weekly, where the 44/48-hour guarantee
 * and weekly overtime live. Kept here rather than in the vendored engine
 * because "divide by five" is this app's convention, not contract text.
 */
export function weeklyEquivalentDayRate(
  id: string | null | undefined,
  workDate?: string | null
): number {
  const table = ratesForDate(workDate);
  const weekly = (table[id as RateSchedule] ?? table.theatrical_basic).weekly;
  return Math.round((weekly / 5) * 100) / 100;
}

/** The day rate a record is calculated on, flat deal or schedule. */
export function dayRateFor(
  id: string | null | undefined,
  flatDayRate?: number | null,
  workDate?: string | null
): number {
  if (flatDayRate != null && flatDayRate > 0) return flatDayRate;
  const table = ratesForDate(workDate);
  return (table[id as RateSchedule] ?? table.theatrical_basic).daily;
}
