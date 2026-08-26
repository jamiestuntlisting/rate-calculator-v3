"use client";

import { Label } from "@/components/ui/label";

/**
 * The only minutes a time can be set to: tenths of an hour (0, 6, 12 …)
 * plus the quarter-hours productions also call, in clock order.
 */
export const MINUTE_OPTIONS = [
  0, 6, 12, 15, 18, 24, 30, 36, 42, 45, 48, 54,
] as const;

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

interface TimeSelectProps {
  id: string;
  label?: string;
  /** "HH:MM" on a 24-hour clock, or "" when unset. */
  value: string;
  onChange: (value: string) => void;
  /** Optional fields can be cleared back to empty. */
  clearable?: boolean;
  /** Tighter spacing, for two pickers side by side on a phone. */
  compact?: boolean;
}

function parse(value: string): { hour12: number; minute: number; pm: boolean } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || "");
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { hour12: h % 12 === 0 ? 12 : h % 12, minute: m, pm: h >= 12 };
}

function toValue(hour12: number, minute: number, pm: boolean): string {
  const h = (hour12 % 12) + (pm ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * A time field built from native selects, so phones show a wheel containing
 * only the allowed minutes — `<input type="time">` ignores `step` on iOS and
 * offers all sixty.
 */
export function TimeSelect({
  id,
  label,
  value,
  onChange,
  clearable = false,
  compact = false,
}: TimeSelectProps) {
  const parsed = parse(value);

  // A time saved before these options existed (or typed elsewhere) still has
  // to be selectable, so keep it in the list rather than silently moving it.
  const minutes: number[] = parsed && !MINUTE_OPTIONS.includes(parsed.minute as never)
    ? [...MINUTE_OPTIONS, parsed.minute].sort((a, b) => a - b)
    : [...MINUTE_OPTIONS];

  const set = (part: Partial<{ hour12: number; minute: number; pm: boolean }>) => {
    const base = parsed ?? { hour12: 12, minute: 0, pm: false };
    const next = { ...base, ...part };
    onChange(toValue(next.hour12, next.minute, next.pm));
  };

  const selectClass =
    "flex-1 min-w-0 rounded-md border border-input bg-background " +
    "focus:outline-none focus:ring-2 focus:ring-ring " +
    (compact ? "h-11 px-0.5 text-base" : "h-12 px-1 text-lg");

  return (
    <div className="space-y-1 w-full min-w-0">
      {label && (
        <Label htmlFor={`${id}-hour`} className="text-base">
          {label}
        </Label>
      )}
      <div className={`flex items-center w-full ${compact ? "gap-0.5" : "gap-1"}`}>
        <select
          id={`${id}-hour`}
          aria-label={label ? `${label} hour` : "Hour"}
          className={selectClass}
          value={parsed ? parsed.hour12 : ""}
          onChange={(e) =>
            e.target.value === ""
              ? onChange("")
              : set({ hour12: Number(e.target.value) })
          }
        >
          <option value="">--</option>
          {HOURS_12.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        <span className="text-muted-foreground text-sm shrink-0">:</span>

        <select
          id={`${id}-minute`}
          aria-label={label ? `${label} minutes` : "Minutes"}
          className={selectClass}
          value={parsed ? parsed.minute : ""}
          onChange={(e) =>
            e.target.value === ""
              ? onChange("")
              : set({ minute: Number(e.target.value) })
          }
        >
          <option value="">--</option>
          {minutes.map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, "0")}
            </option>
          ))}
        </select>

        <select
          id={`${id}-meridiem`}
          aria-label={label ? `${label} AM or PM` : "AM or PM"}
          className={selectClass}
          value={parsed ? (parsed.pm ? "PM" : "AM") : ""}
          onChange={(e) =>
            e.target.value === ""
              ? onChange("")
              : set({ pm: e.target.value === "PM" })
          }
        >
          <option value="">--</option>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>

        {clearable && value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="ml-1 px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
            aria-label={label ? `Clear ${label}` : "Clear time"}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
