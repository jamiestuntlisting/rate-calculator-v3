"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Maximize,
  RotateCw,
  Save,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeSelect } from "@/components/calculator/time-select";
import { toast } from "sonner";

interface GUpload {
  _id: string;
  displayTitle: string;
  path: string;
  rotation: number;
  contentType: string;
  transcription: Transcription | null;
}

/** The performer's own line on the Exhibit G. */
interface TranscriptionRow {
  performer: string;
  character: string;
  /** The card's MAKE-UP / HAIR / WRDRBE column — where the day's clock starts. */
  callTime: string;
  /**
   * REPORT ON SET. Recorded because the card has a column for it and a
   * transcriber reading across needs somewhere to put it; the rate is worked
   * out from the makeup call, so nothing downstream reads this yet.
   */
  reportOnSet: string;
  dismissOnSet: string;
  dismissMakeupWardrobe: string;
  ndMealIn: string;
  ndMealOut: string;
  firstMealStart: string;
  firstMealFinish: string;
  secondMealStart: string;
  secondMealFinish: string;
  notes: string;
}

/** What the G is, independent of the times on it. */
interface TranscriptionDetails {
  showName: string;
  workDate: string;
}

interface Transcription {
  details?: TranscriptionDetails;
  rows: TranscriptionRow[];
  /**
   * Remembered so the G opens exactly where it was left. Older saves
   * carry headerY/rowY from the two-pane layout; y falls back to them.
   */
  view?: {
    zoom: number;
    scrollX: number;
    y?: number;
    headerY?: number;
    rowY?: number;
  };
}

/**
 * In the order the columns run across the card, so transcribing is a straight
 * read left to right rather than a hunt for the matching box.
 */
const FIELDS: Array<{
  key: keyof TranscriptionRow;
  label: string;
  width: string;
  /** Time columns get the real AM/PM picker, not a bare number field. */
  time?: boolean;
}> = [
  { key: "performer", label: "Cast", width: "11rem" },
  { key: "character", label: "Character", width: "11rem" },
  { key: "callTime", label: "Make-up Hair Wrdrbe", width: "8rem", time: true },
  { key: "reportOnSet", label: "Report on Set", width: "8rem", time: true },
  { key: "dismissOnSet", label: "Dismiss on Set", width: "8rem", time: true },
  { key: "dismissMakeupWardrobe", label: "Dismiss MU/Hair Wrdrbe", width: "8rem", time: true },
  { key: "ndMealIn", label: "ND In", width: "8rem", time: true },
  { key: "ndMealOut", label: "ND Out", width: "8rem", time: true },
  { key: "firstMealStart", label: "1st Meal Out", width: "8rem", time: true },
  { key: "firstMealFinish", label: "1st Meal In", width: "8rem", time: true },
  { key: "secondMealStart", label: "2nd Meal Out", width: "8rem", time: true },
  { key: "secondMealFinish", label: "2nd Meal In", width: "8rem", time: true },
  { key: "notes", label: "Notes", width: "14rem" },
];

function emptyRow(): TranscriptionRow {
  return {
    performer: "",
    character: "",
    callTime: "",
    reportOnSet: "",
    dismissOnSet: "",
    dismissMakeupWardrobe: "",
    ndMealIn: "",
    ndMealOut: "",
    firstMealStart: "",
    firstMealFinish: "",
    secondMealStart: "",
    secondMealFinish: "",
    notes: "",
  };
}

