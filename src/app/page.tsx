"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExhibitGForm } from "@/components/calculator/exhibit-g-form";

export default function HomePage() {
  /**
   * First visit, nothing logged yet: point at the backlog page before the
   * empty form does the talking. One fetch, and any failure just means no
   * banner — the form is never held up by it.
   */
  const [firstTime, setFirstTime] = useState(false);
  useEffect(() => {
    fetch("/api/work-records")
      .then((r) => r.json())
      .then((data) => {
        const records = Array.isArray(data) ? data : (data.records ?? []);
        setFirstTime(records.length === 0);
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      {/* Title and the way into commercials and music videos share one line. */}
      <div className="max-w-3xl mx-auto px-4 mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Log Work</h1>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/get-started"
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            Upload many Exhibit G&rsquo;s
          </Link>
          <Link
            href="/other-work"
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            Other Work
          </Link>
        </div>
      </div>

      {firstTime && (
        <div className="max-w-3xl mx-auto px-4 mb-6">
          <Link
            href="/get-started"
            className="block rounded-lg border-2 border-primary/50 bg-primary/5 p-4 hover:bg-primary/10 transition-colors"
          >
            <p className="font-semibold">First time here? Start with the pile.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Bulk-upload your Exhibit Gs and contracts in one go — every
              image becomes a day in your tracker — then have us do the
              transcribing, or do it yourself.
            </p>
          </Link>
        </div>
      )}

      <ExhibitGForm />
    </div>
  );
}
