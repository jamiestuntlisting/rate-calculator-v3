"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentUpload } from "@/components/shared/document-upload";
import { ExhibitGDropzone } from "@/components/shared/exhibit-g-dropzone";
import { SuggestInput } from "@/components/shared/suggest-input";
import { CollapsibleSection } from "@/components/calculator/collapsible-section";
import { TimeSelect } from "@/components/calculator/time-select";
import {
  AGREEMENTS,
  agreementLabel,
  dayRate,
  dayRateFor,
} from "@/lib/agreements";
import { toast } from "sonner";
import type { ExhibitGInput, WorkDocument, CalculationBreakdown } from "@/types";
import type { RateSchedule } from "@/lib/rate-constants";
import { RATES } from "@/lib/rate-constants";
import { Save } from "lucide-react";
import { snapToSixMinutes, formatCurrency } from "@/lib/time-utils";
import { addMinutes, MEAL_MINUTES } from "@/components/calculator/time-select";
import { calculateRate } from "@/lib/rate-engine";
import { checkNdMeal, ND_MEAL_WINDOW_HOURS } from "@/lib/nd-meal";
import {
  additionalContractPay,
  MAX_CONTRACTS,
  MIN_CONTRACTS_FOR_FIELD,
} from "@/lib/multi-contract";
import { toDisplay } from "@/components/calculator/time-select";

/** Get current time as HH:MM string, snapped to 6-min increments */
function getCurrentTimeSnapped(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return snapToSixMinutes(`${hh}:${mm}`);
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split("T")[0];
}

const defaultInput: ExhibitGInput = {
  showName: "",
  workDate: new Date().toISOString().split("T")[0],
  callTime: "",
  dismissOnSet: "",
  dismissMakeupWardrobe: null,
  ndMealIn: null,
  ndMealOut: null,
  firstMealStart: null,
  firstMealFinish: null,
  secondMealStart: null,
  secondMealFinish: null,
  stuntAdjustment: 0,
  flatDayRate: null,
  forcedCall: false,
  isSixthDay: false,
  isSeventhDay: false,
  isHoliday: false,
  workStatus: "theatrical_basic",
  characterName: "",
  notes: "",
};

// Animated currency counter — rolls through each cent toward the target value
function AnimatedCurrency({ value }: { value: number }) {
  const targetCents = Math.round(value * 100);
  const displayedRef = useRef(targetCents);
  const [displayed, setDisplayed] = useState(targetCents);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const animate = () => {
      const current = displayedRef.current;
      const diff = targetCents - current;

      if (diff === 0) return;

      // Large jump (> $5) — snap immediately
      if (Math.abs(diff) > 500) {
        displayedRef.current = targetCents;
        setDisplayed(targetCents);
        return;
      }

      // Step 1 cent toward target each frame
      displayedRef.current = current + (diff > 0 ? 1 : -1);
      setDisplayed(displayedRef.current);
      rafRef.current = requestAnimationFrame(animate);
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [targetCents]);

  return <>{formatCurrency(displayed / 100)}</>;
}

