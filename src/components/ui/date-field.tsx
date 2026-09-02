"use client";

import { useRef } from "react";
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

export function DateField(
  props: Omit<React.ComponentProps<typeof Input>, "type">
) {
  const focusedAt = useRef(0);
  // A tap's pointerdown lands BEFORE the focus it causes, so "was this
  // a person" is a recency question, not a per-focus flag.
  const lastPointer = useRef(0);
  return (
    <Input
      {...props}
      type="date"
      onFocus={(e) => {
        focusedAt.current = Date.now();
        props.onFocus?.(e);
      }}
      onChange={(e) => {
        if (
          isTodayStamp(
            props.value,
            e.target.value,
            Date.now() - focusedAt.current,
            Date.now() - lastPointer.current < CLOCK_STAMP_MS
          )
        ) {
          return;
        }
        props.onChange?.(e);
      }}
      onPointerDown={(e) => {
        lastPointer.current = Date.now();
        props.onPointerDown?.(e);
        try {
          e.currentTarget.showPicker?.();
        } catch {
          // Not allowed here (already open, or no gesture) — focus still
          // lets the date be typed.
        }
      }}
    />
  );
}
