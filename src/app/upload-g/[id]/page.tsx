"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize,
  RotateCw,
  Save,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  mealBoundsWarning,
  ndMealWarning,
} from "@/components/calculator/work-times-fields";
import { TimeSelect } from "@/components/calculator/time-select";
import { followedTime, offerAfterIfEmpty } from "@/lib/follow-time";
import { MEAL_MINUTES, WorkDateContext, toDisplay } from "@/components/calculator/time-select";
import { checkNdMeal, ND_MEAL_MINUTES } from "@/lib/nd-meal";
import { mealLengthWarning, secondMealOrderWarning } from "@/lib/meal-length";
import { wrapOrderWarning } from "@/lib/wrap-check";
import { useAuth } from "@/context/auth-context";
import { useFocalZoom } from "@/lib/use-focal-zoom";
import { calculateRate } from "@/lib/rate-engine";
import { formatCurrency } from "@/lib/time-utils";
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
  /** The day-multiplier facts Log Work asks for — they reprice the day. */
  forcedCall: boolean;
  isSixthDay: boolean;
  isSeventhDay: boolean;
  isHoliday: boolean;
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
    forcedCall: false,
    isSixthDay: false,
    isSeventhDay: false,
    isHoliday: false,
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
   * Which way the time rows run: through the day ("chrono", the
   * default) or as the card's columns do ("card"). A reading habit,
   * not data — it mirrors to localStorage so the first paint is right
   * and to the signed-in user's prefs on the server so their phone and
   * desktop agree.
   */
  const [timeOrder, setTimeOrder] = useState<"chrono" | "card">("chrono");
  /**
   * How the page asks: the whole form ("form", the default) or one
   * question at a time ("guided") — the same fields and the same saved
   * record either way, so flipping mid-card loses nothing. Persisted
   * exactly like the order: localStorage first paint, prefs for good.
   */
  const [mode, setMode] = useState<"form" | "guided">("form");
  /** Where the one-at-a-time rail is; survives flipping to the form. */
  const [guidedStep, setGuidedStep] = useState(0);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("stl_transcribe_order");
      if (saved === "card" || saved === "chrono") setTimeOrder(saved);
      const savedMode = window.localStorage.getItem("stl_transcribe_mode");
      if (savedMode === "form" || savedMode === "guided") setMode(savedMode);
    } catch {
      // storage can be blocked; the defaults stand
    }
    fetch("/api/me/prefs")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(
        (data: {
          prefs?: { transcribeTimeOrder?: string; transcribeMode?: string };
        }) => {
          const v = data.prefs?.transcribeTimeOrder;
          if (v === "card" || v === "chrono") {
            setTimeOrder(v);
            try {
              window.localStorage.setItem("stl_transcribe_order", v);
            } catch {}
          }
          const m = data.prefs?.transcribeMode;
          if (m === "form" || m === "guided") {
            setMode(m);
            try {
              window.localStorage.setItem("stl_transcribe_mode", m);
            } catch {}
          }
        }
      )
      .catch(() => {});
  }, []);
  const chooseTimeOrder = (next: "chrono" | "card") => {
    setTimeOrder(next);
    try {
      window.localStorage.setItem("stl_transcribe_order", next);
    } catch {}
    fetch("/api/me/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcribeTimeOrder: next }),
    }).catch(() => {});
  };
  const chooseMode = (next: "form" | "guided") => {
    cancelAdvance();
    setMode(next);
    try {
      window.localStorage.setItem("stl_transcribe_mode", next);
    } catch {}
    fetch("/api/me/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcribeMode: next }),
    }).catch(() => {});
  };

  /**
   * Auto-advance for the one-at-a-time rail. A time is "entered" when
   * the wheel stops turning — every change resets the timer, so a spin
   * to 8:42 doesn't advance at 3:00 — and a date confirms faster since
   * a picker commits it whole. Back/Next and mode flips cancel it.
   */
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelAdvance = useCallback(() => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }, []);
  useEffect(() => cancelAdvance, [cancelAdvance]);
  const goToStep = useCallback(
    (next: number | ((s: number) => number)) => {
      cancelAdvance();
      setGuidedStep(next);
    },
    [cancelAdvance]
  );
  const queueAdvance = useCallback(
    (ms: number, count: number) => {
      cancelAdvance();
      advanceTimer.current = setTimeout(() => {
        advanceTimer.current = null;
        setGuidedStep((s) => Math.min(s + 1, count - 1));
      }, ms);
    },
    [cancelAdvance]
  );
  // Land focus on each question as it arrives, so a desktop can just
  // type. Mobile pickers still open on tap — programmatic focus cannot
  // (and should not) pop them. The rail renders exactly one input.
  useEffect(() => {
    if (mode !== "guided") return;
    document.querySelector<HTMLElement>('input[id^="guided-"]')?.focus();
  }, [mode, guidedStep]);
  /**
   * A time step advances when its picker is dismissed (blur), never on
   * a timer: an advance under a still-open wheel moves the rail while
   * the wheel keeps writing — and React reusing the input node across
   * steps once let a correction spin land in the NEXT field. The nav
   * arrows act on pointerdown (before the blur they cause) and stamp
   * this ref so the blur that follows doesn't advance a second time;
   * their click handlers honour the same stamp for keyboard use.
   */
  const navTapped = useRef(0);
  const navDo = (action: () => void) => {
    navTapped.current = Date.now();
    action();
  };
  const navClick = (action: () => void) => {
    if (Date.now() - navTapped.current < 500) return;
    navDo(action);
  };

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
        if (data.transcription?.details) {
          // Same courtesy as the row: a save missing keys (an API
          // writer, an older shape) must not leave a field undefined —
          // the inputs are controlled and the combobox trims its value.
          const savedDetails = data.transcription.details;
          setDetails({
            showName: savedDetails.showName ?? "",
            workDate: savedDetails.workDate ?? "",
          });
        }
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

  /**
   * Meal penalties, live, the moment call, meals and dismissal are in.
   * They are statutory dollars on the $25/$35/$50 ladder — the same
   * whatever the agreement — so unlike the rate they are knowable
   * before the agreement is picked. The engine is run with a stand-in
   * schedule purely to read its penalty lines; nothing else is shown.
   */
  const mealPenalties = useMemo(() => {
    if (!row.callTime || !row.dismissOnSet) return null;
    try {
      const breakdown = calculateRate({
        showName: "",
        workDate: (details.workDate || "").slice(0, 10) || "2026-01-01",
        callTime: row.callTime,
        dismissOnSet: row.dismissOnSet,
        dismissMakeupWardrobe: row.dismissMakeupWardrobe || null,
        ndMealIn: row.ndMealIn || null,
        ndMealOut: row.ndMealOut || null,
        firstMealStart: row.firstMealStart || null,
        firstMealFinish: row.firstMealFinish || null,
        secondMealStart: row.secondMealStart || null,
        secondMealFinish: row.secondMealFinish || null,
        stuntAdjustment: 0,
        flatDayRate: null,
        forcedCall: false,
        isSixthDay: false,
        isSeventhDay: false,
        isHoliday: false,
        workStatus: "theatrical_basic",
        characterName: "",
        notes: "",
      });
      const perMeal = new Map<string, { count: number; amount: number }>();
      for (const penalty of breakdown.penalties.mealPenalties) {
        const entry = perMeal.get(penalty.meal) ?? { count: 0, amount: 0 };
        entry.count += 1;
        entry.amount += penalty.amount;
        perMeal.set(penalty.meal, entry);
      }
      const total = [...perMeal.values()].reduce((s, e) => s + e.amount, 0);
      return { perMeal, total };
    } catch {
      // An input the engine refuses (e.g. an ND meal outside its
      // window) has its own warning; no panel until it is fixed.
      return null;
    }
  }, [row, details.workDate]);

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
      // Done needs the day's brackets. Anything less stays a save —
      // a G without a call and a wrap isn't finished, it's parked.
      if (done === true && (!row.callTime || !row.dismissMakeupWardrobe)) {
        const missing = [
          !row.callTime ? "the call time" : null,
          !row.dismissMakeupWardrobe ? "the wrap" : null,
        ]
          .filter((m): m is string => !!m)
          .join(" and ");
        toast.error(
          `Enter ${missing} before marking it done — Save keeps it in progress.`
        );
        return;
      }
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
        if (!res.ok) {
          // The server enforces the same done-gate; say its reason.
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "");
        }
        if (done === true) {
          toast.success("Done — transcribed");
          router.push("/upload-g");
        } else if (done === false) {
          setDoneAt(null);
          toast.success("Reopened — save again when it's right");
        } else {
          toast.success("Saved");
        }
      } catch (e) {
        toast.error(
          e instanceof Error && e.message ? e.message : "Couldn't save"
        );
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

  // A meal sits between call and the day's end. Until an end is read
  // off the card, only the clearly-backwards half of the clock argues.
  const dayEnd = row.dismissMakeupWardrobe || row.dismissOnSet || null;
  const dayEndName = row.dismissMakeupWardrobe ? "wrap" : "on-set dismissal";
  const boundsWarn = (label: string, t: string | null) =>
    mealBoundsWarning(row.callTime, dayEnd, dayEndName, label, t);

  /**
   * The times rows, built once and ordered by the toggle. Day order
   * runs chronologically: call, the meals, the dismissals. Card order
   * runs the G's columns — call, both dismissals, then the meals — so
   * transcribing moves straight across the card without jumping. The
   * wrap warning stays glued under the wrap row either way.
   */
  const callRow = (
    <TimeRow
      key="call"
      id="row-callTime"
      label="Call Time"
      hint="Make-up Hair Wrdrbe"
      anchor
      value={row.callTime}
      onChange={(v) => setRow((prev) => ({ ...prev, callTime: v }))}
    />
  );

  const mealsBand = (
    <div
      key="meals"
      className={`border-t py-2 my-1 space-y-2${
        timeOrder === "card" ? "" : " border-b"
      }`}
    >
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
        warnings={[ndMealWarning(ndMeal, row.callTime, row.ndMealIn)]}
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
          boundsWarn("The 1st Meal In", row.firstMealStart),
          boundsWarn("The 1st Meal Out", row.firstMealFinish),
          mealLengthWarning(row.firstMealStart, row.firstMealFinish),
        ]}
      >
        <MealTimes>
          <MealTime
            id="row-firstMealStart"
            label="In"
            value={row.firstMealStart}
            onChange={(v) =>
              // Setting the In offers the Out half an hour on —
              // what a meal usually is — so the picker opens
              // there instead of at whatever time it is now. It
              // only ever fills an EMPTY Out; a time read off
              // the card never moves.
              setRow((prev) => ({
                ...prev,
                firstMealStart: v,
                firstMealFinish: v
                  ? (offerAfterIfEmpty(v, prev.firstMealFinish, MEAL_MINUTES) ?? "")
                  : prev.firstMealFinish,
              }))
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
            boundsWarn("The 2nd Meal In", row.secondMealStart),
            boundsWarn("The 2nd Meal Out", row.secondMealFinish),
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
                setRow((prev) => ({
                  ...prev,
                  secondMealStart: v,
                  secondMealFinish: v
                    ? (offerAfterIfEmpty(v, prev.secondMealFinish, MEAL_MINUTES) ?? "")
                    : prev.secondMealFinish,
                }))
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
  );

  const dismissRows = (
    <div key="dismiss">
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
    </div>
  );

  /**
   * Why Done is not yet on offer, or null when it is. The day's
   * brackets — call and wrap — are the minimum for a G to count as
   * transcribed; everything else can be partial.
   */
  const doneBlocker =
    !row.callTime || !row.dismissMakeupWardrobe
      ? `Done needs ${[
          !row.callTime ? "the call time" : null,
          !row.dismissMakeupWardrobe ? "the wrap" : null,
        ]
          .filter((m): m is string => !!m)
          .join(" and ")} first — Save keeps it in progress.`
      : null;

  /**
   * The amber meal-penalty readout — statutory dollars knowable from
   * the times alone. Rendered under the form, and again on the rail's
   * last step so a guided pass still ends on what the times mean.
   */
  const mealPenaltyPanel = mealPenalties && mealPenalties.total > 0 && (
    <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3">
      <p className="mb-1 text-sm font-medium text-amber-300">
        Meal penalties from these times
      </p>
      <div className="space-y-0.5">
        {[...mealPenalties.perMeal.entries()].map(([meal, entry]) => (
          <div key={meal} className="flex justify-between text-sm">
            <span className="text-amber-400">
              {meal} — {entry.count} penalt
              {entry.count === 1 ? "y" : "ies"}
            </span>
            <span className="font-semibold tabular-nums text-amber-300">
              {formatCurrency(entry.amount)}
            </span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t border-amber-700/50 pt-1 text-sm font-bold">
          <span className="text-amber-300">Total</span>
          <span className="tabular-nums text-amber-300">
            {formatCurrency(mealPenalties.total)}
          </span>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-amber-400/80">
        Statutory dollars — the same whatever the agreement, so they land
        on top once the day is priced.
      </p>
    </div>
  );

  /**
   * One question at a time — the same fields writing the same state as
   * the form, so flipping between the two mid-card loses nothing. The
   * times follow the Day/Card order preference. A time advances once
   * the wheel rests; a date right after the picker commits it; text
   * advances on Enter or the arrow. Next past an empty question skips
   * a box the card leaves blank, and Back revisits anything.
   */
  type GuidedStep = {
    key: string;
    label: string;
    hint?: string;
    kind:
      | "show"
      | "character"
      | "date"
      | "time"
      | "money"
      | "penalties"
      | "final";
    value?: string;
    set?: (v: string) => void;
    warning?: string | null;
    note?: string;
  };
  const guidedTimeSteps: GuidedStep[] = (() => {
    const call: GuidedStep = {
      key: "callTime",
      label: "Call Time",
      hint: "The card's Make-up Hair Wrdrbe column",
      kind: "time",
      value: row.callTime,
      set: (v) => setRow((p) => ({ ...p, callTime: v })),
    };
    const nd: GuidedStep = {
      key: "ndMealIn",
      label: "ND Meal — In",
      hint: "The NDB column — Next skips it if the card shows none",
      kind: "time",
      value: row.ndMealIn,
      set: (v) => {
        if (v) setShowNdMeal(true);
        setRow((p) => ({
          ...p,
          ndMealIn: v,
          ndMealOut: v ? (followedTime(v, null, ND_MEAL_MINUTES) ?? "") : "",
        }));
      },
      warning: ndMealWarning(ndMeal, row.callTime, row.ndMealIn),
      note:
        row.ndMealIn && row.ndMealOut
          ? `Out ${toDisplay(row.ndMealOut)} — 15 minutes by rule`
          : "The Out is 15 minutes later by rule",
    };
    const m1In: GuidedStep = {
      key: "firstMealStart",
      label: "1st Meal — In",
      kind: "time",
      value: row.firstMealStart,
      set: (v) => {
        if (v) setShowFirstMeal(true);
        setRow((p) => ({
          ...p,
          firstMealStart: v,
          firstMealFinish: v
            ? (offerAfterIfEmpty(v, p.firstMealFinish, MEAL_MINUTES) ?? "")
            : p.firstMealFinish,
        }));
      },
      note: "Half an hour is offered as the Out — change it if the card differs",
      warning: boundsWarn("The 1st Meal In", row.firstMealStart),
    };
    const m1Out: GuidedStep = {
      key: "firstMealFinish",
      label: "1st Meal — Out",
      kind: "time",
      value: row.firstMealFinish,
      set: (v) => setRow((p) => ({ ...p, firstMealFinish: v })),
      warning:
        boundsWarn("The 1st Meal Out", row.firstMealFinish) ??
        mealLengthWarning(row.firstMealStart, row.firstMealFinish),
    };
    const m2In: GuidedStep = {
      key: "secondMealStart",
      label: "2nd Meal — In",
      hint: "Next skips it if the card shows none",
      kind: "time",
      value: row.secondMealStart,
      set: (v) => {
        if (v) {
          setShowFirstMeal(true);
          setShowSecondMeal(true);
        }
        setRow((p) => ({
          ...p,
          secondMealStart: v,
          secondMealFinish: v
            ? (offerAfterIfEmpty(v, p.secondMealFinish, MEAL_MINUTES) ?? "")
            : p.secondMealFinish,
        }));
      },
      warning:
        boundsWarn("The 2nd Meal In", row.secondMealStart) ??
        secondMealOrderWarning(row.firstMealFinish, row.secondMealStart),
    };
    const m2Out: GuidedStep = {
      key: "secondMealFinish",
      label: "2nd Meal — Out",
      kind: "time",
      value: row.secondMealFinish,
      set: (v) => setRow((p) => ({ ...p, secondMealFinish: v })),
      warning:
        boundsWarn("The 2nd Meal Out", row.secondMealFinish) ??
        mealLengthWarning(row.secondMealStart, row.secondMealFinish),
    };
    const dismiss: GuidedStep = {
      key: "dismissOnSet",
      label: "Dismiss On Set",
      kind: "time",
      value: row.dismissOnSet,
      set: (v) => setRow((p) => ({ ...p, dismissOnSet: v })),
    };
    const wrap: GuidedStep = {
      key: "dismissMakeupWardrobe",
      label: "Wrapped",
      hint: "The Dismiss MU/Hair Wrdrbe column — the same minute as on-set is fine",
      kind: "time",
      value: row.dismissMakeupWardrobe,
      set: (v) => setRow((p) => ({ ...p, dismissMakeupWardrobe: v })),
      warning: wrapOrderWarning(row.dismissOnSet, row.dismissMakeupWardrobe),
    };
    const meals = [nd, m1In, m1Out, m2In, m2Out];
    return timeOrder === "card"
      ? [call, dismiss, wrap, ...meals]
      : [call, ...meals, dismiss, wrap];
  })();
  const guidedSteps: GuidedStep[] = [
    {
      key: "showName",
      label: "Show",
      kind: "show",
      value: details.showName,
      set: (v) => setDetails((d) => ({ ...d, showName: v })),
    },
    {
      key: "workDate",
      label: "Work date",
      kind: "date",
      value: details.workDate,
      set: (v) => setDetails((d) => ({ ...d, workDate: v })),
    },
    {
      key: "character",
      label: "Character",
      kind: "character",
      value: row.character,
      set: (v) => setRow((p) => ({ ...p, character: v })),
    },
    ...guidedTimeSteps,
    {
      key: "stuntAdjustment",
      label: "Stunt Adjustment",
      hint: "Column 202 — Next skips it if there was none",
      kind: "money",
      value: row.stuntAdjustment,
      set: (v) => setRow((p) => ({ ...p, stuntAdjustment: v })),
    },
    {
      key: "penalties",
      label: "What kind of day was it?",
      hint: "Tick anything the card or the call sheet says",
      kind: "penalties",
    },
    { key: "final", label: "That's the whole card", kind: "final" },
  ];
  const stepIndex = Math.min(guidedStep, guidedSteps.length - 1);
  const currentStep = guidedSteps[stepIndex];
  const advanceNow = () =>
    goToStep((s) => Math.min(s + 1, guidedSteps.length - 1));
  const back = () => goToStep((s) => Math.max(s - 1, 0));

  const guidedPanel = (
    <div
      className="rounded-lg border border-border p-4 min-h-[21rem] flex flex-col"
      onKeyDown={(e) => {
        // Enter means "next" everywhere on the rail — including out of
        // a suggestion list, where picking and moving on is the point.
        if (e.key !== "Enter" || currentStep.kind === "final") return;
        e.preventDefault();
        advanceNow();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs tabular-nums text-muted-foreground">
          {stepIndex + 1} of {guidedSteps.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onPointerDown={() => navDo(back)}
            onClick={() => navClick(back)}
            disabled={stepIndex === 0}
            aria-label="Back"
            className="rounded-md border border-border p-2 hover:bg-accent disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onPointerDown={() => navDo(advanceNow)}
            onClick={() => navClick(advanceNow)}
            disabled={stepIndex === guidedSteps.length - 1}
            aria-label="Next"
            className="rounded-md border border-border p-2 hover:bg-accent disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="mt-3 flex-1">
        <p className="text-2xl font-bold">{currentStep.label}</p>
        {currentStep.hint && (
          <p className="mt-1 text-sm text-muted-foreground">
            {currentStep.hint}
          </p>
        )}
        <div className="mt-4">
          {currentStep.kind === "show" || currentStep.kind === "character" ? (
            <SuggestInput
              key={currentStep.key}
              kind={currentStep.kind}
              id={`guided-${currentStep.key}`}
              value={currentStep.value ?? ""}
              onChange={(v) => currentStep.set?.(v)}
              placeholder={
                currentStep.kind === "show"
                  ? "Name of the show"
                  : "e.g., Stunt Double"
              }
              className="h-14 text-xl"
            />
          ) : currentStep.kind === "date" ? (
            <DateField
              key={currentStep.key}
              id={`guided-${currentStep.key}`}
              value={currentStep.value ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                currentStep.set?.(v);
                if (v) queueAdvance(350, guidedSteps.length);
              }}
              className="h-14 text-xl w-full max-w-full"
            />
          ) : currentStep.kind === "time" ? (
            // key: a NEW input per step, so the picker a finger still
            // holds open on the previous step dies with its node
            // instead of writing into this one. Advance on dismissal
            // (blur with a value), never on a timer under the wheel.
            <div
              key={currentStep.key}
              onBlurCapture={(e) => {
                if (Date.now() - navTapped.current < 600) return;
                if ((e.target as HTMLInputElement).value) {
                  navTapped.current = Date.now();
                  advanceNow();
                }
              }}
            >
              <TimeSelect
                id={`guided-${currentStep.key}`}
                value={currentStep.value ?? ""}
                onChange={(v) => currentStep.set?.(v)}
              />
            </div>
          ) : currentStep.kind === "money" ? (
            <div key={currentStep.key} className="relative max-w-[15rem]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">
                $
              </span>
              <Input
                id={`guided-${currentStep.key}`}
                type="number"
                inputMode="decimal"
                min="0"
                step="50"
                value={currentStep.value ?? ""}
                onChange={(e) => currentStep.set?.(e.target.value)}
                placeholder="0.00"
                className="h-14 w-full pl-8 text-xl"
              />
            </div>
          ) : currentStep.kind === "penalties" ? (
            <div className="grid grid-cols-2 gap-4">
              {(
                [
                  ["forcedCall", "Forced Call"],
                  ["isSixthDay", "6th Consecutive Day"],
                  ["isSeventhDay", "7th Consecutive Day"],
                  ["isHoliday", "Holiday"],
                ] as const
              ).map(([field, label]) => (
                <div key={field} className="flex items-center space-x-2">
                  <Checkbox
                    id={`guided-${field}`}
                    checked={row[field]}
                    onCheckedChange={(v) =>
                      setRow((prev) => ({
                        ...prev,
                        [field]: !!v,
                        // 6th/7th/Holiday exclude each other, as on the form.
                        ...(v && field === "isSixthDay"
                          ? { isSeventhDay: false, isHoliday: false }
                          : {}),
                        ...(v && field === "isSeventhDay"
                          ? { isSixthDay: false, isHoliday: false }
                          : {}),
                        ...(v && field === "isHoliday"
                          ? { isSixthDay: false, isSeventhDay: false }
                          : {}),
                      }))
                    }
                  />
                  <Label
                    htmlFor={`guided-${field}`}
                    className="text-base font-normal"
                  >
                    {label}
                  </Label>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {mealPenaltyPanel}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => save()}
                  disabled={saving}
                >
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
              {!doneAt && doneBlocker && (
                <p className="text-xs text-amber-400">{doneBlocker}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Flip to “All fields” any time — everything you entered is
                already there.
              </p>
            </div>
          )}
          {currentStep.warning && (
            <p className="mt-2 text-xs text-amber-400">{currentStep.warning}</p>
          )}
          {currentStep.note && !currentStep.warning && (
            <p className="mt-2 text-xs text-muted-foreground">
              {currentStep.note}
            </p>
          )}
        </div>
      </div>
      {currentStep.kind !== "final" && (
        <p className="text-xs text-muted-foreground">
          Next skips a box the card leaves blank.
        </p>
      )}
    </div>
  );

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
    // Every time field belongs to the card's work day; on any day but
    // today, TimeSelect uses this to refuse the clock the platform
    // stamps into an empty field on tap.
    <WorkDateContext.Provider value={details.workDate || null}>
    {/* Fixed under the app header: the split escapes the page container's
        padding and owns the viewport edge to edge, a true fifty-fifty. */}
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
            // The rail sits still by design — never park its fields.
            if (mode !== "form" || el.tagName !== "INPUT" || !pane) return;
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
            <div className="flex items-center gap-2 shrink-0">
              {/* One card, two ways to read it in — the same fields
                  either way, so flipping loses nothing. */}
              <div className="flex rounded-md border border-border overflow-hidden">
                {(
                  [
                    ["form", "All fields"],
                    ["guided", "One at a time"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => chooseMode(value)}
                    aria-pressed={mode === value}
                    className={`px-2 py-1.5 text-xs ${
                      mode === value
                        ? "bg-accent font-medium"
                        : "text-muted-foreground hover:bg-accent/50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
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
          </div>

          {mode === "guided" ? (
            guidedPanel
          ) : (
            <>
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

          {/* The same rows as Log Work — the card read into the day's
              form, not into a copy of the card. No fold: on this page
              the times ARE the page. The toggle flips between the
              day's chronological order and the card's column order; a
              reading habit, so it saves as a user preference. */}
          <div className="rounded-lg border border-border p-2">
            <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-1">
              <span className="text-sm font-semibold">Times</span>
              <div className="flex rounded-md border border-border overflow-hidden shrink-0">
                {(
                  [
                    ["chrono", "Day order"],
                    ["card", "Card order"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => chooseTimeOrder(value)}
                    aria-pressed={timeOrder === value}
                    className={`px-2 py-1 text-xs ${
                      timeOrder === value
                        ? "bg-accent font-medium"
                        : "text-muted-foreground hover:bg-accent/50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-0">
              {timeOrder === "card"
                ? [callRow, dismissRows, mealsBand]
                : [callRow, mealsBand, dismissRows]}

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

              {/* The same day-multiplier facts Log Work asks for — a 6th
                  day is 1.5x on every hour, so they belong on the card's
                  form, not in a note. 6th/7th/Holiday exclude each other,
                  exactly as on Log Work. */}
              <div className="border-t pt-2 mt-1">
                <p className="px-2 pb-2 text-sm font-semibold">Penalties</p>
                <div className="grid grid-cols-2 gap-4 px-2 pb-2 md:grid-cols-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="row-forcedCall"
                      checked={row.forcedCall}
                      onCheckedChange={(v) =>
                        setRow((prev) => ({ ...prev, forcedCall: !!v }))
                      }
                    />
                    <Label htmlFor="row-forcedCall" className="text-base font-normal">
                      Forced Call
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="row-isSixthDay"
                      checked={row.isSixthDay}
                      onCheckedChange={(v) =>
                        setRow((prev) => ({
                          ...prev,
                          isSixthDay: !!v,
                          ...(v ? { isSeventhDay: false, isHoliday: false } : {}),
                        }))
                      }
                    />
                    <Label htmlFor="row-isSixthDay" className="text-base font-normal">
                      6th Consecutive Day
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="row-isSeventhDay"
                      checked={row.isSeventhDay}
                      onCheckedChange={(v) =>
                        setRow((prev) => ({
                          ...prev,
                          isSeventhDay: !!v,
                          ...(v ? { isSixthDay: false, isHoliday: false } : {}),
                        }))
                      }
                    />
                    <Label htmlFor="row-isSeventhDay" className="text-base font-normal">
                      7th Consecutive Day
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="row-isHoliday"
                      checked={row.isHoliday}
                      onCheckedChange={(v) =>
                        setRow((prev) => ({
                          ...prev,
                          isHoliday: !!v,
                          ...(v ? { isSixthDay: false, isSeventhDay: false } : {}),
                        }))
                      }
                    />
                    <Label htmlFor="row-isHoliday" className="text-base font-normal">
                      Holiday
                    </Label>
                  </div>
                </div>
              </div>

              {/* Penalties are statutory dollars, so they are knowable
                  from the times alone — long before the agreement is. */}
              {mealPenaltyPanel && (
                <div className="mx-2 my-2">{mealPenaltyPanel}</div>
              )}
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
          {!doneAt && doneBlocker && (
            <p className="text-xs text-amber-400">{doneBlocker}</p>
          )}
            </>
          )}

          <p className="text-xs text-muted-foreground">
            Pinch the card to zoom (or ⌘/Ctrl + scroll).
          </p>

          {/* Scroll room so a field can sit high in the pane while its
              picker opens below it. The rail sits still and needs none. */}
          {mode === "form" && <div aria-hidden className="h-[35vh]" />}
        </div>
      </div>
    </div>
    </WorkDateContext.Provider>
  );
}
