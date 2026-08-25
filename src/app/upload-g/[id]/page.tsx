"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Minus, Plus, RotateCw, Save } from "lucide-react";
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

/** One transcribed line of the Exhibit G. */
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

/**
 * How the image lines up with the transcription grid. The user tunes these
 * once per Exhibit G and every row strip stays locked to its fields.
 */
interface Layout {
  zoom: number;
  /** Pixels of the (zoomed) image per transcription row. */
  rowHeight: number;
  /** Distance from the top of the image to the first data row. */
  offsetY: number;
  /** Horizontal pan, for wide forms. */
  panX: number;
  /** Height of the frozen header band. */
  headerHeight: number;
  /** Distance from the top of the image to the header band. */
  headerOffset: number;
}

interface Transcription {
  layout: Layout;
  rows: TranscriptionRow[];
}

const FIELDS: Array<{ key: keyof TranscriptionRow; label: string; width: string }> = [
  { key: "performer", label: "Performer", width: "10rem" },
  { key: "character", label: "Character", width: "10rem" },
  { key: "callTime", label: "Call", width: "6rem" },
  { key: "ndMealIn", label: "ND In", width: "6rem" },
  { key: "ndMealOut", label: "ND Out", width: "6rem" },
  { key: "firstMealStart", label: "1st Meal Out", width: "6rem" },
  { key: "firstMealFinish", label: "1st Meal In", width: "6rem" },
  { key: "secondMealStart", label: "2nd Meal Out", width: "6rem" },
  { key: "secondMealFinish", label: "2nd Meal In", width: "6rem" },
  { key: "dismissOnSet", label: "Dismiss Set", width: "6rem" },
  { key: "dismissMakeupWardrobe", label: "Dismiss M/W", width: "6rem" },
  { key: "notes", label: "Notes", width: "12rem" },
];

const DEFAULT_LAYOUT: Layout = {
  zoom: 1.6,
  rowHeight: 44,
  offsetY: 260,
  panX: 0,
  headerHeight: 80,
  headerOffset: 150,
};

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

/**
 * Position an image so that the band starting at `y` (in zoomed pixels) is
 * flush with the top of its clipping box, honouring the saved rotation.
 * Rotating about the top-left corner pushes the image out of the box, so
 * each quarter-turn gets a compensating translation.
 */
