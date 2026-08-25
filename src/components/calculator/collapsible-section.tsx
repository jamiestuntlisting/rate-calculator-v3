"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  /** Short line shown when collapsed, e.g. the show title and date. */
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * A titled section the user can fold away, so the calculator can stay
 * focused on work times without losing access to the details.
 */
export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/40 rounded-lg"
      >
        <span className="min-w-0">
          <span className="block font-semibold text-lg">{title}</span>
          {!open && summary && (
            <span className="block text-sm text-muted-foreground truncate">
              {summary}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  );
}
