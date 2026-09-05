"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateField } from "@/components/ui/date-field";
import { UPLOAD_KIND_LABELS, type UploadKind } from "@/lib/upload-kind";
import { shortDay } from "@/lib/format-date";

interface DayOption {
  _id: string;
  showName: string;
  workDate: string;
  characterName?: string;
  recordStatus?: string;
}

/**
 * A file that came in as an Exhibit G but isn't one already has a day
 * of its own under it. Every attachment belongs to a work day, so
 * before it is retyped the performer says which, with the file in
 * view: a day already logged (the file moves there and the placeholder
 * day goes, if it was only the file) or its own day, dated here. The
 * dialog does the PATCH and hands back where the file now lives.
 */
export function AttachToDayDialog({
  uploadId,
  kind,
  currentRecordId,
  imageSrc,
  imageIsPdf = false,
  daysUrl = "/api/work-records?limit=200&sort=workDate&order=desc",
  patchUrl = `/api/g-uploads/${uploadId}`,
  recordUrl = currentRecordId ? `/api/work-records/${currentRecordId}` : null,
  onClose,
  onDone,
}: {
  uploadId: string;
  kind: UploadKind;
  /** The day the upload opened, left out of the list. */
  currentRecordId: string | null;
  /** The file itself, so the choice is made looking at it. */
  imageSrc?: string | null;
  imageIsPdf?: boolean;
  /**
   * Where the owner's days are listed and where the file is retyped —
   * the member's own routes by default; an admin working a member's
   * file from the queue passes the admin routes for that member.
   */
  daysUrl?: string;
  patchUrl?: string;
  /**
   * Where the placeholder day is dated when the file keeps its own day;
   * null hides the date (an admin has no per-record route for it).
   */
  recordUrl?: string | null;
  onClose: () => void;
  onDone: (workRecordId: string | null) => void;
}) {
  const [days, setDays] = useState<DayOption[] | null>(null);
  const [choice, setChoice] = useState<"existing" | "own">("existing");
  const [dayId, setDayId] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [busy, setBusy] = useState(false);
  const label = UPLOAD_KIND_LABELS[kind].toLowerCase();

  useEffect(() => {
    let live = true;
    fetch(daysUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { records?: DayOption[] } | DayOption[]) => {
        if (!live) return;
        const all = Array.isArray(data) ? data : (data.records ?? []);
        const list = all
          .filter((d) => d._id !== currentRecordId)
          .sort((a, b) => (a.workDate < b.workDate ? 1 : a.workDate > b.workDate ? -1 : 0));
        setDays(list);
        if (list.length === 0) setChoice("own");
        else setDayId((id) => id || list[0]._id);
      })
      .catch(() => {
        if (!live) return;
        setDays([]);
        setChoice("own");
      });
    return () => {
      live = false;
    };
  }, [currentRecordId, daysUrl]);

  const confirm = async () => {
    const target = choice === "existing" ? dayId : null;
    if (choice === "existing" && !target) return;
    setBusy(true);
    try {
      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...(target ? { workRecordId: target } : {}) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      // Its own day, dated: the placeholder took the upload date; the
      // real one is set here so the tracker shows the day it was for.
      if (!target && workDate && recordUrl) {
        const dated = await fetch(recordUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workDate }),
        });
        if (!dated.ok) toast.error("Retyped, but the day's date did not save");
      }
      toast.success(
        target
          ? `Now a ${label} on that day — nothing to transcribe`
          : `Now a ${label} — nothing to transcribe`
      );
      onDone(target);
    } catch {
      toast.error("Couldn't change what this file is");
    } finally {
      setBusy(false);
    }
  };

  const dayLabel = (d: DayOption) =>
    [shortDay(d.workDate), d.showName || "Untitled", d.characterName].filter(Boolean).join(" · ");

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-3xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg">Which work day is this {label} for?</DialogTitle>
          <DialogDescription>
            Every file belongs to a day. This one opened a day of its own when it
            came in; if it was really part of a day you already logged, it moves
            there and that placeholder day goes away.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* The file, so the choice is made looking at it. */}
          <div className="flex max-h-[40vh] items-center justify-center overflow-hidden rounded-md border border-border bg-black/40 sm:max-h-[60vh]">
            {imageSrc && !imageIsPdf ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageSrc} alt="" className="max-h-[40vh] w-full object-contain sm:max-h-[60vh]" />
            ) : (
              <div className="flex h-40 w-full items-center justify-center text-muted-foreground">
                <FileText className="h-8 w-8" />
              </div>
            )}
          </div>
          <div className="space-y-4 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="attach-choice"
                className="mt-1"
                checked={choice === "existing"}
                disabled={!days || days.length === 0}
                onChange={() => setChoice("existing")}
              />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block font-medium">Part of a day already logged</span>
                <select
                  aria-label="Which day"
                  value={dayId}
                  disabled={choice !== "existing" || !days || days.length === 0}
                  onChange={(e) => setDayId(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {days === null ? (
                    <option value="">Loading days…</option>
                  ) : days.length === 0 ? (
                    <option value="">No other days logged yet</option>
                  ) : (
                    days.map((d) => (
                      <option key={d._id} value={d._id}>
                        {dayLabel(d)}
                      </option>
                    ))
                  )}
                </select>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="attach-choice"
                className="mt-1"
                checked={choice === "own"}
                onChange={() => setChoice("own")}
              />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block font-medium">Its own work day</span>
                {recordUrl ? (
                  <>
                    <span className="block text-xs text-muted-foreground">
                      The day it started, dated here (leave blank to keep the upload date).
                    </span>
                    <DateField
                      aria-label="Work date for its own day"
                      value={workDate}
                      disabled={choice !== "own"}
                      onChange={(e) => setWorkDate(e.target.value)}
                      className="h-10"
                    />
                  </>
                ) : (
                  <span className="block text-xs text-muted-foreground">Keep the day it started.</span>
                )}
              </span>
            </label>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={busy || (choice === "existing" && !dayId)}>
            {busy ? "Saving…" : choice === "existing" ? "Move it there" : "Keep its own day"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