export function ExhibitGForm() {
  const router = useRouter();
  const [input, setInput] = useState<ExhibitGInput>(defaultInput);
  const [documents, setDocuments] = useState<WorkDocument[]>([]);
  const [exhibitGDocs, setExhibitGDocs] = useState<WorkDocument[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);
  /**
   * Contracts worked that day, including the one calculated in full. Follows
   * the number of Gs uploaded until someone types over it — two Gs usually
   * means two contracts, but not always, and it is theirs to correct.
   */
  const [contracts, setContracts] = useState(1);
  /**
   * A flat deal names its own day rate instead of taking a schedule's. The
   * tick is separate state because "no rate yet" and "no flat deal" are the
   * same value otherwise, and the box has to come before the number.
   */
  const [flatDeal, setFlatDeal] = useState(false);
  const [contractsTouched, setContractsTouched] = useState(false);
  const [multipleEpisodeWeekly, setMultipleEpisodeWeekly] = useState(false);
  const [showNdMeal, setShowNdMeal] = useState(false);
  const [showFirstMeal, setShowFirstMeal] = useState(true); // 1st meal selected by default
  const [showSecondMeal, setShowSecondMeal] = useState(false);
  // Show live rate toggle (only available when work date is today)
  const [showLiveRate, setShowLiveRate] = useState(false);
  // Live rate mode: "counter" = real-time by the second, "6min" = 6-minute intervals
  const [liveMode, setLiveMode] = useState<"counter" | "6min">("6min");
  // Tick counter to trigger recalc for live rate
  const [liveTick, setLiveTick] = useState(0);

  const isStuntCoordinator = input.workStatus === "stunt_coordinator";

  const update = useCallback((field: keyof ExhibitGInput, value: unknown) => {
    setInput((prev) => ({ ...prev, [field]: value }));
  }, []);

  /**
   * Setting when a meal started offers when it ended, half an hour on —
   * what a meal usually is. Done in one update so the decision reads the
   * finish time as it actually is, and it never overwrites one already
   * entered.
   */
  const setMealStart = useCallback(
    (
      startField: "firstMealStart" | "secondMealStart",
      finishField: "firstMealFinish" | "secondMealFinish",
      value: string
    ) => {
      setInput((prev) => ({
        ...prev,
        [startField]: value || null,
        [finishField]:
          value && !prev[finishField]
            ? addMinutes(value, MEAL_MINUTES)
            : prev[finishField],
      }));
    },
    []
  );

  /**
   * The live rate is a running total for a day still going. Once a
   * dismissal or a wrap is entered the day has an end, and a number that
   * carries on climbing past it is not what the performer earned — the
   * live calculation replaces `dismissOnSet` with the current time, so it
   * would quietly ignore the time they just typed. Derived rather than
   * held in state: there is then no moment where the toggle is hidden but
   * the override is still running.
   */
  const wrapped = Boolean(input.dismissOnSet || input.dismissMakeupWardrobe);
  const liveRate = showLiveRate && !wrapped;

  // Tick interval: 100ms for counter mode (smooth ticking), 60s for 6-min mode
  useEffect(() => {
    if (!liveRate) return;
    const ms = liveMode === "counter" ? 100 : 60_000;
    const interval = setInterval(() => setLiveTick((t) => t + 1), ms);
    return () => clearInterval(interval);
  }, [liveRate, liveMode]);

  // Live calculation — runs whenever input changes (not for stunt coordinator — flat rate)
  // While the day is still running, the current time stands in for the dismissal
  // Counter mode: recalcs every second with seconds precision for smooth ticking
  // 6-min mode: recalcs every 60s with standard 6-min snapped time
  /**
   * An ND meal outside its window makes the engine throw, and the throw is
   * swallowed — so the running total just vanishes. Say why instead.
   */
  const ndMeal = useMemo(
    () => checkNdMeal(input.callTime, input.ndMealIn, input.ndMealOut),
    [input.callTime, input.ndMealIn, input.ndMealOut]
  );

  const liveBreakdown: CalculationBreakdown | null = useMemo(() => {
    if (isStuntCoordinator) return null;
    if (!input.callTime) return null;
    if (liveRate) {
      const now = new Date();
      const dismissTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      try {
        if (liveMode === "counter") {
          // Pass current seconds + milliseconds for smooth real-time ticking
          return calculateRate(
            { ...input, dismissOnSet: dismissTime },
            { skipRounding: true, additionalSeconds: now.getSeconds() + now.getMilliseconds() / 1000 }
          );
        } else {
          return calculateRate({ ...input, dismissOnSet: getCurrentTimeSnapped() });
        }
      } catch {
        return null;
      }
    }
    // Not live — use entered dismiss time
    if (!input.dismissOnSet) return null;
    try {
      return calculateRate(input);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, isStuntCoordinator, liveRate, liveMode, liveTick]);

  // Live meal penalty summary from the breakdown
  const liveMealPenaltySummary = useMemo(() => {
    if (!liveBreakdown) return null;
    const { mealPenalties, forcedCallPenalty, totalPenalties } = liveBreakdown.penalties;
    if (totalPenalties === 0) return null;

    // Group meal penalties by meal type
    const mealTotals = mealPenalties.reduce<Record<string, number>>((acc, mp) => {
      acc[mp.meal] = (acc[mp.meal] || 0) + mp.amount;
      return acc;
    }, {});

    return { mealTotals, forcedCallPenalty, totalPenalties };
  }, [liveBreakdown]);


  const handleDocUpload = (doc: WorkDocument) => {
    setDocuments((prev) => [...prev, doc]);
  };

  const handleDocRemove = (index: number) => {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveDraft = async () => {
    if (!input.showName || !input.workDate) {
      toast.error("Show name and work date are required to save");
      return;
    }

    setSavingDraft(true);
    try {
      const allDocuments = [...exhibitGDocs, ...documents];

      // Stunt coordinator is a flat deal — no time-based calculation
      if (isStuntCoordinator) {
        const flatRate = dayRateFor(input.workStatus, input.flatDayRate);
        const res = await fetch("/api/work-records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workType: "sag_aftra",
            showName: input.showName,
            workDate: input.workDate,
            workStatus: "stunt_coordinator",
            characterName: "",
            notes: input.notes,
            callTime: null,
            dismissOnSet: null,
            dismissMakeupWardrobe: null,
            ndMealIn: null,
            ndMealOut: null,
            firstMealStart: null,
            firstMealFinish: null,
            secondMealStart: null,
            secondMealFinish: null,
            stuntAdjustment: 0,
            forcedCall: false,
            isSixthDay: false,
            isSeventhDay: false,
            isHoliday: false,
            recordStatus: "complete",
            documents: allDocuments,
            expectedAmount: flatRate,
            paymentStatus: "unpaid",
            paidAmount: 0,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to save");
        }
        const saved = await res.json();
        toast.success("Saved!");
        router.push(`/work/${saved._id}`);
        return;
      }

      // Calculate if we have enough data
      let calculation: CalculationBreakdown | undefined;
      let expectedAmount: number | undefined;
      if (input.callTime && input.dismissOnSet) {
        try {
          calculation = calculateRate(input);
          // The engine works out one contract; the rest are day rates on top.
          expectedAmount = calculation.grandTotal + extraContracts.pay;
        } catch {
          // Non-fatal — save without calculation
        }
      }

      // Determine record status
      let recordStatus: string;
      if (calculation) {
        recordStatus = "complete";
      } else if (allDocuments.some((d) => d.documentType === "exhibit_g")) {
        recordStatus = "needs_times";
      } else {
        recordStatus = "draft";
      }

      const res = await fetch("/api/work-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          workType: "sag_aftra",
          recordStatus,
          documents: allDocuments,
          calculation,
          expectedAmount,
          contracts,
          multipleEpisodeWeekly,
          paymentStatus: "unpaid",
          paidAmount: 0,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }

      const saved = await res.json();
      toast.success(calculation ? "Saved with calculation!" : "Draft saved!");
      router.push(`/work/${saved._id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleExhibitGUpload = (doc: WorkDocument) => {
    setExhibitGDocs((prev) => [...prev, doc]);
  };

  const handleExhibitGRemove = (index: number) => {
    setExhibitGDocs((prev) => prev.filter((_, i) => i !== index));
  };

  // The count follows the pages until someone sets it themselves.
  useEffect(() => {
    if (!contractsTouched) setContracts(Math.max(1, exhibitGDocs.length));
  }, [exhibitGDocs.length, contractsTouched]);

  const extraContracts = useMemo(
    () =>
      additionalContractPay(contracts, input.workStatus, multipleEpisodeWeekly),
    [contracts, input.workStatus, multipleEpisodeWeekly]
  );

  const handleExhibitGRotate = (index: number, rotation: number) => {
    setExhibitGDocs((prev) =>
      prev.map((doc, i) => (i === index ? { ...doc, rotation } : doc))
    );
  };

  const hasExhibitGPreview = exhibitGDocs.length > 0;

  return (
    <div className={hasExhibitGPreview ? "max-w-3xl lg:max-w-7xl mx-auto" : "max-w-3xl mx-auto space-y-6"}>
      <div className={hasExhibitGPreview ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : ""}>
        {/* Left column: Exhibit G Preview (only when docs uploaded, desktop) */}
        {hasExhibitGPreview && (
          <div className="hidden lg:block space-y-4 lg:sticky lg:top-4 lg:self-start">
            {exhibitGDocs.map((doc, i) => {
              const ext = doc.filename.split(".").pop()?.toLowerCase() || "";
              const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
              const isPdf = ext === "pdf";

              return (
                <Card key={`${doc.filename}-${i}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium truncate">
                      {doc.originalName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {isImage && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/api/uploads/${doc.filename}`}
                        alt={doc.originalName}
                        style={{ transform: `rotate(${doc.rotation ?? 0}deg)` }}
                        className="w-full max-h-[80vh] object-contain bg-muted"
                      />
                    )}
                    {isPdf && (
                      <iframe
                        src={`/api/uploads/${doc.filename}`}
                        title={doc.originalName}
                        className="w-full h-[80vh] border-0"
                      />
                    )}
                    {!isImage && !isPdf && (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Preview not available
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Right column (or only column): Form */}
        <div className="space-y-6">
      <Card>
        <CardContent className="space-y-6 pt-6">
          {/* The Exhibit G leads the page and takes up most of it. A G we
              can read beats a day typed in from memory, so this is the one
              thing that should be impossible to walk past. */}
          <div className="pb-5 border-b border-border/50">
            <ExhibitGDropzone
              documents={exhibitGDocs}
              onUpload={handleExhibitGUpload}
              onRemove={handleExhibitGRemove}
              onRotate={handleExhibitGRotate}
            />

            {/* Two Gs on one day usually means two contracts, and each past
                the first is owed its own day rate. Only worth asking once
                there is more than one page. */}
            {exhibitGDocs.length >= MIN_CONTRACTS_FOR_FIELD && (
              <div className="mt-3 rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="contracts" className="text-base shrink-0">
                    Contracts this day
                  </Label>
                  <Input
                    id="contracts"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_CONTRACTS}
                    step={1}
                    value={contracts}
                    onChange={(e) => {
                      setContractsTouched(true);
                      const n = parseInt(e.target.value, 10);
                      setContracts(
                        Number.isFinite(n)
                          ? Math.min(MAX_CONTRACTS, Math.max(1, n))
                          : 1
                      );
                    }}
                    className="w-20 shrink-0 text-center"
                  />
                </div>

                {/* Label is a flex row of its own, so the note goes beside
                    it rather than under unless it sits outside. */}
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="multipleEpisodeWeekly"
                    checked={multipleEpisodeWeekly}
                    onCheckedChange={(v) => setMultipleEpisodeWeekly(!!v)}
                    className="mt-1 shrink-0"
                  />
                  <div className="min-w-0">
                    <Label
                      htmlFor="multipleEpisodeWeekly"
                      className="text-base font-normal"
                    >
                      Multiple-episode weekly
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      The episodes sit inside the weekly guarantee, so the
                      extra contracts are not owed on top.
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {extraContracts.absorbedByWeekly
                    ? "The weekly covers every episode worked today."
                    : extraContracts.count > 0
                      ? `One day calculated in full, plus ${extraContracts.count} × ${formatCurrency(extraContracts.dayRate)} for the other ${extraContracts.count === 1 ? "contract" : "contracts"}.`
                      : "One contract, calculated in full below."}
                </p>
              </div>
            )}
          </div>

          {/* Job details stay folded away so work times lead — the summary
              line carries whatever has been filled in. */}
          <CollapsibleSection
            title="Job Details"
            defaultOpen={false}
            summary={
              [
                input.showName,
                input.workDate,
                input.characterName,
                input.flatDayRate
                  ? `Flat ${dayRate(input.flatDayRate)}`
                  : agreementLabel(input.workStatus),
              ]
                .filter(Boolean)
                .join(" · ") || "Show title, date, character, agreement"
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1 min-w-0">
                <Label htmlFor="showName" className="text-base">Show Title</Label>
                <SuggestInput
                  kind="show"
                  id="showName"
                  value={input.showName}
                  onChange={(e) => update("showName", e.target.value)}
                  placeholder="e.g., Action Movie 3"
                  className="text-lg h-12"
                />
              </div>
              <div className="space-y-1 min-w-0">
                <Label htmlFor="workDate" className="text-base">Work Date</Label>
                <Input
                  id="workDate"
                  type="date"
                  value={input.workDate}
                  onChange={(e) => update("workDate", e.target.value)}
                  className="text-lg h-12 w-full max-w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!isStuntCoordinator && (
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="characterName" className="text-base">Character Name</Label>
                  <SuggestInput
                    kind="character"
                    id="characterName"
                    value={input.characterName}
                    onChange={(e) => update("characterName", e.target.value)}
                    placeholder="e.g., Stunt Double - Lead"
                    className="text-lg h-12"
                  />
                </div>
              )}
              <div className="space-y-1 min-w-0">
                <Label htmlFor="workStatus" className="text-base">Agreement Type</Label>
                <Select
                  value={input.workStatus}
                  onValueChange={(v) => update("workStatus", v as RateSchedule)}
                >
                  <SelectTrigger id="workStatus" className="text-lg h-12 w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGREEMENTS.map((agreement) => (
                      <SelectItem
                        key={agreement.id}
                        value={agreement.id}
                        className="text-base"
                      >
                        {agreementLabel(agreement.id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 min-w-0">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="flatDeal"
                    checked={flatDeal}
                    onCheckedChange={(v) => {
                      setFlatDeal(!!v);
                      if (!v) update("flatDayRate", null);
                    }}
                  />
                  <Label htmlFor="flatDeal" className="text-base font-normal">
                    Flat rate — a deal that is not one of these
                  </Label>
                </div>
                {flatDeal && (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <Label htmlFor="flatDayRate" className="text-base shrink-0">
                        Day rate
                      </Label>
                      <div className="relative flex-1 min-w-0 max-w-[15rem]">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          $
                        </span>
                        <Input
                          id="flatDayRate"
                          type="number"
                          min="0"
                          step="50"
                          value={input.flatDayRate || ""}
                          onChange={(e) =>
                            update("flatDayRate", parseFloat(e.target.value) || null)
                          }
                          className="pl-7 w-full"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Overtime, meal penalties and the stunt adjustment are
                      still worked out from this rate.
                    </p>
                  </>
                )}
              </div>
            </div>

          </CollapsibleSection>

          {/* Stunt Coordinator Flat Rate Display */}
          {isStuntCoordinator && (
            <div className="rounded-lg border-2 border-primary bg-primary/5 p-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Flat Daily Rate</p>
                <p className="text-3xl font-bold tracking-tight">
                  {formatCurrency(RATES.stunt_coordinator.daily)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Stunt Coordinator — no overtime calculation
                </p>
              </div>
            </div>
          )}

          {/* Work Times — hidden for stunt coordinator (flat deal) */}
          {!isStuntCoordinator && (<>
          <CollapsibleSection
            title="Work Times"
            defaultOpen
            summary={
              [toDisplay(input.callTime), toDisplay(input.dismissOnSet)]
                .filter(Boolean)
                .join(" → ") || "Call, meals and wrap"
            }
          >
            <div className="space-y-0">
              <div className="flex items-center justify-between gap-4 p-2 rounded bg-muted/50">
                <Label htmlFor="callTime" className="text-base shrink-0">Call Time</Label>
                <div className="flex-1 min-w-0 max-w-[15rem]"><TimeSelect id="callTime" value={input.callTime} onChange={(v) => update("callTime", v)} /></div>
              </div>
              {/* Meals */}
              <div className="border-t border-b py-3 my-1 space-y-3">
                {/* ND Meal */}
                <div className="space-y-0">
                  <div className="flex items-center space-x-2 p-2">
                    <Checkbox id="showNdMeal" checked={showNdMeal} onCheckedChange={(v) => { setShowNdMeal(!!v); if (!v) { update("ndMealIn", null); update("ndMealOut", null); } }} />
                    <Label htmlFor="showNdMeal" className="text-base font-normal">ND (Non-Deductible) Meal</Label>
                  </div>
                  {showNdMeal && (
                    <div className="grid grid-cols-2 gap-2 px-2 pb-2">
                      <div>
                        <Label htmlFor="ndMealIn" className="text-sm text-muted-foreground">In</Label>
                        <TimeSelect id="ndMealIn" value={input.ndMealIn || ""} onChange={(v) => update("ndMealIn", v || null)} compact />
                      </div>
                      <div>
                        <Label htmlFor="ndMealOut" className="text-sm text-muted-foreground">Out</Label>
                        <TimeSelect id="ndMealOut" value={input.ndMealOut || ""} onChange={(v) => update("ndMealOut", v || null)} compact />
                      </div>
                    </div>
                  )}
                  {showNdMeal && !ndMeal.ok && (
                    <p className="px-2 pb-2 text-xs text-amber-400">
                      {ndMeal.problem === "ends_before_it_starts"
                        ? "An ND meal has to end after it starts."
                        : `An ND meal has to fall in the ${ND_MEAL_WINDOW_HOURS} hours after your call — from ${toDisplay(
                            input.callTime
                          )} to ${toDisplay(
                            ndMeal.windowEnd
                          )}. Outside that it is a deductible meal, which pays differently.`}
                    </p>
                  )}
                </div>
                {/* 1st Meal */}
                <div className="space-y-0">
                  <div className="flex items-center space-x-2 p-2">
                    <Checkbox id="showFirstMeal" checked={showFirstMeal} onCheckedChange={(v) => { setShowFirstMeal(!!v); if (!v) { update("firstMealStart", null); update("firstMealFinish", null); setShowSecondMeal(false); update("secondMealStart", null); update("secondMealFinish", null); } }} />
                    <Label htmlFor="showFirstMeal" className="text-base font-normal">1st Meal</Label>
                  </div>
                  {showFirstMeal && (
                    <div className="grid grid-cols-2 gap-2 px-2 pb-2">
                      <div>
                        <Label htmlFor="firstMealStart" className="text-sm text-muted-foreground">Out</Label>
                        <TimeSelect id="firstMealStart" value={input.firstMealStart || ""} onChange={(v) => setMealStart("firstMealStart", "firstMealFinish", v)} compact />
                      </div>
                      <div>
                        <Label htmlFor="firstMealFinish" className="text-sm text-muted-foreground">In</Label>
                        <TimeSelect id="firstMealFinish" value={input.firstMealFinish || ""} onChange={(v) => update("firstMealFinish", v || null)} compact />
                      </div>
                    </div>
                  )}
                </div>
                {/* 2nd Meal — only visible when 1st Meal is checked */}
                {showFirstMeal && (
                <div className="space-y-0">
                  <div className="flex items-center space-x-2 p-2">
                    <Checkbox id="showSecondMeal" checked={showSecondMeal} onCheckedChange={(v) => { setShowSecondMeal(!!v); if (!v) { update("secondMealStart", null); update("secondMealFinish", null); } }} />
                    <Label htmlFor="showSecondMeal" className="text-base font-normal">2nd Meal</Label>
                  </div>
                  {showSecondMeal && (
                    <div className="grid grid-cols-2 gap-2 px-2 pb-2">
                      <div>
                        <Label htmlFor="secondMealStart" className="text-sm text-muted-foreground">Out</Label>
                        <TimeSelect id="secondMealStart" value={input.secondMealStart || ""} onChange={(v) => setMealStart("secondMealStart", "secondMealFinish", v)} compact />
                      </div>
                      <div>
                        <Label htmlFor="secondMealFinish" className="text-sm text-muted-foreground">In</Label>
                        <TimeSelect id="secondMealFinish" value={input.secondMealFinish || ""} onChange={(v) => update("secondMealFinish", v || null)} compact />
                      </div>
                    </div>
                  )}
                </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-4 p-2">
                <Label htmlFor="dismissOnSet" className="text-base shrink-0">Dismiss On Set</Label>
                <div className="flex-1 min-w-0 max-w-[15rem]"><TimeSelect id="dismissOnSet" value={input.dismissOnSet} onChange={(v) => update("dismissOnSet", v)} /></div>
              </div>
              <div className="flex items-center justify-between gap-4 p-2 rounded bg-muted/50">
                <Label htmlFor="dismissMakeupWardrobe" className="text-base shrink-0">Wrapped</Label>
                <div className="flex-1 min-w-0 max-w-[15rem]"><TimeSelect id="dismissMakeupWardrobe" value={input.dismissMakeupWardrobe || ""} onChange={(v) => update("dismissMakeupWardrobe", v || null)} /></div>
              </div>

              {/* Stunt Adjustment */}
              <div className="border-t pt-3 mt-3">
                <div className="flex items-center justify-between gap-4 p-2">
                  <Label htmlFor="stuntAdjustment" className="text-base shrink-0">Stunt Adjustment</Label>
                  <div className="relative flex-1 min-w-0 max-w-[15rem]">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input id="stuntAdjustment" type="number" min="0" step="50" value={input.stuntAdjustment || ""} onChange={(e) => update("stuntAdjustment", parseFloat(e.target.value) || 0)} className="pl-7 w-full" placeholder="0.00" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground px-2">Meal penalties calculated from times above</p>
              </div>
            </div>
          </CollapsibleSection>

          {/* Live rate toggle — a setting for the day, so it sits with the times
              rather than beside the total it governs. */}
          {!isStuntCoordinator && isToday(input.workDate) && !wrapped && (
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showLiveRate"
                  checked={showLiveRate}
                  onCheckedChange={(v) => setShowLiveRate(!!v)}
                />
                <Label htmlFor="showLiveRate" className="text-base font-normal">
                  Live rate
                </Label>
              </div>
              {liveRate && (
                <Select value={liveMode} onValueChange={(v) => setLiveMode(v as "counter" | "6min")}>
                  <SelectTrigger className="w-44 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="counter">Counter (real-time)</SelectItem>
                    <SelectItem value="6min">6-Minute Intervals</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Live penalty & modifier display */}
          {(liveMealPenaltySummary || liveBreakdown?.dayMultiplier.applied) && (
            <div className="rounded-lg bg-amber-950/30 border border-amber-700/50 p-3">
              <p className="text-sm font-medium text-amber-300 mb-1">Penalties & Modifiers</p>
              <div className="space-y-0.5">
                {liveBreakdown?.dayMultiplier.applied && (
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-400">
                      {liveBreakdown.dayMultiplier.type === "6th_day" ? "6th Consecutive Day" : liveBreakdown.dayMultiplier.type === "7th_day" ? "7th Consecutive Day" : "Holiday"} ({liveBreakdown.dayMultiplier.multiplier}x)
                    </span>
                    <span className="font-semibold text-amber-300">All hours</span>
                  </div>
                )}
                {liveMealPenaltySummary && Object.entries(liveMealPenaltySummary.mealTotals).map(([meal, total]) => (
                  <div key={meal} className="flex justify-between text-sm">
                    <span className="text-amber-400">{meal} Penalty</span>
                    <span className="font-semibold text-amber-300">{formatCurrency(total)}</span>
                  </div>
                ))}
                {liveMealPenaltySummary && liveMealPenaltySummary.forcedCallPenalty > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-400">Forced Call Penalty</span>
                    <span className="font-semibold text-amber-300">{formatCurrency(liveMealPenaltySummary.forcedCallPenalty)}</span>
                  </div>
                )}
                {liveMealPenaltySummary && (
                  <div className="flex justify-between text-sm font-bold border-t border-amber-700/50 pt-1 mt-1">
                    <span className="text-amber-300">Total Penalties</span>
                    <span className="text-amber-300">{formatCurrency(liveMealPenaltySummary.totalPenalties)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <Separator />

          {/* Penalties — last section */}
          <div>
            <h3 className="font-semibold mb-3">Penalties</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox id="forcedCall" checked={input.forcedCall} onCheckedChange={(v) => update("forcedCall", !!v)} />
                <Label htmlFor="forcedCall" className="text-base font-normal">Forced Call</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="isSixthDay" checked={input.isSixthDay} onCheckedChange={(v) => {
                  if (v) { update("isSeventhDay", false); update("isHoliday", false); }
                  update("isSixthDay", !!v);
                }} />
                <Label htmlFor="isSixthDay" className="text-base font-normal">6th Consecutive Day</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="isSeventhDay" checked={input.isSeventhDay} onCheckedChange={(v) => {
                  if (v) { update("isSixthDay", false); update("isHoliday", false); }
                  update("isSeventhDay", !!v);
                }} />
                <Label htmlFor="isSeventhDay" className="text-base font-normal">7th Consecutive Day</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="isHoliday" checked={input.isHoliday} onCheckedChange={(v) => {
                  if (v) { update("isSixthDay", false); update("isSeventhDay", false); }
                  update("isHoliday", !!v);
                }} />
                <Label htmlFor="isHoliday" className="text-base font-normal">Holiday</Label>
              </div>
            </div>
          </div>

          {/* Live Rate Display */}
          {liveBreakdown && (
            <div className="rounded-lg border-2 border-primary bg-primary/5 p-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {liveRate ? (liveMode === "counter" ? "Live Rate (real-time)" : "Live Rate (6-min intervals)") : "Calculated Total"}
                </p>
                <p className="text-3xl font-bold tracking-tight tabular-nums">
                  <AnimatedCurrency
                    value={liveBreakdown.grandTotal + extraContracts.pay}
                  />
                </p>
                {extraContracts.pay > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatCurrency(liveBreakdown.grandTotal)} for the
                    calculated day, plus {extraContracts.count} ×{" "}
                    {formatCurrency(extraContracts.dayRate)} for the other
                    {extraContracts.count === 1 ? " contract" : " contracts"}
                  </p>
                )}
                <div className="flex justify-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span>{Number(liveBreakdown.netWorkHours.toFixed(1))}h worked</span>
                  {liveBreakdown.penalties.totalPenalties > 0 && (
                    <span>+ {formatCurrency(liveBreakdown.penalties.totalPenalties)} penalties</span>
                  )}
                </div>
              </div>
            </div>
          )}

          </>)}

          <Separator />

          {/* Notes and attachments — folded away unless needed. */}
          <CollapsibleSection
            title="Notes"
            summary={input.notes || "Anything to remember about this day"}
          >
            <Textarea
              id="notes"
              value={input.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="What do you need to remember about this work day?"
              rows={3}
              className="text-lg"
            />
          </CollapsibleSection>

          {/* Documents — hide wardrobe_photo for stunt coordinator */}
          <CollapsibleSection
            title="Documents & Photos"
            summary={
              documents.length
                ? `${documents.length} attached`
                : "Call sheets, contracts, paystubs, photos"
            }
          >
            <DocumentUpload
              documents={documents}
              onUpload={handleDocUpload}
              onRemove={handleDocRemove}
              documentTypes={isStuntCoordinator
                ? ["call_sheet", "contract", "other", "paystub"]
                : ["call_sheet", "contract", "wardrobe_photo", "other", "paystub"]
              }
            />
          </CollapsibleSection>

          {/* Action Button */}
          <div className="pt-4">
            <Button onClick={handleSaveDraft} disabled={savingDraft} className="w-full" size="lg">
              <Save className="mr-2 h-4 w-4" />
              {savingDraft ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>{/* end right column */}
      </div>{/* end grid */}
    </div>
  );
}
