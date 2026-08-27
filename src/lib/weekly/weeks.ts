/**
 * Split a set of logged work days into the weeks they belong to.
 *
 * A weekly contract is one week's guarantee, so a run spanning three weeks
 * is three contracts and three calculations — never one long one. The
 * weekly engine prorates the base over five days and pays days beyond that
 * as premiums, so a group has to be a week and not simply a run: ten
 * consecutive days with no break is two weeks, not a ten-day week.
 *
 * Weeks are taken to start on Sunday, which is the usual production
 * payroll week. Each group says which Sunday it runs from, so a week that
 * has been split the wrong way is visible rather than silent.
 */

import type { WorkRecord } from "@/types";

/** 0 = Sunday. */
export const WEEK_STARTS_ON = 0;

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

/** The Sunday on or before a given day. */
export function weekStartOf(workDate: string): string | null {
  const date = toUtc(workDate);
  if (!date) return null;
  const shift = (date.getUTCDay() - WEEK_STARTS_ON + 7) % 7;
  return iso(new Date(date.getTime() - shift * DAY_MS));
}

export interface WorkWeek {
  /** "YYYY-MM-DD" of the Sunday this week runs from. */
  start: string;
  /** The days that fall in it, earliest first. */
  records: WorkRecord[];
}

/** Group days into weeks, earliest week first. A day with no readable date is dropped. */
export function groupIntoWeeks(records: WorkRecord[]): WorkWeek[] {
  const weeks = new Map<string, WorkRecord[]>();

  for (const record of records) {
    const start = weekStartOf(record.workDate);
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
