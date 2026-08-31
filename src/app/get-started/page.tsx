"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { toUploadableImage } from "@/lib/heic-to-jpeg";
import { Camera, Check, Loader2, Upload } from "lucide-react";

/**
 * The first-visit page: get the backlog in.
 *
 * A performer arriving here has a pile — Exhibit Gs, contracts, call
 * sheets, months of it. The one job of this page is to make emptying the
 * pile feel like one action: photograph everything, then decide who does
 * the typing. Every image becomes a numbered day in the tracker the
 * moment it lands, so nothing waits on being transcribed to be safe.
 *
 * "Ask us to transcribe" records the ask on each upload for the admin
 * queue. It deliberately charges nothing: billing is a membership matter
 * (users.transcriptionBilling) and Stripe is not wired, and a request
 * must never quietly become a charge.
 */

interface Summary {
  uploads: number;
  awaiting: number;
  requested: number;
}

export default function GetStartedPage() {
  const [uploading, setUploading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/g-uploads");
      const data = await res.json();
      const uploads = (data.uploads ?? data ?? []) as Array<{
        transcription: unknown | null;
        transcriptionRequested?: number;
      }>;
      const untranscribed = uploads.filter((u) => !u.transcription);
      setSummary({
        uploads: uploads.length,
        awaiting: untranscribed.length,
        requested: untranscribed.filter((u) => u.transcriptionRequested).length,
      });
    } catch {
      // The tallies are a nicety; the uploader works without them.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadFiles = async (files: File[]) => {
    const usable = files.filter(
      (f) =>
        f.type.startsWith("image/") ||
        f.type === "application/pdf" ||
        /\.(hei[cf])$/i.test(f.name)
    );
    if (usable.length === 0) {
      toast.error("Only photos or PDFs can be uploaded");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      // iPhone HEICs become JPEGs on the way in, one at a time — the
      // decoder is heavy and a bulk drop can be a whole season of Gs.
      for (const file of usable) form.append("file", await toUploadableImage(file));
      const res = await fetch("/api/g-uploads", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const added = data.created?.length ?? 0;
      const dupes = data.duplicates?.length ?? 0;
      if (added > 0)
        toast.success(`${added} file${added === 1 ? "" : "s"} in — each is a day in your tracker now`);
      if (dupes > 0)
        toast.warning(`${dupes} already uploaded before, skipped`);
      setRequested(false);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const askUs = async () => {
    setRequesting(true);
    try {
      const res = await fetch("/api/g-uploads/request-transcription", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't send the request");
      setRequested(true);
      toast.success(
        `Transcription requested for ${data.awaitingTranscription} upload${
          data.awaitingTranscription === 1 ? "" : "s"
        }`
      );
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send the request");
    } finally {
      setRequesting(false);
    }
  };

  const allRequested =
    summary !== null && summary.awaiting > 0 && summary.requested === summary.awaiting;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Start with the pile
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          The best time to start tracking your work was a long time ago.
          Upload all your previous Exhibit Gs — contracts and call sheets
          too — and we can help you update your resume, IMDb, taxes and
          residuals. Every image becomes a day in your tracker the moment
          it lands, numbered so nothing gets lost, and the sorting can
          happen later.
        </p>
      </div>

      {/* Step one: get it in. */}
      <div className="rounded-lg border border-border p-5 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            First
          </p>
          <h2 className="text-lg font-semibold">Upload everything</h2>
        </div>
        <div className="flex gap-3">
          <Button
            className="flex-1"
            size="lg"
            disabled={uploading}
            onClick={() => cameraRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Camera className="h-4 w-4 mr-2" />
            )}
            Camera
          </Button>
          <Button
            className="flex-1"
            size="lg"
            variant="outline"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Pick as many as you like — photos or PDFs. Duplicates are detected
          and skipped, so uploading twice costs nothing.
        </p>
        {summary !== null && summary.uploads > 0 && (
          <p className="text-sm">
            <span className="font-semibold">{summary.uploads}</span> uploaded
            so far
            {summary.awaiting > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · {summary.awaiting} not yet transcribed
              </span>
            )}
          </p>
        )}
      </div>

      {/* Step two: who does the typing. */}
      <div className="rounded-lg border border-border p-5 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Then
          </p>
          <h2 className="text-lg font-semibold">Who does the typing?</h2>
          <p className="text-sm text-muted-foreground mt-1">
            If you want us to transcribe all of these, tap the button and
            we&rsquo;ll get started right away.
          </p>
        </div>

        {allRequested || requested ? (
          <div className="flex items-start gap-2 text-sm">
            <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <p>
              Transcription is requested for everything you have uploaded.
              We will fill in the times and shows from your images, and each
              day updates in your tracker as it is done.
            </p>
          </div>
        ) : (
          <Button
            className="w-full"
            size="lg"
            disabled={requesting || (summary !== null && summary.awaiting === 0)}
            onClick={askUs}
          >
            {requesting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Ask us to transcribe them
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Transcription is part of the Plus add-on or billed per Exhibit G —
          nothing is charged today while billing is being finished. Or do it
          yourself: each upload opens on the{" "}
          <Link href="/upload-g" className="underline underline-offset-2">
            Transcribe
          </Link>{" "}
          page with the image beside the fields.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        Working today and just want to log the one day?{" "}
        <Link href="/" className="underline underline-offset-2">
          Log Work
        </Link>{" "}
        is the quick way in.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          uploadFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          uploadFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