function sliceTransform(
  y: number,
  panX: number,
  rotation: number,
  displayW: number,
  displayH: number
): string {
  let cx = 0;
  let cy = 0;
  if (rotation === 90) cx = displayH;
  else if (rotation === 180) {
    cx = displayW;
    cy = displayH;
  } else if (rotation === 270) cy = displayW;

  return `translate(${-panX}px, ${-y}px) translate(${cx}px, ${cy}px) rotate(${rotation}deg)`;
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
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [rows, setRows] = useState<TranscriptionRow[]>([emptyRow()]);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [rotation, setRotation] = useState(0);

  const fieldScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/g-uploads/${id}`);
        if (!res.ok) throw new Error("Not found");
        const data = (await res.json()) as GUpload;
        setUpload(data);
        setRotation(data.rotation);
        if (data.transcription) {
          setLayout({ ...DEFAULT_LAYOUT, ...data.transcription.layout });
          if (data.transcription.rows?.length) setRows(data.transcription.rows);
        }
      } catch {
        toast.error("Couldn't load that Exhibit G");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Displayed size of the image at the current zoom, accounting for rotation.
  const baseW = natural.w * layout.zoom;
  const baseH = natural.h * layout.zoom;
  const displayW = rotation % 180 === 0 ? baseW : baseH;
  const displayH = rotation % 180 === 0 ? baseH : baseW;

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/g-uploads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcription: { layout, rows } }),
      });
      if (!res.ok) throw new Error();
      toast.success("Transcription saved");
    } catch {
      toast.error("Couldn't save the transcription");
    } finally {
      setSaving(false);
    }
  }, [id, layout, rows]);

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
      /* rotation is cosmetic; a failed save just reverts on reload */
    }
  };

  const setField = (
    index: number,
    key: keyof TranscriptionRow,
    value: string
  ) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [key]: value } : r))
    );
  };

  const nudge = (patch: Partial<Layout>) =>
    setLayout((prev) => ({ ...prev, ...patch }));

  // Keep the frozen header's horizontal position tied to the field grid.
  const onFieldsScroll = () => {
    if (headerScrollRef.current && fieldScrollRef.current) {
      headerScrollRef.current.scrollLeft = fieldScrollRef.current.scrollLeft;
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

  return (
    <div className="px-4 py-6 max-w-[1800px] mx-auto">
      {/* Measures the image so slices can be positioned in real pixels. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={upload.path}
        alt=""
        className="hidden"
        onLoad={(e) =>
          setNatural({
            w: e.currentTarget.naturalWidth,
            h: e.currentTarget.naturalHeight,
          })
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/upload-g"
            className="p-2 rounded hover:bg-accent"
            aria-label="Back to uploads"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold leading-tight">
              {upload.displayTitle}
            </h1>
            <p className="text-xs text-muted-foreground">
              Line the rows up once, then type across.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={rotate}>
            <RotateCw className="h-4 w-4 mr-2" />
            Rotate
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
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
          <a href={upload.path} target="_blank" rel="noreferrer" className="underline">
            Open PDF
          </a>
        </div>
      ) : (
        <>
          {/* Alignment controls */}
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border p-3 mb-4 text-sm">
            <Stepper
              label="Zoom"
              value={`${layout.zoom.toFixed(2)}×`}
              onDown={() => nudge({ zoom: Math.max(0.3, layout.zoom - 0.1) })}
              onUp={() => nudge({ zoom: Math.min(6, layout.zoom + 0.1) })}
            />
            <Stepper
              label="Row height"
              value={`${layout.rowHeight}px`}
              onDown={() => nudge({ rowHeight: Math.max(16, layout.rowHeight - 2) })}
              onUp={() => nudge({ rowHeight: layout.rowHeight + 2 })}
            />
            <Stepper
              label="First row"
              value={`${layout.offsetY}px`}
              onDown={() => nudge({ offsetY: layout.offsetY - 4 })}
              onUp={() => nudge({ offsetY: layout.offsetY + 4 })}
            />
            <Stepper
              label="Header band"
              value={`${layout.headerOffset}px`}
              onDown={() => nudge({ headerOffset: layout.headerOffset - 4 })}
              onUp={() => nudge({ headerOffset: layout.headerOffset + 4 })}
            />
            <Stepper
              label="Header height"
              value={`${layout.headerHeight}px`}
              onDown={() =>
                nudge({ headerHeight: Math.max(20, layout.headerHeight - 4) })
              }
              onUp={() => nudge({ headerHeight: layout.headerHeight + 4 })}
            />
            <div className="flex-1 min-w-[12rem]">
              <label className="block text-xs text-muted-foreground mb-1">
                Pan across
              </label>
              <input
                type="range"
                min={0}
                max={Math.max(0, displayW - 400)}
                value={layout.panX}
                onChange={(e) => nudge({ panX: Number(e.target.value) })}
                className="w-full"
              />
            </div>
          </div>

          {/* Frozen header band: the column titles on the form itself. */}
          <div className="sticky top-0 z-20 bg-background border border-border rounded-t-lg overflow-hidden">
            <div
              className="relative overflow-hidden bg-muted/30"
              style={{ height: layout.headerHeight }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={upload.path}
                alt="Exhibit G header"
                className="absolute top-0 left-0 max-w-none origin-top-left"
                style={{
                  width: baseW || undefined,
                  transform: sliceTransform(
                    layout.headerOffset,
                    layout.panX,
                    rotation,
                    displayW,
                    displayH
                  ),
                }}
              />
            </div>

            {/* Matching field labels, scrolled in step with the grid below. */}
            <div
              ref={headerScrollRef}
              className="flex gap-1 px-2 py-1 border-t border-border overflow-x-hidden bg-background"
            >
              <span className="w-8 shrink-0 text-xs text-muted-foreground">#</span>
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
          </div>

          {/* Row strips + fields, locked together line for line. */}
          <div
            ref={fieldScrollRef}
            onScroll={onFieldsScroll}
            className="border border-t-0 border-border rounded-b-lg overflow-x-auto"
          >
            <div className="min-w-max divide-y divide-border">
              {rows.map((row, i) => (
                <div key={i} className="flex items-stretch">
                  <div className="w-8 shrink-0 flex items-center justify-center text-xs text-muted-foreground bg-muted/20">
                    {i + 1}
                  </div>

                  <div className="flex-1">
                    {/* The slice of the form for this line */}
                    <div
                      className="relative overflow-hidden bg-muted/10 border-b border-dashed border-border/60"
                      style={{ height: layout.rowHeight }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={upload.path}
                        alt={`Row ${i + 1}`}
                        className="absolute top-0 left-0 max-w-none origin-top-left"
                        style={{
                          width: baseW || undefined,
                          transform: sliceTransform(
                            layout.offsetY + i * layout.rowHeight,
                            layout.panX,
                            rotation,
                            displayW,
                            displayH
                          ),
                        }}
                      />
                    </div>

                    {/* Its fields */}
                    <div className="flex gap-1 px-2 py-1">
                      {FIELDS.map((f) => (
                        <Input
                          key={f.key}
                          value={row[f.key]}
                          onChange={(e) => setField(i, f.key, e.target.value)}
                          style={{ width: f.width }}
                          className="h-8 text-sm shrink-0"
                          placeholder={f.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
            >
              Add row
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRows((prev) => prev.slice(0, -1))}
              disabled={rows.length <= 1}
            >
              Remove last
            </Button>
            <span className="text-xs text-muted-foreground">
              {rows.length} row{rows.length === 1 ? "" : "s"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function Stepper({
  label,
  value,
  onDown,
  onUp,
}: {
  label: string;
  value: string;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onDown}
          className="p-1 rounded border border-border hover:bg-accent"
          aria-label={`Decrease ${label}`}
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-16 text-center tabular-nums text-xs">{value}</span>
        <button
          type="button"
          onClick={onUp}
          className="p-1 rounded border border-border hover:bg-accent"
          aria-label={`Increase ${label}`}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
