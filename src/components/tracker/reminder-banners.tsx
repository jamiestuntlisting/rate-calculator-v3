"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { X, AlertTriangle, Clock, CalendarClock } from "lucide-react";
import type { WorkRecord } from "@/types";

const DISMISSED_KEY = "dismissed-reminders";
const DISMISS_EXPIRY_DAYS = 7;

interface DismissedEntry {
  id: string;
  dismissedAt: number; // timestamp
}

function getDismissedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const entries: DismissedEntry[] = JSON.parse(raw);
    const now = Date.now();
    const expiryMs = DISMISS_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    // Filter out expired dismissals
    const valid = entries.filter((e) => now - e.dismissedAt < expiryMs);
    // Clean up storage
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(valid));
    return new Set(valid.map((e) => e.id));
  } catch {
    return new Set();
  }
}

function dismissReminder(id: string) {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const entries: DismissedEntry[] = raw ? JSON.parse(raw) : [];
    // Remove existing entry with same id, then add fresh
    const filtered = entries.filter((e) => e.id !== id);
    filtered.push({ id, dismissedAt: Date.now() });
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(filtered));
  } catch {
    // Silently fail
  }
}

interface ReminderBannersProps {
  records: WorkRecord[];
}

export function ReminderBanners({ records }: ReminderBannersProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDismissed(getDismissedIds());
  }, []);

  const handleDismiss = (id: string) => {
    dismissReminder(id);
    setDismissed((prev) => new Set([...prev, id]));
  };

  // Incomplete Exhibit G reminders — one banner for all (per-type dismissal)
  const incompleteRecords = useMemo(
    () =>
      records.filter(
        (r) =>
          r.recordStatus === "draft" ||
          r.recordStatus === "attachment_only" ||
          r.recordStatus === "needs_times"
      ),
    [records]
  );

  // Pay cycle reminders — one banner per type (overdue / upcoming)
  const now = new Date();
  const paymentReminders = useMemo(() => {
    const upcoming: WorkRecord[] = [];
    const overdue: WorkRecord[] = [];

    for (const r of records) {
      if (r.paymentStatus !== "unpaid" || !r.paymentDueDate) continue;

      const dueDate = new Date(r.paymentDueDate);
      const diffMs = dueDate.getTime() - now.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays < 0) {
        overdue.push(r);
      } else if (diffDays <= 3) {
        upcoming.push(r);
      }
    }

    return { upcoming, overdue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  // Check per-type dismissals
  const showIncomplete = incompleteRecords.length > 0 && !dismissed.has("banner-incomplete");
  const showOverdue = paymentReminders.overdue.length > 0 && !dismissed.has("banner-overdue");
  const showUpcoming = paymentReminders.upcoming.length > 0 && !dismissed.has("banner-upcoming");

  const hasReminders = showIncomplete || showOverdue || showUpcoming;

  if (!hasReminders) return null;

  return (
    <div className="space-y-2">
      {/* Incomplete Exhibit Gs — single banner */}
      {showIncomplete && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-950/40 border border-yellow-700/50 text-yellow-300">
          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              You have {incompleteRecords.length} incomplete Exhibit G
              {incompleteRecords.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs mt-1">
              Complete them to calculate your expected pay.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {incompleteRecords.slice(0, 5).map((r) => (
                <Link
                  key={r._id}
                  href={`/work/${r._id}`}
                  className="text-xs underline hover:no-underline"
                >
                  {r.showName} ({(() => { const ymd = r.workDate.split("T")[0]; const [y, m, d] = ymd.split("-").map(Number); return `${m}/${d}/${y}`; })()})
                </Link>
              ))}
              {incompleteRecords.length > 5 && (
                <span className="text-xs">
                  +{incompleteRecords.length - 5} more
                </span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0"
            onClick={() => handleDismiss("banner-incomplete")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Overdue Payments — single banner */}
      {showOverdue && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-950/40 border border-red-700/50 text-red-300">
          <Clock className="h-5 w-5 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {paymentReminders.overdue.length} payment{paymentReminders.overdue.length !== 1 ? "s" : ""} overdue
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {paymentReminders.overdue.slice(0, 5).map((r) => (
                <Link
                  key={r._id}
                  href={`/work/${r._id}`}
                  className="text-xs underline hover:no-underline"
                >
                  {r.showName} ({(() => { const ymd = r.workDate.split("T")[0]; const [y, m, d] = ymd.split("-").map(Number); return `${m}/${d}/${y}`; })()})
                </Link>
              ))}
              {paymentReminders.overdue.length > 5 && (
                <span className="text-xs">
                  +{paymentReminders.overdue.length - 5} more
                </span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0"
            onClick={() => handleDismiss("banner-overdue")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Upcoming Payments — single banner */}
      {showUpcoming && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-950/40 border border-blue-700/50 text-blue-300">
          <CalendarClock className="h-5 w-5 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {paymentReminders.upcoming.length} payment{paymentReminders.upcoming.length !== 1 ? "s" : ""} due soon
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {paymentReminders.upcoming.slice(0, 5).map((r) => (
                <Link
                  key={r._id}
                  href={`/work/${r._id}`}
                  className="text-xs underline hover:no-underline"
                >
                  {r.showName} ({(() => { const ymd = r.workDate.split("T")[0]; const [y, m, d] = ymd.split("-").map(Number); return `${m}/${d}/${y}`; })()})
                </Link>
              ))}
              {paymentReminders.upcoming.length > 5 && (
                <span className="text-xs">
                  +{paymentReminders.upcoming.length - 5} more
                </span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0"
            onClick={() => handleDismiss("banner-upcoming")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
