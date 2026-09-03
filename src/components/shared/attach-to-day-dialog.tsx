"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * before it is retyped the performer says which: a day already logged
 * (the file moves there and the placeholder day goes, if it was only
 * the file) or its own day (it stays where it is). The dialog does the
 * PATCH and hands back where the file now lives.
 */
export function AttachToDayDialog({
  uploadId,
  kind,
  currentRecordId,
  onClose,
  onDone,
}: {
  uploadId: string;
  kind: UploadKind;
  /** The day the upload opened, left out of the list. */
  currentRecordId: string | null;
  onClose: () => void;
  onDone: (workRecordId: string | null) => void;
}) {
  const [days, setDays] = useState<DayOption[] | null>(null);
  const [choice, setChoice] = useState<"existing" | "own">("existing");
  const [dayId, setDayId] = useState("");
  const [busy, setBusy] = useState(false);
  const label = UPLOAD_KIND_LABELS[kind].toLowerCase();

  useEffect(() => {
    let live = true;
    fetch("/api/work-records?limit=200&sort=workDate&order=desc")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { records?: DayOption[] }) => {
        if (!live) return;
        const list = (data.records ?? []).filter((d) => d._id !== currentRecordId);
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
  }, [currentRecordId]);

  const confirm = async () => {
    const target = choice === "existing" ? dayId : null;
    if (choice === "existing" && !target) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/g-uploads/${uploadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...(target ? { workRecordId: target } : {}) }),
      });
      if (!res.ok) throw new Error(String(res.status));
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
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md p-4">
        <DialogHeader>
          <DialogTitle className="text-base">Which work day is this {label} for?</DialogTitle>
          <DialogDescription>
            Every file belongs to a day. This one opened a day of its own when it
            came in; if it was really part of a day you already logged, it moves
            there and that placeholder day goes away.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
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
              <span className="block">Part of a day already logged</span>
              <select
                aria-label="Which day"
                value={dayId}
                disabled={choice !== "existing" || !days || days.length === 0}
                onChange={(e) => setDayId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
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
            <span>Its own work day — keep the day it started</span>
          </label>
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
