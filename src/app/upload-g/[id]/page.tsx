"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Loader2,
  Maximize,
  RotateCw,
  Save,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import { SuggestInput } from "@/components/shared/suggest-input";
import { CollapsibleSection } from "@/components/calculator/collapsible-section";
import {
  MealSection,
  MealTime,
  MealTimes,
  NdMealOut,
  TimeRow,
  ndMealWarning,
} from "@/components/calculator/work-times-fields";
import { followedTime } from "@/lib/follow-time";
import { checkNdMeal, ND_MEAL_MINUTES } from "@/lib/nd-meal";
import { mealLengthWarning, secondMealOrderWarning } from "@/lib/meal-length";
import { wrapOrderWarning } from "@/lib/wrap-check";
import { useAuth } from "@/context/auth-context";
import { useFocalZoom } from "@/lib/use-focal-zoom";
import { toast } from "sonner";

interface GUpload {
  _id: string;
  displayTitle: string;
  path: string;
  rotation: number;
  contentType: string;
  transcription: Transcription | null;
  /** When the member declared the transcription finished; null = not yet. */
  transcribedAt: string | null;
}

/** The performer's own line on the Exhibit G. */
interface TranscriptionRow {
  performer: string;
  character: string;
  /** The card's MAKE-UP / HAIR / WRDRBE column — where the day's clock starts. */
  callTime: string;
  dismissOnSet: string;
  dismissMakeupWardrobe: string;
  ndMealIn: string;
  ndMealOut: string;
  firstMealStart: string;
  firstMealFinish: string;
  secondMealStart: string;
  secondMealFinish: string;
  /** The card's STUNT ADJUST column — dollars, and it feeds the OT rate. */
  stuntAdjustment: string;
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

function emptyRow(): TranscriptionRow {
  return {
    performer: "",
    character: "",
    callTime: "",
    dismissOnSet: "",
    dismissMakeupWardrobe: "",
    ndMealIn: "",
    ndMealOut: "",
    firstMealStart: "",
    firstMealFinish: "",
    secondMealStart: "",
    secondMealFinish: "",
    stuntAdjustment: "",
    notes: "",
  };
}

/**
 * The transcription screen is a split view: the Exhibit G on one half —
 * left on a desktop, top on a phone — and the fields on the other, each
 * pane scrolling on its own, an even fifty-fifty. The image opens
 * fitted to its pane so the whole card shows with no dead white space,
 * and zooms from there: buttons, pinch, or ctrl/⌘ + scroll — anchored
 * to the pinch point by useFocalZoom, so the row being read stays under
 * the fingers instead of sliding off toward the corner.
 *
 * The fields run down the pane in the same order and the same rows as
 * Log Work — the transcription is that form, read off a card — so a
 * phone scrolls one column and a desktop sees the whole day at once.
 */
export default function TranscribePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [upload, setUpload] = useState<GUpload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** When this G was declared finished; null while still in progress. */
  const [doneAt, setDoneAt] = useState<string | null>(null);
  const [row, setRow] = useState<TranscriptionRow>(emptyRow());
  const [details, setDetails] = useState<TranscriptionDetails>({
    showName: "",
    workDate: "",
  });
  /**
   * The meals mirror Log Work: the 1st meal is expected on a normal day,
   * the ND breakfast and the 2nd meal are off until the card shows one —
   * or a saved transcription already carries their times.
   */
  const [showNdMeal, setShowNdMeal] = useState(false);
  const [showFirstMeal, setShowFirstMeal] = useState(true);
  const [showSecondMeal, setShowSecondMeal] = useState(false);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  /**
   * The Cast box is not asked: this G is the signed-in performer's (or,
   * for an admin viewing as a member, that member's), so their
   * registered name is the answer and it rides the saved row.
   */
  const { user, viewingAs } = useAuth();
  const performerAccount = viewingAs ?? user;
  const performerName = performerAccount
    ? performerAccount.firstName
      ? `${performerAccount.firstName} ${performerAccount.lastName || ""}`.trim()
      : performerAccount.email
    : "";

  /**
   * The split pins under everything above the page: the app header and —
   * for an admin viewing as a member — the banner above it. Measured off
   * the header's bottom edge, not its height, precisely because of that
   * banner; observing the body catches the banner mounting and
   * unmounting, which moves the header without resizing it.
   */
  const [topOffset, setTopOffset] = useState(56);
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const measure = () =>
      setTopOffset(
        Math.max(0, Math.round(header.getBoundingClientRect().bottom))
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    // The banner mounts and unmounts without resizing the header itself —
    // it just pushes it down — so watch the DOM around it too.
    const mutations = new MutationObserver(measure);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);