/** Distance between two active touches, for pinch-zoom. */
function touchDistance(touches: React.TouchList): number {
  const [a, b] = [touches[0], touches[1]];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * The transcription screen is a split view: the Exhibit G on one half —
 * left on a desktop, top on a phone — and the fields on the other, each
 * pane scrolling on its own, an even fifty-fifty. The image opens
 * fitted to its pane so the whole card shows with no dead white space,
 * and zooms from there: buttons, pinch, or ctrl/⌘ + scroll.
 */
export default function TranscribePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [upload, setUpload] = useState<GUpload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<TranscriptionRow>(emptyRow());
  const [details, setDetails] = useState<TranscriptionDetails>({
    showName: "",
    workDate: "",
  });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  /**
   * The split pins itself under the app header, whose height differs by
   * breakpoint (one bar on a phone, two on a desktop) — measured, not
   * guessed.
   */
  const [topOffset, setTopOffset] = useState(56);
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const measure = () =>
      setTopOffset(Math.round(header.getBoundingClientRect().height));
    measure();
    // The second nav bar mounts once auth resolves, so observe rather
    // than measure once.
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);

  const imageRef = useRef<HTMLDivElement>(null);
  const formPaneRef = useRef<HTMLDivElement>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const restored = useRef(false);
  const savedView = useRef<Transcription["view"] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/g-uploads/${id}`);
        if (!res.ok) throw new Error("Not found");
        const data = (await res.json()) as GUpload;
        setUpload(data);
        setRotation(data.rotation);
        if (data.transcription?.rows?.[0]) setRow(data.transcription.rows[0]);
        if (data.transcription?.details) setDetails(data.transcription.details);
        if (data.transcription?.view) {
          savedView.current = data.transcription.view;
          setZoom(data.transcription.view.zoom || 1);
        }
      } catch {
        toast.error("Couldn't load that Exhibit G");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  /** The zoom at which the whole card fits its pane, both dimensions. */
  const fitZoom = useCallback(() => {
    const pane = imageRef.current;
    if (!pane || !natural.w) return 1;
    const rotated = rotation % 180 !== 0;
    const contentW = rotated ? natural.h : natural.w;
    const contentH = rotated ? natural.w : natural.h;
    return Math.min(pane.clientWidth / contentW, pane.clientHeight / contentH);
  }, [natural, rotation]);

  const fitToPane = useCallback(() => {
    setZoom(Math.max(0.02, fitZoom()));
    requestAnimationFrame(() => {
      imageRef.current?.scrollTo({ left: 0, top: 0 });
    });
  }, [fitZoom]);

  // First load: restore the saved view, or open fitted so the whole card
  // is on screen with nothing but card in the pane.
  useEffect(() => {
    if (!natural.w || restored.current) return;
    restored.current = true;
    const view = savedView.current;
    if (view) {
      setZoom(view.zoom);
      requestAnimationFrame(() => {
        imageRef.current?.scrollTo({
          left: view.scrollX,
          top: view.y ?? view.rowY ?? 0,
        });
      });
    } else {
      fitToPane();
    }
  }, [natural, fitToPane]);

  const baseW = natural.w * zoom;
  const baseH = natural.h * zoom;
  const displayW = rotation % 180 === 0 ? baseW : baseH;
  const displayH = rotation % 180 === 0 ? baseH : baseW;

  /** Rotating about the top-left corner needs a compensating shift back in. */
  const rotationTransform = (() => {
    if (rotation === 90) return `translate(${displayW}px, 0) rotate(90deg)`;
    if (rotation === 180)
      return `translate(${displayW}px, ${displayH}px) rotate(180deg)`;
    if (rotation === 270) return `translate(0, ${displayH}px) rotate(270deg)`;
    return "none";
  })();

  /** Reading across the card nudges the field strip to the same part. */
  const syncFields = () => {
    const source = imageRef.current;
    if (!source || !fieldsRef.current) return;
    const imageRange = source.scrollWidth - source.clientWidth;
    const fieldRange =
      fieldsRef.current.scrollWidth - fieldsRef.current.clientWidth;
    if (imageRange > 0 && fieldRange > 0) {
      fieldsRef.current.scrollLeft =
        (source.scrollLeft / imageRange) * fieldRange;
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinch.current = { distance: touchDistance(e.touches), zoom };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinch.current) {
      e.preventDefault();
      const ratio = touchDistance(e.touches) / pinch.current.distance;
      setZoom(Math.min(8, Math.max(0.02, pinch.current.zoom * ratio)));
    }
  };

  const onTouchEnd = () => {
    pinch.current = null;
  };

  // Desktop: ctrl/⌘ + wheel zooms, like a photo viewer.
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((z) => Math.min(8, Math.max(0.02, z * (e.deltaY < 0 ? 1.08 : 0.93))));
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/g-uploads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcription: {
            details,
            rows: [row],
            view: {
              zoom,
              scrollX: imageRef.current?.scrollLeft ?? 0,
              y: imageRef.current?.scrollTop ?? 0,
            },
          },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Saved");
    } catch {
      toast.error("Couldn't save");
    } finally {
      setSaving(false);
    }
  }, [id, row, details, zoom]);

  const rotate = async () => {
    const next = (rotation + 90) % 360;
    setRotation(next);
    try {
      await fetch(`/api/g-uploads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotation: next }),
      });
    } catch {
      /* cosmetic only */
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!upload) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <p className="text-muted-foreground mb-4">Exhibit G not found.</p>
        <Link href="/upload-g" className="underline">
          Back to uploads
        </Link>
      </div>
    );
  }

  const isPdf = upload.contentType === "application/pdf";

  const zoomButton = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void
  ) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1.5 bg-black/50 text-white/90 hover:bg-black/70"
    >
      {icon}
    </button>
  );

  return (
    // Fixed under the app header: the split escapes the page container's
    // padding and owns the viewport edge to edge, a true fifty-fifty.
    <div
      className="fixed inset-x-0 bottom-0 z-10 flex flex-col bg-background lg:flex-row"
      style={{ top: topOffset }}
    >
      {/* The card itself: top half on a phone, left half on a desktop.
          Dark letterboxing, never a white void — the pane is the image. */}
      <div className="relative h-1/2 w-full shrink-0 lg:h-full lg:w-1/2 bg-zinc-950">
        {isPdf ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div>
              <p className="text-muted-foreground mb-4">
                This upload is a PDF — open it in a new tab to read it while
                you transcribe.
              </p>
              <a
                href={upload.path}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Open PDF
              </a>
            </div>
          </div>
        ) : (
          <>
            <div
              ref={imageRef}
              onScroll={syncFields}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onWheel={onWheel}
              className="h-full w-full overflow-auto overscroll-contain"
              style={{ touchAction: "pan-x pan-y" }}
            >
              <div
                className="relative mx-auto"
                style={{
                  width: displayW || "100%",
                  height: displayH || "100%",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={upload.path}
                  alt={upload.displayTitle}
                  draggable={false}
                  className="absolute top-0 left-0 max-w-none select-none"
                  style={{
                    width: baseW || undefined,
                    transformOrigin: "top left",
                    transform: rotationTransform,
                  }}
                  onLoad={(e) => {
                    // Read the size now: React clears currentTarget once the
                    // handler returns, and the updater runs after that.
                    const { naturalWidth, naturalHeight } = e.currentTarget;
                    setNatural((prev) =>
                      prev.w ? prev : { w: naturalWidth, h: naturalHeight }
                    );
                  }}
                />
              </div>
            </div>
            {/* The viewer's controls float on the image, out of the way. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-2">
              <span className="pointer-events-auto rounded bg-black/50 px-2 py-1 text-xs tabular-nums text-white/90">
                {Math.round(zoom * 100)}%
              </span>
              <span className="pointer-events-auto flex items-center gap-1.5">
                {zoomButton("Zoom out", <ZoomOut className="h-4 w-4" />, () =>
                  setZoom((z) => Math.max(0.02, z * 0.8))
                )}
                {zoomButton("Zoom in", <ZoomIn className="h-4 w-4" />, () =>
                  setZoom((z) => Math.min(8, z * 1.25))
                )}
                {zoomButton(
                  "Fit the whole card",
                  <Maximize className="h-4 w-4" />,
                  fitToPane
                )}
                {zoomButton("Rotate", <RotateCw className="h-4 w-4" />, rotate)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* The fields: bottom half on a phone, right half on a desktop,
          scrolling on their own so the card never leaves the screen. */}
      <div
        ref={formPaneRef}
        className="h-1/2 w-full overflow-y-auto border-t border-border lg:h-full lg:w-1/2 lg:border-t-0 lg:border-l"
      >
        <div className="p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href="/upload-g"
                className="p-2 rounded hover:bg-accent shrink-0"
                aria-label="Back to uploads"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="min-w-0">
                <h1 className="text-lg font-bold leading-tight truncate">
                  {upload.displayTitle}
                </h1>
                <p className="text-xs text-muted-foreground">
                  Save as much or as little as you like — even just the date.
                </p>
              </div>
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </div>

          {/* Save any part of this: the date alone is worth recording. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="g-show-name"
                className="block text-sm text-muted-foreground mb-1"
              >
                Show
              </label>
              <Input
                id="g-show-name"
                value={details.showName}
                onChange={(e) =>
                  setDetails((d) => ({ ...d, showName: e.target.value }))
                }
                placeholder="Names this G and its tracker row"
                className="h-11 text-base"
              />
            </div>
            <div>
              <label
                htmlFor="g-work-date"
                className="block text-sm text-muted-foreground mb-1"
              >
                Work date
              </label>
              <Input
                id="g-work-date"
                type="date"
                value={details.workDate}
                onChange={(e) =>
                  setDetails((d) => ({ ...d, workDate: e.target.value }))
                }
                className="h-11 text-base"
              />
            </div>
          </div>

          {/* Fields for the row on the card, in reading order. */}
          <div
            ref={fieldsRef}
            className="overflow-x-auto rounded-lg border border-border"
            onFocus={(e) => {
              // The platform's time wheel anchors to its field and flips
              // above it when the field sits at the bottom of the pane —
              // straight over the card. Park the tapped field a third of
              // the way down the form pane; the spacer below gives the
              // wheel a home under the field.
              const el = e.target as HTMLElement;
              const pane = formPaneRef.current;
              if (el.tagName !== "INPUT" || !pane) return;
              const top =
                pane.scrollTop +
                el.getBoundingClientRect().top -
                pane.getBoundingClientRect().top -
                pane.clientHeight * 0.25;
              pane.scrollTo({ top: Math.max(0, top) });
            }}
          >
            <div className="min-w-max p-2">
              {/* Bottom-aligned: the card's headings stack onto two or three
                  lines, and each should sit right above its own box. */}
              <div className="flex items-end gap-2 mb-1">
                {FIELDS.map((f) => (
                  <span
                    key={f.key}
                    style={{ width: f.width }}
                    className="shrink-0 text-xs font-medium leading-tight text-muted-foreground"
                  >
                    {f.label}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                {FIELDS.map((f) =>
                  f.time ? (
                    /* The card's time boxes get the platform's own AM/PM
                       picker — the same one every other form uses — so a
                       "915" can never land as unparseable text. */
                    <div
                      key={f.key}
                      style={{ width: f.width }}
                      className="shrink-0"
                    >
                      <TimeSelect
                        id={`row-${f.key}`}
                        value={row[f.key]}
                        onChange={(v) =>
                          setRow((prev) => ({ ...prev, [f.key]: v }))
                        }
                        compact
                      />
                    </div>
                  ) : (
                    <Input
                      key={f.key}
                      value={row[f.key]}
                      onChange={(e) =>
                        setRow((prev) => ({ ...prev, [f.key]: e.target.value }))
                      }
                      style={{ width: f.width }}
                      className="h-11 text-sm shrink-0"
                      placeholder={f.label}
                    />
                  )
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Pinch the card to zoom (or ⌘/Ctrl + scroll). Scrolling the card
            sideways nudges the fields along with it.
          </p>

          {/* Scroll room so a field can sit high in the pane while its
              picker opens below it. */}
          <div aria-hidden className="h-[35vh]" />
        </div>
      </div>
    </div>
  );
}
