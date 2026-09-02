"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  CLOCK_STAMP_MS,
  localISODate,
} from "@/components/calculator/time-select";

/**
 * A date input whose whole face opens the platform's own calendar. The
 * bare control only opens it from the small glyph at its edge — on a
 * desktop a click anywhere else just plants a cursor, which reads as a
 * field that ignored the tap. Typing into the segments still works once
 * the field has focus.
 *
 * The picker is summoned on pointerdown, not click: focusing a field can
 * scroll it (the transcription pane parks fields away from the OS
 * pickers), and a field that moves mid-tap swallows the click that would
 * have opened the calendar.
 */

/**
 * True when a change on an empty date field is the platform stamping
 * today into it rather than a person picking: iOS writes the current
 * date into an empty date input the moment it takes focus, even a
 * programmatic focus no finger caused — which once made the guided
 * rail's date question answer itself with today and jump. A change
 * that is exactly today, lands on an empty field, arrives within
 * moments of focus, and follows no pointer at all is the platform
 * talking. Anything a finger started is left alone — the picker is
 * open and visible, and dismissing it is the person's own act.
 */
export function isTodayStamp(
  prevValue: unknown,
  next: string,
  msSinceFocus: number,
  sawPointer: boolean,
  now: Date = new Date()
): boolean {
  if (prevValue || sawPointer) return false;
  if (msSinceFocus > CLOCK_STAMP_MS) return false;
  return next === localISODate(now);
}

/**
 * True when today arrives on a field that was cleared a moment ago —
 * the picker's Reset emptied it and iOS, still focused on an empty
 * date field, stamped today straight back. Reset should leave the
 * field empty; the stamp is refused so it does.
 */
export function isStampAfterClear(
  next: string,
  msSinceClear: number,
  now: Date = new Date()
): boolean {
  if (msSinceClear > CLOCK_STAMP_MS) return false;
  return next === localISODate(now);
}

export function DateField(
  props: Omit<React.ComponentProps<typeof Input>, "type">
) {
  const focusedAt = useRef(0);
  // A tap's pointerdown lands BEFORE the focus it causes, so "was this
  // a person" is a recency question, not a per-focus flag.
  const lastPointer = useRef(0);
  // When the field was last emptied (the picker's Reset, or the ✕).
  const clearedAt = useRef(0);
  const filled = !!props.value;
  const { className, onChange, onFocus, onPointerDown, ...rest } = props;
  const clear = () => {
    clearedAt.current = Date.now();
    onChange?.({ target: { value: "" } } as React.ChangeEvent<HTMLInputElement>);
  };
  return (
    <div className="relative w-full min-w-0">
      <Input
        {...rest}
        type="date"
        className={`${className ?? ""}${filled ? " pr-9" : ""}`}
        onFocus={(e) => {
          focusedAt.current = Date.now();
          onFocus?.(e);
        }}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "") {
            // The picker's Reset: the field goes empty and stays empty.
            clearedAt.current = Date.now();
            onChange?.(e);
            return;
          }
          if (isStampAfterClear(next, Date.now() - clearedAt.current)) return;
          if (
            isTodayStamp(
              props.value,
              next,
              Date.now() - focusedAt.current,
              Date.now() - lastPointer.current < CLOCK_STAMP_MS
            )
          ) {
            return;
          }
          onChange?.(e);
        }}
        onPointerDown={(e) => {
          lastPointer.current = Date.now();
          onPointerDown?.(e);
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // Not allowed here (already open, or no gesture) — focus still
            // lands, and the glyph still works.
          }
        }}
      />
      {/* A set date can be unset here too: the platform's own Reset is
          honoured above, but on iOS it tends to stamp today straight
          back, and this ✕ is the affordance that reads as "clear". Out
          of the Tab order like TimeSelect's. */}
      {filled && !rest.disabled && (
        <button
          type="button"
          aria-label="Clear date"
          tabIndex={-1}
          onPointerDown={(e) => {
            e.preventDefault();
            clear();
          }}
          onClick={clear}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