  const formPaneRef = useRef<HTMLDivElement>(null);
  /** The sized box the card lives in — what the zoom actually grows. */
  const cardBoxRef = useRef<HTMLDivElement>(null);
  const { paneRef, paneEl, onTouchStart, onTouchEnd, zoomAtCenter } =
    useFocalZoom({
      contentRef: cardBoxRef,
      zoom,
      setZoom,
      minZoom: 0.02,
      maxZoom: 8,
    });
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
        setDoneAt(data.transcribedAt ?? null);
        if (data.transcription?.rows?.[0]) {
          // Older saves may miss keys; the empty row fills them so every
          // field stays a controlled input.
          const saved = { ...emptyRow(), ...data.transcription.rows[0] };
          setRow(saved);
          setShowNdMeal(!!(saved.ndMealIn || saved.ndMealOut));
          setShowSecondMeal(!!(saved.secondMealStart || saved.secondMealFinish));
        }
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

  /**
   * An ND meal outside its window is a transcription's early warning: a
   * card really saying that usually means a misread meridiem, and the
   * engine downstream would refuse it anyway.
   */
  const ndMeal = useMemo(
    () =>
      checkNdMeal(row.callTime, row.ndMealIn || null, row.ndMealOut || null),
    [row.callTime, row.ndMealIn, row.ndMealOut]
  );

  /** The zoom at which the whole card fits its pane, both dimensions. */
  const fitZoom = useCallback(() => {
    const pane = paneEl.current;
    if (!pane || !natural.w) return 1;
    const rotated = rotation % 180 !== 0;
    const contentW = rotated ? natural.h : natural.w;
    const contentH = rotated ? natural.w : natural.h;
    return Math.min(pane.clientWidth / contentW, pane.clientHeight / contentH);
  }, [paneEl, natural, rotation]);

  const fitToPane = useCallback(() => {
    setZoom(Math.max(0.02, fitZoom()));
    requestAnimationFrame(() => {
      paneEl.current?.scrollTo({ left: 0, top: 0 });
    });
  }, [fitZoom, paneEl]);

  // First load: restore the saved view, or open fitted so the whole card
  // is on screen with nothing but card in the pane.
  useEffect(() => {
    if (!natural.w || restored.current) return;
    restored.current = true;
    const view = savedView.current;
    if (view) {
      setZoom(view.zoom);
      requestAnimationFrame(() => {
        paneEl.current?.scrollTo({
          left: view.scrollX,
          top: view.y ?? view.rowY ?? 0,
        });
      });
    } else {
      fitToPane();
    }
  }, [natural, fitToPane, paneEl]);

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

