"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * A text field that is also a menu.
 *
 * iOS never draws <datalist> suggestions on the page — they hide in the
 * keyboard's QuickType strip, which nobody reads as "here are your shows".
 * This opens a real dropdown under the field: focus it and every known
 * show is there, type and the list narrows, tap one and it fills in, or
 * keep typing a brand-new name. The options are rendered by us, so they
 * look the same on every platform.
 */
export function ShowCombobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  className = "",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const needle = value.trim().toLowerCase();
  const shown = needle
    ? options.filter((o) => o.toLowerCase().includes(needle))
    : options;

  return (
    <div className="relative w-full min-w-0">
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Give a tap on an option time to land before the list goes.
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Enter") setOpen(false);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={`pr-8 ${className}`}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      {open && shown.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
        >
          {shown.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={option === value}
                // Mousedown beats the input's blur, so the tap always lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  onChange(option);
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
