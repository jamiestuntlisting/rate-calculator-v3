"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/time-utils";
import { toUploadableImage } from "@/lib/heic-to-jpeg";
import type { WorkDocument } from "@/types";
import {
  compareStub,
  disputeMessage,
  disputeSubject,
  type PayStubLine,
  type PayStubScope,
  STUB_LINE_LABELS,
  stubTotal,
} from "@/lib/pay-stub";

interface PayStubSectionProps {
  scope: PayStubScope;
  workRecordId?: string;
  weekStart?: string;
  showName: string;
  /** What we make the day or week come to. */
  owed: number;
  performerName: string;
  /** "the work day of 26 August 2026". */
  period: string;
  /** Our own breakdown, so the note can show its working. */
  owedLines: PayStubLine[];
}

const emptyLine = (): PayStubLine => ({ label: "", hours: null, amount: 0 });

/**
 * Transcribing a pay stub, and what to do when it does not match.
 *
 * Stubs run three columns — what the payment was for, the hours, the money —
 * so that is what this asks for. A total alone would say a day is short
 * without saying which line is missing, and the line is what payroll needs
 * to hear.
 */
export function PayStubSection({
  scope,
  workRecordId,
  weekStart,
  showName,
  owed,
  performerName,
  period,
  owedLines,
}: PayStubSectionProps) {
  const [lines, setLines] = useState<PayStubLine[]>([]);
  /** Photographs of the check or stub, stored with the stub itself. */
  const [documents, setDocuments] = useState<WorkDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [openDispute, setOpenDispute] = useState(false);
  const [payrollEmail, setPayrollEmail] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);

  const query =
    scope === "day"
      ? `workRecordId=${encodeURIComponent(workRecordId ?? "")}`
      : `weekStart=${encodeURIComponent(weekStart ?? "")}&showName=${encodeURIComponent(showName)}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pay-stubs?${query}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        stub: { lineItems: PayStubLine[]; documents?: WorkDocument[] } | null;
      };
      setLines(data.stub?.lineItems ?? []);
      setDocuments(data.stub?.documents ?? []);
    } catch {
      setLines([]);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (next: PayStubLine[], nextDocs?: WorkDocument[]) => {
    setSaving(true);
    try {
      const res = await fetch("/api/pay-stubs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          workRecordId,
          weekStart,
          showName,
          lineItems: next.filter((l) => l.label.trim() || l.amount),
          documents: nextDocs ?? documents,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Pay stub saved");
    } catch {
      toast.error("Couldn't save the pay stub");
    } finally {
      setSaving(false);
    }
  };

  /**
   * A photo of the check lands next to the stub's lines and is saved
   * straight away — the picture is the evidence, so it must not sit
   * unsaved behind a button.
   */
  const addPhoto = async (original: File) => {
    setUploadingPhoto(true);
    try {
      const file = await toUploadableImage(original);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) throw new Error();
      const { filename } = (await res.json()) as { filename: string };
      const doc: WorkDocument = {
        filename,
        originalName: file.name,
        documentType: "paystub",
        uploadedAt: new Date().toISOString(),
      };
      const nextDocs = [...documents, doc];
      setDocuments(nextDocs);
      await save(lines, nextDocs);
    } catch {
      toast.error(`Couldn't upload ${original.name}`);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = async (index: number) => {
    const nextDocs = documents.filter((_, i) => i !== index);
    setDocuments(nextDocs);
    await save(lines, nextDocs);
  };

  const update = (index: number, patch: Partial<PayStubLine>) =>
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );

  const hasStub = lines.some((l) => l.label.trim() || l.amount);
  const comparison = compareStub(owed, lines);

  const message = disputeMessage({
    performerName,
    showName,
    period,
    comparison,
    owedLines,
    paidLines: lines.filter((l) => l.label.trim() || l.amount),
  });
  const subject = disputeSubject(showName, period);

  const mailto = `mailto:${encodeURIComponent(payrollEmail)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(message)}`;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading the pay stub…
      </div>
    );
  }

  return (
    // With a photo of the check in hand, the image and the stub's lines
    // sit side by side on a desktop — the check on one side, the working
    // on the other — and stack on a phone.
    <div
      className={
        documents.length ? "grid grid-cols-1 gap-4 lg:grid-cols-2" : undefined
      }
    >
      {documents.length > 0 && (
        <div className="space-y-2 lg:sticky lg:top-4 lg:self-start">
          {documents.map((doc, index) => {
            const isPdf = /\.pdf$/i.test(doc.filename);
            return (
              <div key={`${doc.filename}-${index}`} className="relative">
                {isPdf ? (
                  <a
                    href={`/api/uploads/${doc.filename}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded border border-border p-3 text-sm underline underline-offset-2"
                  >
                    {doc.originalName}
                  </a>
                ) : (
                  <a
                    href={`/api/uploads/${doc.filename}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/uploads/${doc.filename}`}
                      alt={doc.originalName}
                      className="max-h-[28rem] w-full rounded border border-border bg-zinc-950 object-contain"
                    />
                  </a>
                )}
                <button
                  type="button"
                  aria-label="Remove the photo"
                  onClick={() => removePhoto(index)}
                  className="absolute right-1.5 top-1.5 rounded bg-black/60 p-1 text-white/80 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-4">
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="flex-1 min-w-0 space-y-1">
              <Input
                list="stub-line-labels"
                value={line.label}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder="What it was for"
                className="h-10"
              />
            </div>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={line.hours ?? ""}
              onChange={(e) =>
                update(index, {
                  hours: e.target.value === "" ? null : parseFloat(e.target.value) || 0,
                })
              }
              placeholder="hrs"
              className="h-10 w-16 shrink-0 text-center"
            />
            <div className="relative w-24 shrink-0">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                $
              </span>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={line.amount || ""}
                onChange={(e) =>
                  update(index, { amount: parseFloat(e.target.value) || 0 })
                }
                placeholder="0.00"
                className="h-10 pl-5"
              />
            </div>
            <button
              type="button"
              onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
              aria-label="Remove line"
              className="mt-2 shrink-0 text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <datalist id="stub-line-labels">
          {STUB_LINE_LABELS.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLines((prev) => [...prev, emptyLine()])}
        >
          <Plus className="h-4 w-4" />
          Add a line
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => photoInput.current?.click()}
          disabled={uploadingPhoto}
        >
          {uploadingPhoto ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          {documents.length ? "Add another photo" : "Add the check photo"}
        </Button>
        <input
          ref={photoInput}
          type="file"
          accept="image/*,.heic,.heif,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (file) addPhoto(file);
          }}
        />
        <Button size="sm" onClick={() => save(lines)} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save stub
        </Button>
      </div>

      {hasStub && (
        <div className="rounded-lg border border-border/60 p-3 space-y-1 text-sm">
          <Row label="Stub total" value={formatCurrency(stubTotal(lines))} />
          <Row label="We make it" value={formatCurrency(comparison.owed)} />
          <div
            className={`flex justify-between gap-3 font-medium pt-2 border-t border-border ${
              comparison.settled
                ? "text-emerald-400"
                : comparison.short
                  ? "text-rose-400"
                  : "text-amber-400"
            }`}
          >
            <span>
              {comparison.settled
                ? "Matches"
                : comparison.short
                  ? "Short by"
                  : "Over by"}
            </span>
            <span className="tabular-nums">
              {comparison.settled
                ? "—"
                : formatCurrency(Math.abs(comparison.difference))}
            </span>
          </div>
        </div>
      )}

      {/* Folded away: it is only worth opening when a stub is in and short. */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setOpenDispute((v) => !v)}
          aria-expanded={openDispute}
          className="w-full text-left p-3 flex items-center gap-2 hover:bg-accent/30 transition-colors"
        >
          {openDispute ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">Email payroll</span>
        </button>

        {openDispute && (
          <div className="border-t border-border p-3 space-y-3">
            {!hasStub ? (
              <p className="text-sm text-amber-400">
                Add your pay stub above first — the note quotes what you were
                actually paid, line by line, so it needs the stub to say
                anything.
              </p>
            ) : comparison.settled ? (
              <p className="text-sm text-muted-foreground">
                The stub matches what we make it, so there is nothing to
                query.
              </p>
            ) : (
              <>
                <div className="space-y-1">
                  <Label htmlFor="payrollEmail" className="text-sm">
                    Payroll email
                  </Label>
                  <Input
                    id="payrollEmail"
                    type="email"
                    inputMode="email"
                    value={payrollEmail}
                    onChange={(e) => setPayrollEmail(e.target.value)}
                    placeholder="payroll@production.com"
                    className="h-10"
                  />
                </div>

                <pre className="text-xs whitespace-pre-wrap rounded border border-border/60 bg-muted/30 p-3 overflow-x-auto">
                  {message}
                </pre>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(message);
                        toast.success("Copied");
                      } catch {
                        toast.error("Couldn't copy — select it and copy by hand");
                      }
                    }}
                  >
                    Copy
                  </Button>
                  <Button asChild size="sm" disabled={!payrollEmail.trim()}>
                    <a href={mailto}>Open in mail</a>
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  This opens the note in your own mail app, with you as the
                  sender. Sending it from the Bookkeeper with the stub and the
                  Exhibit G attached needs a mail service configured.
                </p>
              </>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums shrink-0">{value}</span>
    </div>
  );
}
