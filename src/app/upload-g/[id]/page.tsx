"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RotateCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  callTime: string;
  ndMealIn: string;
  ndMealOut: string;
  firstMealStart: string;
  firstMealFinish: string;
  secondMealStart: string;
  secondMealFinish: string;
  dismissOnSet: string;
  dismissMakeupWardrobe: string;
  notes: string;
}

interface Transcription {
  rows: TranscriptionRow[];
  /** Remembered so the G opens exactly where it was left. */
  view?: {
    zoom: number;
    scrollX: number;
    headerY: number;
    rowY: number;
  };
}

const FIELDS: Array<{ key: keyof TranscriptionRow; label: string; width: string }> = [
  { key: "performer", label: "Performer", width: "11rem" },
  { key: "character", label: "Character", width: "11rem" },
  { key: "callTime", label: "Call", width: "6.5rem" },
  { key: "ndMealIn", label: "ND In", width: "6.5rem" },
  { key: "ndMealOut", label: "ND Out", width: "6.5rem" },
  { key: "firstMealStart", label: "1st Meal Out", width: "6.5rem" },
  { key: "firstMealFinish", label: "1st Meal In", width: "6.5rem" },
  { key: "secondMealStart", label: "2nd Meal Out", width: "6.5rem" },
  { key: "secondMealFinish", label: "2nd Meal In", width: "6.5rem" },
  { key: "dismissOnSet", label: "Dismiss Set", width: "6.5rem" },
  { key: "dismissMakeupWardrobe", label: "Dismiss M/W", width: "6.5rem" },
  { key: "notes", label: "Notes", width: "14rem" },
];

function emptyRow(): TranscriptionRow {
  return {
    performer: "",
    character: "",
    callTime: "",
    ndMealIn: "",
    ndMealOut: "",
    firstMealStart: "",
    firstMealFinish: "",
    secondMealStart: "",
    secondMealFinish: "",
    dismissOnSet: "",
    dismissMakeupWardrobe: "",
    notes: "",
  };
}

