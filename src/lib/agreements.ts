import { RATES, type RateSchedule } from "@/lib/rate-constants";

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
  { id: "stunt_coordinator", name: "Stunt Coordinator" },
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
];

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
  // Saved before Theatrical and Television were shown as one thing.
  if (id === "television") return "Theatrical / Television";
  return "Theatrical / Television";
}

/** "Low Budget ($833.95/day)" — the name plus what it pays. */
export function agreementLabel(id: string): string {
  const rates = RATES[id as RateSchedule] ?? RATES.theatrical_basic;
  return `${agreementName(id)} (${dayRate(rates.daily)})`;
}

/** The day rate a record is calculated on, flat deal or schedule. */
export function dayRateFor(
  id: string | null | undefined,
  flatDayRate?: number | null
): number {
  if (flatDayRate != null && flatDayRate > 0) return flatDayRate;
  return (RATES[id as RateSchedule] ?? RATES.theatrical_basic).daily;
}
