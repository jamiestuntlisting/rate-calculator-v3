"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Minutes between steps in the time picker. */
export type TimeGranularity = 6 | 15;

interface TimeInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  /** 6 (a tenth of an hour) by default; 15 for productions that use quarters. */
  granularity?: TimeGranularity;
}

export function TimeInput({
  label,
  value,
  onChange,
  id,
  granularity = 6,
}: TimeInputProps) {
  const inputId = id || label.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-1">
      <Label htmlFor={inputId} className="text-base">
        {label}
      </Label>
      <Input
        id={inputId}
        type="time"
        // `step` is in seconds; it makes the picker wheel move in whole
        // increments instead of one minute at a time. Typed values are left
        // exactly as entered — the engine rounds worked time up to the next
        // tenth of an hour, which is the performer's favour.
        step={granularity * 60}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-lg h-12"
      />
    </div>
  );
}
