"use client";

import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

/**
 * Six minutes — a tenth of an hour, which is how a call sheet reads and how
 * the engine rounds. Browsers that honour `step` on a time field offer
 * exactly those minutes; iOS ignores it and offers every minute, which is
 * the trade for using the picker people already know.
 */
export const STEP_SECONDS = 360;

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
 * What a time field will accept as its value: "HH:MM", zero-padded. A
 * record written before the field was native, or read off a transcribed
 * card, can carry "9:30" — which a native input silently shows as empty.
 */
export function toFieldValue(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || "");
  if (!match) return "";
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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

interface TimeSelectProps {
  id: string;
  label?: string;
  /** "HH:MM" on a 24-hour clock, or "" when unset. */
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

/**
 * One field for a time, drawn by the platform. On a phone that is the OS
 * picker — the wheel, with its own AM/PM column — which is the control
 * people already know. Nothing is typed as free text, so no time can be
 * read as the wrong half of the day.
 */
export function TimeSelect({
  id,
  label,
  value,
  onChange,
  compact = false,
}: TimeSelectProps) {
  const filled = toFieldValue(value) !== "";
  return (
    <div className="space-y-1 w-full min-w-0">
      {label && (
        <Label htmlFor={id} className="text-base">
          {label}
        </Label>
      )}
      {/* A set time can be unset: the clock affordance gives way to a ✕
          that clears the field back to empty — the platform's own picker
          has a Reset that only snaps to the current value, never blank.
          An offered time cleared this way is re-offered the next time
          its anchor moves. */}
      <div className="relative w-full min-w-0">
      <input
        id={id}
        type="time"
        step={STEP_SECONDS}
        value={toFieldValue(value)}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // A or P flips the meridiem from any segment, not just the last
          // one — the native field only honours them with AM/PM focused,
          // and nobody knows which segment their cursor is in.
          const key = e.key.toLowerCase();
          if (key !== "a" && key !== "p") return;
          const current = toFieldValue(value);
          const m = /^(\d{2}):(\d{2})$/.exec(current);
          if (!m) return;
          const hour = Number(m[1]);
          const next =
            key === "p" ? (hour % 12) + 12 : hour % 12;
          if (next !== hour) {
            onChange(`${String(next).padStart(2, "0")}:${m[2]}`);
          }
        }}
        className={
          "w-full min-w-0 rounded-md border border-input bg-background " +
          "focus:outline-none focus:ring-2 focus:ring-ring " +
          (compact ? "h-11 px-2 text-base" : "h-12 px-3 text-lg") +
          (filled
            ? " pr-9 [&::-webkit-calendar-picker-indicator]:hidden"
            : "")
        }
      />
      {filled && (
        <button
          type="button"
          aria-label="Clear time"
          onClick={() => onChange("")}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      </div>
    </div>
  );
}
