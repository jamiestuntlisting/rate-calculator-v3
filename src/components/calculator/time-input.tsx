"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { snapToSixMinutes, isValidTime } from "@/lib/time-utils";

interface TimeInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

export function TimeInput({
  label,
  value,
  onChange,
  id,
}: TimeInputProps) {
  const inputId = id || label.toLowerCase().replace(/\s+/g, "-");

  const handleBlur = () => {
    if (value && isValidTime(value)) {
      onChange(snapToSixMinutes(value));
    }
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={inputId} className="text-sm">
        {label}
      </Label>
      <Input
        id={inputId}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        className="w-full"
      />
    </div>
  );
}
