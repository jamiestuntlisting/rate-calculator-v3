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
    // The pile pitch is for someone who has not started the pile: no
    // logged days and no bulk uploads. One upload in and it stops
    // selling them what they already did.
    Promise.all([
      fetch("/api/work-records").then((r) => r.json()),
      fetch("/api/g-uploads").then((r) => r.json()),
    ])
      .then(([recData, gData]) => {
        const records = Array.isArray(recData)
          ? recData
          : (recData.records ?? []);
        const uploads = gData.uploads ?? [];
        setFirstTime(records.length === 0 && uploads.length === 0);
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
            Got many Exhibit Gs?
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
