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

/**
 * Parse what someone actually types: "9", "938", "9:38", "9:38p",
 * "9:38 PM", "21:38". Bare times without am/pm are read on a 24-hour clock,
 * so "21:38" and "9:38 PM" both work and nothing is guessed.
 */
export function parseTime(input: string): string | null {
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
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

interface TimeSelectProps {
  id: string;
  label?: string;
  /** "HH:MM" on a 24-hour clock, or "" when unset. */
  value: string;
  onChange: (value: string) => void;
  clearable?: boolean;
  compact?: boolean;
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
    const parsed = parseTime(text);
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
        {TIME_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}
