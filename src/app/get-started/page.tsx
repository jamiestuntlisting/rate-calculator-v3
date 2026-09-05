"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { toUploadableImage } from "@/lib/heic-to-jpeg";
import { isUploadable } from "@/lib/uploadable";
import { Check, FileText, Loader2, Upload } from "lucide-react";
import { useThumbnails } from "@/lib/use-thumbnails";

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

/** One file in the pile, as the gallery under the uploader shows it. */
interface PileItem {
  _id: string;
  displayTitle: string;
  path: string;
  thumbPath?: string | null;
  contentType: string;
  kind?: string;
  transcribedAt?: string | null;
  createdAt: string;
}

/** How many of the pile the gallery shows before pointing at the pile page. */
const GALLERY_MAX = 48;

export default function GetStartedPage() {
  const [uploading, setUploading] = useState(false);
  /** The bar: how many of the batch have landed, the one in flight, the last few done. */
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    name: string;
    landed: string[];
  } | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  /**
   * The pile itself, newest first: what has been uploaded, shown under
   * the uploader so a batch can be watched arriving. Each file that
   * lands is added the moment its request returns; the thumbnails are
   * made here in the browser (useThumbnails), one at a time.
   */
  const [pile, setPile] = useState<PileItem[]>([]);
  useThumbnails(pile, (id, thumbPath) =>
    setPile((prev) => prev.map((u) => (u._id === id ? { ...u, thumbPath } : u)))
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/g-uploads");
      const data = await res.json();
      const uploads = (data.uploads ?? data ?? []) as Array<
        PileItem & {
          transcription: unknown | null;
          transcriptionRequested?: number;
        }
      >;
      setPile(
        [...uploads]
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
          .map(({ _id, displayTitle, path, thumbPath, contentType, kind, transcribedAt, createdAt }) => ({
            _id, displayTitle, path, thumbPath, contentType, kind, transcribedAt, createdAt,
          }))
      );
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
    // Judged on type first and extension second, the same rule the
    // server applies — a JPEG with a blank type (desktop drags and
    // synced files do this) is still a JPEG. Skips are said out loud,
    // never silent.
    const usable = files.filter((f) => isUploadable(f.type, f.name));
    if (usable.length === 0) {
      toast.error("Only photos or PDFs can be uploaded");
      return;
    }
    if (usable.length < files.length) {
      toast.warning(
        `${files.length - usable.length} file${files.length - usable.length === 1 ? "" : "s"} skipped — not a photo or PDF`
      );
    }
    setUploading(true);
    // One file per request, in order: a season of phone JPEGs in one
    // request is tens of megabytes and dies without a useful error. One
    // at a time each lands on its own, the bar says where we are, and a
    // bad file costs only itself.
    const total = usable.length;
    let added = 0;
    let dupes = 0;
    const failed: string[] = [];
    setProgress({ done: 0, total, name: usable[0]?.name ?? "", landed: [] });
    try {
      for (let i = 0; i < total; i++) {
        const original = usable[i];
        setProgress((p) => (p ? { ...p, name: original.name } : p));
        try {
          // iPhone HEICs become JPEGs on the way in, one at a time — the
          // decoder is heavy and a bulk drop can be a whole season of Gs.
          const file = await toUploadableImage(original);
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/g-uploads", { method: "POST", body: form });
          const data = (await res.json().catch(() => ({}))) as {
            created?: PileItem[];
            duplicates?: unknown[];
            error?: string;
          };
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          added += data.created?.length ?? 0;
          dupes += data.duplicates?.length ?? 0;
          // Into the gallery the moment it lands, ahead of the rest.
          if (data.created?.length) {
            const fresh = data.created;
            setPile((prev) => [...fresh, ...prev.filter((u) => !fresh.some((f) => f._id === u._id))]);
          }
          setProgress((p) =>
            p ? { ...p, done: i + 1, landed: [...p.landed, original.name].slice(-6) } : p
          );
        } catch (e) {
          console.error("upload failed:", original.name, e);
          failed.push(original.name);
          setProgress((p) => (p ? { ...p, done: i + 1 } : p));
        }
      }
      if (added > 0)
        toast.success(`${added} file${added === 1 ? "" : "s"} in — each is a day in your tracker now`);
      if (dupes > 0)
        toast.warning(`${dupes} already uploaded before, skipped`);
      if (failed.length > 0)
        toast.error(
          `${failed.length} didn't upload — try ${failed.length === 1 ? "it" : "them"} again: ${failed.join(", ")}`,
          { duration: 8000 }
        );
      setRequested(false);
      refresh();
    } finally {
      setUploading(false);
      setProgress(null);
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
        {/* One button, straight to the photo library / file picker.
            The camera path is gone: nobody photographs a season of Gs
            one frame at a time from inside a web page. */}
        <Button
          className="w-full"
          size="lg"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          {progress ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : "Upload"}
        </Button>
        {/* The bar: which have landed and how many are to go, one file at
            a time, so a season of Gs never looks stuck. */}
        {progress && (
          <div className="space-y-2" aria-live="polite" data-testid="upload-progress">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
              />
            </div>
            <p className="text-sm">
              <span className="font-semibold tabular-nums">{progress.done}</span> of{" "}
              <span className="tabular-nums">{progress.total}</span> uploaded
              {progress.done < progress.total && progress.name ? (
                <span className="text-muted-foreground"> — now {progress.name}</span>
              ) : null}
            </p>
            {progress.landed.length > 0 && (
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {progress.landed.map((n) => (
                  <li key={n} className="truncate">✓ {n}</li>
                ))}
              </ul>
            )}
          </div>
        )}
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

      {/* The pile, newest first: a batch can be watched arriving, and the
          count says how much of it is done. */}
      {(pile.length > 0 || progress) && (
        <div className="rounded-lg border border-border p-5 space-y-3" data-testid="pile-gallery">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-lg font-semibold">Your pile</h2>
            <p className="text-sm text-muted-foreground tabular-nums">
              <span className="font-semibold text-foreground">{pile.length}</span> uploaded ·{" "}
              {pile.filter((u) => u.transcribedAt).length} transcribed ·{" "}
              {pile.filter((u) => !u.transcribedAt && (u.kind ?? "exhibit_g") === "exhibit_g").length} to go
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
            {pile.slice(0, GALLERY_MAX).map((u) => (
              <Link
                key={u._id}
                href={`/upload-g/${u._id}`}
                className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-muted/40"
                title={u.displayTitle}
              >
                {u.contentType === "application/pdf" ? (
                  <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <FileText className="h-6 w-6" />
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.thumbPath ?? u.path}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                )}
                {u.transcribedAt && (
                  <span className="absolute right-1 top-1 rounded-full bg-emerald-600 p-0.5 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </Link>
            ))}
          </div>
          {pile.length > GALLERY_MAX && (
            <p className="text-xs text-muted-foreground">
              Showing the newest {GALLERY_MAX}.{" "}
              <Link href="/upload-g" className="underline underline-offset-2">
                The whole pile
              </Link>
              .
            </p>
          )}
        </div>
      )}

      {/* Step two: transcription help. */}
      <div className="rounded-lg border border-border p-5 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Then
          </p>
          <h2 className="text-lg font-semibold">Want help transcribing the Gs?</h2>
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
    </div>
  );
}
