/**
 * Rest between wrapping one day and being called the next.
 *
 * This one really is derivable: the wrap on Tuesday and the call on
 * Wednesday are both already logged, so the gap between them can be worked
 * out rather than remembered. A short turnaround is money — it is the thing
 * performers most often fail to notice and never claim.
 *
 * The minimum is a term of the deal, not a constant, so it is passed in.
 * Nothing here decides what a short turnaround is owed; it reports the gap
 * and whether it fell under the figure it was given.
 */

import type { WorkRecord } from "@/types";

/**
 * The figure to check against unless the deal says otherwise. Contracts
 * differ — this is a starting point, not a rule the app is sure of.
 */
export const DEFAULT_TURNAROUND_HOURS = 11;

const DAY_MIN = 24 * 60;

function dayStart(workDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(workDate || "");
  if (!m) return null;
  return (
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 60000
  );
}

function clock(time: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time || "");
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes < DAY_MIN ? minutes : null;
}

/** When the performer was released — the wrap if there is one, else the set dismissal. */
function releasedAt(record: WorkRecord): number | null {
  const start = dayStart(record.workDate);
  const call = clock(record.callTime);
  const wrap =
    clock(record.dismissMakeupWardrobe) ?? clock(record.dismissOnSet);
  if (start === null || wrap === null) return null;
  // A day that wrapped after midnight carries into the next date.
  const overnight = call !== null && wrap < call ? DAY_MIN : 0;
  return start + wrap + overnight;
}

function calledAt(record: WorkRecord): number | null {
  const start = dayStart(record.workDate);
  const call = clock(record.callTime);
  if (start === null || call === null) return null;
  return start + call;
}

export interface Turnaround {
  /** The day that wrapped. */
  from: WorkRecord;
  /** The day called after it. */
  to: WorkRecord;
  /** Hours of rest between the two, to one decimal. */
  hours: number;
  /** True when that is less than the minimum it was checked against. */
  short: boolean;
}

/**
 * Rest between each day and the one after it, for days that carry both a
 * wrap and a call. Days that do not are skipped rather than guessed at.
 */
export function turnaroundsFor(
  records: WorkRecord[],
  minimumHours: number = DEFAULT_TURNAROUND_HOURS
): Turnaround[] {
  const inOrder = [...records].sort((a, b) =>
    a.workDate.localeCompare(b.workDate)
  );

  const out: Turnaround[] = [];
  for (let i = 0; i < inOrder.length - 1; i++) {
    const released = releasedAt(inOrder[i]);
    const called = calledAt(inOrder[i + 1]);
    if (released === null || called === null) continue;

    const minutes = called - released;
    // A negative gap means the times cannot both be right; say nothing
    // rather than report a rest that did not happen.
    if (minutes < 0) continue;

    const hours = Math.round((minutes / 60) * 10) / 10;
    out.push({
      from: inOrder[i],
      to: inOrder[i + 1],
      hours,
      short: hours < minimumHours,
    });
  }
  return out;
}
