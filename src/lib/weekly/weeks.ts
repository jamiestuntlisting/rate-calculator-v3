/**
 * Split a set of logged work days into the weeks they belong to.
 *
 * A weekly contract is one week's guarantee, so a run spanning three weeks
 * is three contracts and three calculations — never one long one. The
 * weekly engine prorates the base over five days and pays days beyond that
 * as premiums, so a group has to be a week and not simply a run: ten
 * consecutive days with no break is two weeks, not a ten-day week.
 *
 * Weeks start Monday unless told otherwise. Productions differ, so the day
 * is a setting rather than a constant, and each group says which date it
 * runs from — a week split the wrong way shows rather than hides.
 */

import type { WorkRecord } from "@/types";

/** 0 = Sunday … 6 = Saturday. */
export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Monday, unless a production runs its week differently. */
export const DEFAULT_WEEK_STARTS_ON: WeekStartDay = 1;

export const WEEK_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" to a UTC date, so no timezone shifts the day. */
function toUtc(workDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(workDate || "");
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
}

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** The start of the week a given day falls in. */
export function weekStartOf(
  workDate: string,
  startsOn: WeekStartDay = DEFAULT_WEEK_STARTS_ON
): string | null {
  const date = toUtc(workDate);
  if (!date) return null;
  const shift = (date.getUTCDay() - startsOn + 7) % 7;
  return iso(new Date(date.getTime() - shift * DAY_MS));
}

export interface WorkWeek {
  /** "YYYY-MM-DD" of the day this week runs from. */
  start: string;
  /** The days that fall in it, earliest first. */
  records: WorkRecord[];
}

/** Group days into weeks, earliest week first. A day with no readable date is dropped. */
export function groupIntoWeeks(
  records: WorkRecord[],
  startsOn: WeekStartDay = DEFAULT_WEEK_STARTS_ON
): WorkWeek[] {
  const weeks = new Map<string, WorkRecord[]>();

  for (const record of records) {
    const start = weekStartOf(record.workDate, startsOn);
    if (!start) continue;
    const list = weeks.get(start);
    if (list) list.push(record);
    else weeks.set(start, [record]);
  }

  return [...weeks.entries()]
    .map(([start, list]) => ({
      start,
      records: [...list].sort((a, b) => a.workDate.localeCompare(b.workDate)),
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** "Week of 23 Aug 2026". */
export function weekLabel(start: string): string {
  const date = toUtc(start);
  if (!date) return "Week";
  return `Week of ${date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}