  /**
   * Saving and finishing are different acts. A bare save keeps the G in
   * progress — partial saves are the point of this form. Passing `done`
   * stamps the transcription finished (or reopens it), and finishing
   * walks back to the pile, because "done" means on to the next one.
   */
  const save = useCallback(
    async (done?: boolean) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/g-uploads/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(typeof done === "boolean" ? { done } : {}),
            transcription: {
              details,
              rows: [{ ...row, performer: performerName || row.performer }],
              view: {
                zoom,
                scrollX: paneEl.current?.scrollLeft ?? 0,
                y: paneEl.current?.scrollTop ?? 0,
              },
            },
          }),
        });
        if (!res.ok) throw new Error();
        if (done === true) {
          toast.success("Done — transcribed");
          router.push("/upload-g");
        } else if (done === false) {
          setDoneAt(null);
          toast.success("Reopened — save again when it's right");
        } else {
          toast.success("Saved");
        }
      } catch {
        toast.error("Couldn't save");
      } finally {
        setSaving(false);
      }
    },
    [id, row, details, zoom, performerName, paneEl, router]
  );

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
              ref={paneRef}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              className="h-full w-full overflow-auto overscroll-contain"
              style={{ touchAction: "pan-x pan-y" }}
            >
              <div
                ref={cardBoxRef}
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
                  zoomAtCenter(0.8)
                )}
                {zoomButton("Zoom in", <ZoomIn className="h-4 w-4" />, () =>
                  zoomAtCenter(1.25)
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
        <div
          className="p-3 space-y-3"
          onFocus={(e) => {
            // The platform's time wheel anchors to its field and flips
            // above it when the field sits at the bottom of the pane —
            // straight over the card. Park the tapped field a quarter of
            // the way down the form pane; the spacer at the bottom gives
            // the wheel a home under the field.
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
                {doneAt ? (
                  <p className="text-xs text-emerald-400">
                    Transcribed ✓ — reopen at the bottom if something needs
                    correcting.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Save as much or as little as you like — even just the date.
                  </p>
                )}
              </div>
            </div>
            <Button onClick={() => save()} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </div>

          {/* Save any part of this: the date alone is worth recording.
              One row of four on a desktop so the times below stay above
              the fold. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1 min-w-0">
              <Label htmlFor="g-show-name" className="text-base">
                Show
              </Label>
              <SuggestInput
                kind="show"
                id="g-show-name"
                value={details.showName}
                onChange={(v) => setDetails((d) => ({ ...d, showName: v }))}
                placeholder="Name of the show"
                className="h-12 text-lg"
              />
            </div>
            <div className="space-y-1 min-w-0">
              <Label htmlFor="g-work-date" className="text-base">
                Work date
              </Label>
              <DateField
                id="g-work-date"
                value={details.workDate}
                onChange={(e) =>
                  setDetails((d) => ({ ...d, workDate: e.target.value }))
                }
                className="h-12 text-lg w-full max-w-full"
              />
            </div>
            <div className="space-y-1 min-w-0">
              <span className="block text-base font-medium">Cast</span>
              {/* Not a field: the G being transcribed is this performer's,
                  so their registered name is the answer. */}
              <p className="flex h-12 items-center text-lg truncate">
                {performerName || "—"}
              </p>
            </div>
            <div className="space-y-1 min-w-0">
              <Label htmlFor="g-character" className="text-base">
                Character
              </Label>
              <SuggestInput
                kind="character"
                id="g-character"
                value={row.character}
                onChange={(v) => setRow((prev) => ({ ...prev, character: v }))}
                placeholder="e.g., Stunt Double"
                className="h-12 text-lg"
              />
            </div>
          </div>

          {/* The same rows as Log Work, in the same order — the card is
              read into the day's form, not into a copy of the card. No
              fold: on this page the times ARE the page. */}
          <div className="rounded-lg border border-border p-2">
            <div className="space-y-0">
              <TimeRow
                id="row-callTime"
                label="Call Time"
                hint="Make-up Hair Wrdrbe"
                anchor
                value={row.callTime}
                onChange={(v) => setRow((prev) => ({ ...prev, callTime: v }))}
              />
              {/* Meals */}
              <div className="border-t border-b py-2 my-1 space-y-2">
                <MealSection
                  id="g-show-nd-meal"
                  title="ND (Non-Deductible) Meal"
                  checked={showNdMeal}
                  onCheckedChange={(v) => {
                    setShowNdMeal(v);
                    if (!v)
                      setRow((prev) => ({
                        ...prev,
                        ndMealIn: "",
                        ndMealOut: "",
                      }));
                  }}
                  warnings={[ndMealWarning(ndMeal, row.callTime)]}
                >
                  <MealTimes>
                    {/* The Out is derived, as on Log Work: an ND meal is
                        15 minutes by rule, whatever the card's box says. */}
                    <MealTime
                      id="row-ndMealIn"
                      label="In"
                      value={row.ndMealIn}
                      onChange={(v) =>
                        setRow((prev) => ({
                          ...prev,
                          ndMealIn: v,
                          ndMealOut: v
                            ? (followedTime(v, null, ND_MEAL_MINUTES) ?? "")
                            : "",
                        }))
                      }
                    />
                    <NdMealOut value={row.ndMealOut || null} />
                  </MealTimes>
                </MealSection>
                <MealSection
                  id="g-show-first-meal"
                  title="1st Meal"
                  checked={showFirstMeal}
                  onCheckedChange={(v) => {
                    setShowFirstMeal(v);
                    if (!v) {
                      setShowSecondMeal(false);
                      setRow((prev) => ({
                        ...prev,
                        firstMealStart: "",
                        firstMealFinish: "",
                        secondMealStart: "",
                        secondMealFinish: "",
                      }));
                    }
                  }}
                  warnings={[
                    mealLengthWarning(row.firstMealStart, row.firstMealFinish),
                  ]}
                >
                  <MealTimes>
                    <MealTime
                      id="row-firstMealStart"
                      label="In"
                      value={row.firstMealStart}
                      onChange={(v) =>
                        setRow((prev) => ({ ...prev, firstMealStart: v }))
                      }
                    />
                    <MealTime
                      id="row-firstMealFinish"
                      label="Out"
                      value={row.firstMealFinish}
                      onChange={(v) =>
                        setRow((prev) => ({ ...prev, firstMealFinish: v }))
                      }
                    />
                  </MealTimes>
                </MealSection>
                {/* 2nd Meal — only visible when 1st Meal is checked */}
                {showFirstMeal && (
                  <MealSection
                    id="g-show-second-meal"
                    title="2nd Meal"
                    checked={showSecondMeal}
                    onCheckedChange={(v) => {
                      setShowSecondMeal(v);
                      if (!v)
                        setRow((prev) => ({
                          ...prev,
                          secondMealStart: "",
                          secondMealFinish: "",
                        }));
                    }}
                    warnings={[
                      secondMealOrderWarning(
                        row.firstMealFinish,
                        row.secondMealStart
                      ),
                      mealLengthWarning(
                        row.secondMealStart,
                        row.secondMealFinish
                      ),
                    ]}
                  >
                    <MealTimes>
                      <MealTime
                        id="row-secondMealStart"
                        label="In"
                        value={row.secondMealStart}
                        onChange={(v) =>
                          setRow((prev) => ({ ...prev, secondMealStart: v }))
                        }
                      />
                      <MealTime
                        id="row-secondMealFinish"
                        label="Out"
                        value={row.secondMealFinish}
                        onChange={(v) =>
                          setRow((prev) => ({ ...prev, secondMealFinish: v }))
                        }
                      />
                    </MealTimes>
                  </MealSection>
                )}
              </div>

              <TimeRow
                id="row-dismissOnSet"
                label="Dismiss On Set"
                value={row.dismissOnSet}
                onChange={(v) =>
                  setRow((prev) => ({ ...prev, dismissOnSet: v }))
                }
              />
              <TimeRow
                id="row-dismissMakeupWardrobe"
                label="Wrapped"
                hint="Dismiss MU/Hair Wrdrbe"
                anchor
                value={row.dismissMakeupWardrobe}
                onChange={(v) =>
                  setRow((prev) => ({ ...prev, dismissMakeupWardrobe: v }))
                }
              />
              {wrapOrderWarning(row.dismissOnSet, row.dismissMakeupWardrobe) && (
                <p className="px-2 pb-1 text-xs text-amber-400">
                  {wrapOrderWarning(row.dismissOnSet, row.dismissMakeupWardrobe)}
                </p>
              )}

              {/* On the form like any other card column — real money,
                  and it raises the overtime rate when the day reprices. */}
              <div className="border-t pt-1 mt-1">
                <div className="flex items-center justify-between gap-4 p-2">
                  <Label htmlFor="row-stuntAdjustment" className="text-base shrink-0">
                    Stunt Adjustment
                  </Label>
                  <div className="relative flex-1 min-w-0 max-w-[15rem]">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="row-stuntAdjustment"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="50"
                      value={row.stuntAdjustment}
                      onChange={(e) =>
                        setRow((prev) => ({
                          ...prev,
                          stuntAdjustment: e.target.value,
                        }))
                      }
                      placeholder="0.00"
                      className="h-11 w-full pl-7 text-base"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <CollapsibleSection
            title="Notes"
            summary={row.notes || "Mileage, anything else on the line"}
          >
            <Textarea
              id="row-notes"
              value={row.notes}
              onChange={(e) =>
                setRow((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Mileage, anything else on the line"
              rows={2}
              className="text-lg"
            />
          </CollapsibleSection>

          {/* Saving keeps the G in progress; Done declares it finished.
              The two live at the bottom because that is where a card ends
              — you read down the form and then say which one this was. */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="outline" onClick={() => save()} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
            {doneAt ? (
              <Button
                variant="ghost"
                onClick={() => save(false)}
                disabled={saving}
                className="text-muted-foreground"
              >
                Transcribed ✓ — tap to reopen
              </Button>
            ) : (
              <Button onClick={() => save(true)} disabled={saving}>
                <Check className="h-4 w-4 mr-2" />
                Done — finished transcribing
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Pinch the card to zoom (or ⌘/Ctrl + scroll).
          </p>

          {/* Scroll room so a field can sit high in the pane while its
              picker opens below it. */}
          <div aria-hidden className="h-[35vh]" />
        </div>
      </div>
    </div>
  );
}