/** Distance between two active touches, for pinch-zoom. */
function touchDistance(touches: React.TouchList): number {
  const [a, b] = [touches[0], touches[1]];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

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
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);

  const headerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);
  // Guards the two-way horizontal sync from feeding back on itself.
  const syncing = useRef(false);
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

  // Fit the width of the form to the pane the first time it loads, so the
  // whole G is visible before the user starts zooming in.
  useEffect(() => {
    if (!natural.w || restored.current) return;
    restored.current = true;

    const view = savedView.current;
    const paneWidth = headerRef.current?.clientWidth ?? 0;
    const rotated = rotation % 180 !== 0;
    const contentWidth = rotated ? natural.h : natural.w;

    if (view) {
      setZoom(view.zoom);
      requestAnimationFrame(() => {
        if (headerRef.current) {
          headerRef.current.scrollLeft = view.scrollX;
          headerRef.current.scrollTop = view.headerY;
        }
        if (rowRef.current) {
          rowRef.current.scrollLeft = view.scrollX;
          rowRef.current.scrollTop = view.rowY;
        }
      });
    } else if (paneWidth && contentWidth) {
      setZoom(paneWidth / contentWidth);
    }
  }, [natural, rotation]);

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

  /** Horizontal position is shared; vertical position is each pane's own. */
  const syncHorizontal = (from: "header" | "row") => {
    if (syncing.current) return;
    syncing.current = true;

    const source = from === "header" ? headerRef.current : rowRef.current;
    const target = from === "header" ? rowRef.current : headerRef.current;
    if (source && target) target.scrollLeft = source.scrollLeft;

    // Nudge the field strip to roughly the same part of the form.
    if (source && fieldsRef.current) {
      const imageRange = source.scrollWidth - source.clientWidth;
      const fieldRange =
        fieldsRef.current.scrollWidth - fieldsRef.current.clientWidth;
      if (imageRange > 0 && fieldRange > 0) {
        fieldsRef.current.scrollLeft =
          (source.scrollLeft / imageRange) * fieldRange;
      }
    }

    requestAnimationFrame(() => {
      syncing.current = false;
    });
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
      setZoom(Math.min(8, Math.max(0.1, pinch.current.zoom * ratio)));
    }
  };

  const onTouchEnd = () => {
    pinch.current = null;
  };

  // Desktop: ctrl/⌘ + wheel zooms, like a photo viewer.
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((z) => Math.min(8, Math.max(0.1, z * (e.deltaY < 0 ? 1.08 : 0.93))));
  };

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/g-uploads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcription: {
            rows: [row],
            view: {
              zoom,
              scrollX: rowRef.current?.scrollLeft ?? 0,
              headerY: headerRef.current?.scrollTop ?? 0,
              rowY: rowRef.current?.scrollTop ?? 0,
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
  }, [id, row, zoom]);

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

  const pane = (
    which: "header" | "row",
    ref: React.RefObject<HTMLDivElement | null>,
    height: string
  ) => (
    <div
      ref={ref}
      onScroll={() => syncHorizontal(which)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      className={`overflow-auto overscroll-contain bg-white ${height}`}
      style={{ touchAction: "pan-x pan-y" }}
    >
      <div
        style={{
          width: displayW || "100%",
          height: displayH || 200,
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={upload.path}
          alt={which === "header" ? "Exhibit G header" : "Your row"}
          draggable={false}
          className="absolute top-0 left-0 max-w-none select-none"
          style={{
            width: baseW || undefined,
            transformOrigin: "top left",
            transform: rotationTransform,
          }}
          onLoad={(e) => {
            // Read the size now: React clears currentTarget once the handler
            // returns, and the state updater below runs after that.
            const { naturalWidth, naturalHeight } = e.currentTarget;
            setNatural((prev) =>
              prev.w ? prev : { w: naturalWidth, h: naturalHeight }
            );
          }}
        />
      </div>
    </div>
  );

  return (
    <div className="px-3 py-4 max-w-[1800px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
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
              Top pane: the column headings. Bottom pane: scroll to your row.
              They scroll sideways together.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={rotate}
            aria-label="Rotate"
            title="Rotate"
            className="h-12 w-12 flex items-center justify-center rounded-lg border border-border hover:bg-accent active:scale-95 transition"
          >
            <RotateCw className="h-6 w-6" />
          </button>
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </div>

      {isPdf ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <p className="text-muted-foreground mb-4">
            This upload is a PDF — open it in a new tab to read it while you
            transcribe.
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
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
              Column headings
            </div>
            {pane("header", headerRef, "h-[22vh] min-h-[110px]")}

            <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40 border-t border-border">
              Your row — scroll up/down to find your line
            </div>
            {pane("row", rowRef, "h-[26vh] min-h-[130px]")}
          </div>

          {/* Fields for the row framed above. */}
          <div
            ref={fieldsRef}
            className="mt-3 overflow-x-auto rounded-lg border border-border"
          >
            <div className="min-w-max p-2">
              <div className="flex gap-2 mb-1">
                {FIELDS.map((f) => (
                  <span
                    key={f.key}
                    style={{ width: f.width }}
                    className="shrink-0 text-xs font-medium text-muted-foreground"
                  >
                    {f.label}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                {FIELDS.map((f) => (
                  <Input
                    key={f.key}
                    value={row[f.key]}
                    onChange={(e) =>
                      setRow((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                    style={{ width: f.width }}
                    className="h-10 text-sm shrink-0"
                    placeholder={f.label}
                    inputMode={
                      f.key === "performer" ||
                      f.key === "character" ||
                      f.key === "notes"
                        ? "text"
                        : "numeric"
                    }
                  />
                ))}
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            Pinch to zoom (or ⌘/Ctrl + scroll). Drag either pane sideways —
            both follow. Zoom {Math.round(zoom * 100)}%.
          </p>
        </>
      )}
    </div>
  );
}
