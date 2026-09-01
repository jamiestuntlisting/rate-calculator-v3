"use client";

import { Input } from "@/components/ui/input";

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
export function DateField(
  props: Omit<React.ComponentProps<typeof Input>, "type">
) {
  return (
    <Input
      {...props}
      type="date"
      onPointerDown={(e) => {
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
