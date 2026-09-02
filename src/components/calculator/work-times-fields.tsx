"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  TimeSelect,
  addMinutes,
  toDisplay,
  toFieldValue,
} from "@/components/calculator/time-select";
import {
  ND_MEAL_MINUTES,
  ND_MEAL_WINDOW_HOURS,
  checkNdMeal,
  type NdMealCheck,
} from "@/lib/nd-meal";

/**
 * The shared limbs of a work-times form. Log Work and the Exhibit G
 * transcription ask for the same moments of the same day, so they render
 * through the same rows — one layout to learn, one place to fix it. The
 * cascading offers (a meal's In dragging its Out along, a dismissal
 * offering the wrap) stay with each form; these components only draw.
 */

/** One moment of the day: label on the left, the platform's picker right. */
export function TimeRow({
  id,
  label,
  hint,
  value,
  onChange,
  anchor = false,
}: {
  id: string;
  label: string;
  /** Small print under the label — e.g. the card column this row reads. */
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  /** Call and wrap bracket the day; the tinted rows mark them out. */
  anchor?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 p-2${anchor ? " rounded bg-muted/50" : ""}`}
    >
      {/* Capped so a long hint wraps under its label instead of
          squeezing the time field off the row on a phone. */}
      <div className="shrink-0 max-w-[45%]">
        <Label htmlFor={id} className="text-base">
          {label}
        </Label>
        {hint && (
          <span className="block text-xs leading-tight text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 max-w-[15rem]">
        <TimeSelect id={id} value={value} onChange={onChange} compact />
      </div>
    </div>
  );
}

/**
 * A meal that may not have happened: a checkbox reveals its times, and
 * unchecking is the caller's cue to clear them. Warnings render under
 * the fields so a misread card argues back while it is still on screen.
 */
export function MealSection({
  id,
  title,
  checked,
  onCheckedChange,
  warnings,
  children,
}: {
  id: string;
  title: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Rule warnings shown under the fields; nulls are quietly dropped. */
  warnings?: Array<string | null>;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-0">
      <div className="flex items-center space-x-2 p-2">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(!!v)}
        />
        <Label htmlFor={id} className="text-base font-normal">
          {title}
        </Label>
      </div>
      {checked && children}
      {checked &&
        warnings
          ?.filter((w): w is string => !!w)
          .map((w) => (
            <p key={w} className="px-2 pb-2 text-xs text-amber-400">
              {w}
            </p>
          ))}
    </div>
  );
}

/** The In/Out pair inside an open meal section. */
export function MealTimes({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 px-2 pb-2">{children}</div>;
}

export function MealTime({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      <TimeSelect id={id} value={value} onChange={onChange} compact />
    </div>
  );
}

/** An ND meal is fifteen minutes by rule, so its Out is shown, not asked. */
export function NdMealOut({ value }: { value: string | null }) {
  return (
    <div>
      <Label className="text-sm text-muted-foreground">Out</Label>
      <p className="flex h-10 items-center text-base tabular-nums">
        {value ? toDisplay(value) : "—"}
        <span className="ml-2 text-xs text-muted-foreground">
          always 15 min
        </span>
      </p>
    </div>
  );
}

/** "18:45" -> "06:45": the same clock position on the other meridiem. */
const flipMeridiem = (time: string): string | null => {
  const value = toFieldValue(time);
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  return `${String((h + 12) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/**
 * The warning line for an ND meal outside its rule, or null when fine.
 * It quotes the time as entered, because the usual culprit is not the
 * meal — it is the platform's time wheel opening on the wrong half of
 * the day, so a morning meal lands as PM. When the same clock position
 * on the other meridiem would sit inside the window, the warning says
 * so instead of leaving the reader to spot one letter.
 */
export function ndMealWarning(
  check: NdMealCheck,
  callTime: string,
  ndMealIn?: string | null
): string | null {
  if (check.ok) return null;
  if (check.problem === "starts_before_call") {
    const entered = ndMealIn ? toDisplay(ndMealIn) : "";
    return `An ND meal can't start before your ${toDisplay(callTime)} call${
      entered ? ` — this one starts at ${entered}` : ""
    }. It has to fall inside the ${ND_MEAL_WINDOW_HOURS} hours after call.`;
  }
  if (check.problem === "ends_before_it_starts") {
    return "An ND meal has to end after it starts.";
  }
  const base = `An ND meal has to fall inside the ${ND_MEAL_WINDOW_HOURS} hours after your ${toDisplay(
    callTime
  )} call — done by ${toDisplay(
    check.windowEnd
  )}. Outside that it is a deductible meal, which pays differently.`;
  const entered = ndMealIn ? toDisplay(ndMealIn) : "";
  const flipped = ndMealIn ? flipMeridiem(ndMealIn) : null;
  const flippedFits =
    flipped &&
    checkNdMeal(callTime, flipped, addMinutes(flipped, ND_MEAL_MINUTES)).ok;
  if (entered && flippedFits) {
    return `${base} This one starts at ${entered} — did you mean ${toDisplay(flipped)}?`;
  }
  return entered ? `${base} This one starts at ${entered}.` : base;
}
