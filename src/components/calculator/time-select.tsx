"use client";

import { useEffect, useId, useState } from "react";
import { Label } from "@/components/ui/label";

/**
 * The minutes a time is normally called at: tenths of an hour plus the
 * quarter-hours, in clock order. These are what the dropdown offers; a typed
 * time is taken as given, and the engine rounds worked time up to the next
 * tenth of an hour in the performer's favour.
 */
export const MINUTE_OPTIONS = [
  0, 6, 12, 15, 18, 24, 30, 36, 42, 45, 48, 54,
] as const;

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Every offered time, in clock order from midnight. */
const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (const meridiem of ["AM", "PM"]) {
    for (const hour of [...HOURS_12].sort((a, b) => (a % 12) - (b % 12))) {
      for (const minute of MINUTE_OPTIONS) {
        out.push(`${hour}:${String(minute).padStart(2, "0")} ${meridiem}`);
      }
    }
  }
  return out;
})();

/** "14:30" -> "2:30 PM"; anything unparseable comes back empty. */
export function toDisplay(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || "");
  if (!match) return "";
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return "";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** How long a meal runs when nobody says otherwise. */
export const MEAL_MINUTES = 30;

/** "15:00" + 30 -> "15:30", wrapping past midnight. */
export function addMinutes(time: string, minutes: number): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return "";
  const total =
    (Number(match[1]) * 60 + Number(match[2]) + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60
  ).padStart(2, "0")}`;
}

const minutesOf = (value: string): number | null => {
  const m = /^(\d{2}):(\d{2})$/.exec(value || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Parse what someone actually types: "9", "938", "9:38", "9:38p",
 * "9:38 PM", "21:38".
 *
 * `after` is the time this one has to follow — the call, or whatever came
 * before it in the day. Given one, a bare hour of 1–12 resolves to whichever
 * meridiem lands soonest at or after it: type "3" against an 11am call and
 * it is 3pm four hours later, not 3am sixteen hours later. Without one, a
 * bare time is still read on a 24-hour clock.
 *
 * An am/pm the performer actually typed is never second-guessed, and neither
 * is an hour of 13–23, which can only mean one thing.
 */
export function parseTime(input: string, after?: string): string | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  const match = /^(\d{1,2})[:.\s]?(\d{2})?\s*([ap])?\.?m?\.?$/.exec(text);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];

  if (minute > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === "p" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  } else if (hour >= 1 && hour <= 12) {
    const reference = after ? minutesOf(after) : null;
    if (reference !== null) {
      const morning = (hour % 12) * 60 + minute;
      const evening = morning + 12 * 60;
      // Whichever comes round first from the reference. A day can run past
      // midnight, so this is measured on the clock rather than on the number.
      const wait = (t: number) => (t - reference + 24 * 60) % (24 * 60);
      hour = Math.floor((wait(morning) <= wait(evening) ? morning : evening) / 60);
    }
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Whichever reading comes round first from the reference, first. */
function orderByReference(times: string[], after?: string): string[] {
  const reference = after ? minutesOf(after) : null;
  if (reference === null) return times;
  const wait = (t: string) => {
    const parsed = parseTime(t);
    const m = parsed ? minutesOf(parsed) : null;
    return m === null ? Infinity : (m - reference + 24 * 60) % (24 * 60);
  };
  return [...times].sort((a, b) => wait(a) - wait(b));
}

/**
 * What to offer while someone is typing.
 *
 * A whole time typed out leaves only one thing undecided — which half of
 * the day it is — so those are the only two offered. Offering 11:06 and
 * 11:12 to someone who has just typed 1100 is the list ignoring what they
 * said. An hour on its own still offers that hour's minutes, and an am or
 * pm they typed settles it outright.
 */
export function timeOptionsFor(text: string, after?: string): string[] {
  const trimmed = (text || "").trim().toLowerCase();
  if (!trimmed) return TIME_OPTIONS;

  const match = /^(\d{1,2})[:.\s]?(\d{2})?\s*([ap])?\.?m?\.?$/.exec(trimmed);
  if (!match) return TIME_OPTIONS;

  const hour = Number(match[1]);
  const minute = match[2] === undefined ? null : Number(match[2]);
  const meridiem = match[3];
  if (hour > 23 || (minute !== null && minute > 59)) return TIME_OPTIONS;

  const at = (h: number, m: number) =>
    toDisplay(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);

  if (meridiem) {
    if (hour < 1 || hour > 12) return TIME_OPTIONS;
    return [at((hour % 12) + (meridiem === "p" ? 12 : 0), minute ?? 0)];
  }

  // Midnight and 13-23 can only be read one way.
  if (hour === 0 || hour > 12) {
    return minute !== null
      ? [at(hour, minute)]
      : MINUTE_OPTIONS.map((m) => at(hour, m));
  }

  const morning = hour % 12;
  if (minute !== null) {
    return orderByReference([at(morning, minute), at(morning + 12, minute)], after);
  }

  // Still only an hour: offer its minutes, the likelier half of the day first.
  return orderByReference([at(morning, 0), at(morning + 12, 0)], after).flatMap(
    (first) => {
      const h = first.endsWith("PM") ? morning + 12 : morning;
      return MINUTE_OPTIONS.map((m) => at(h, m));
    }
  );
}

interface TimeSelectProps {
  id: string;
  label?: string;
  /** "HH:MM" on a 24-hour clock, or "" when unset. */
  value: string;
  onChange: (value: string) => void;
  clearable?: boolean;
  compact?: boolean;
  /**
   * The time this field follows — the call, or whatever precedes it in the
   * day. A bare hour typed with no am/pm resolves to whichever meridiem
   * comes round first after it.
   */
  after?: string;
}

/**
 * One field for a time: type it, or open the list and pick one. A native
 * datalist gives both without a bespoke dropdown, and keeps the phone
 * keyboard and suggestion list behaving the way people expect.
 */
export function TimeSelect({
  id,
  label,
  value,
  onChange,
  compact = false,
  after,
}: TimeSelectProps) {
  const listId = `${useId()}-times`;
  const [text, setText] = useState(() => toDisplay(value));

  // Follow the value when it changes elsewhere (loading a saved record),
  // but leave what is being typed alone.
  const [lastValue, setLastValue] = useState(value);
  useEffect(() => {
    if (value !== lastValue) {
      setLastValue(value);
      setText(toDisplay(value));
    }
  }, [value, lastValue]);

  const commit = () => {
    if (!text.trim()) {
      setLastValue("");
      onChange("");
      return;
    }
    const parsed = parseTime(text, after);
    if (parsed) {
      setLastValue(parsed);
      setText(toDisplay(parsed));
      onChange(parsed);
    } else {
      // Unreadable — put back what was there rather than lose the time.
      setText(toDisplay(value));
    }
  };

  return (
    <div className="space-y-1 w-full min-w-0">
      {label && (
        <Label htmlFor={id} className="text-base">
          {label}
        </Label>
      )}
      <input
        id={id}
        list={listId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="9:30 AM"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            e.currentTarget.blur();
          }
        }}
        className={
          "w-full min-w-0 rounded-md border border-input bg-background " +
          "focus:outline-none focus:ring-2 focus:ring-ring " +
          (compact ? "h-11 px-2 text-base" : "h-12 px-3 text-lg")
        }
      />
      <datalist id={listId}>
        {timeOptionsFor(text, after).map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}
