"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
import { toast } from "sonner";
import type { ExhibitGInput, WorkDocument, CalculationBreakdown } from "@/types";
import type { RateSchedule } from "@/lib/rate-constants";
import { RATES } from "@/lib/rate-constants";
import { Save } from "lucide-react";
import { snapToSixMinutes, isValidTime, formatCurrency } from "@/lib/time-utils";
import { calculateRate } from "@/lib/rate-engine";

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
  reportMakeupWardrobe: null,
  reportOnSet: "",
  dismissOnSet: "",
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
  workStatus: "theatrical_basic",
  characterName: "",
  notes: "",
};

export function ExhibitGForm() {
  const router = useRouter();
  const [input, setInput] = useState<ExhibitGInput>(defaultInput);
  const [documents, setDocuments] = useState<WorkDocument[]>([]);
  const [exhibitGDocs, setExhibitGDocs] = useState<WorkDocument[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [showNdMeal, setShowNdMeal] = useState(false);
  const [showFirstMeal, setShowFirstMeal] = useState(true); // 1st meal selected by default
  const [showSecondMeal, setShowSecondMeal] = useState(false);
  // Show live rate toggle (only available when work date is today)
  const [showLiveRate, setShowLiveRate] = useState(false);
  // Tick counter to trigger recalc for live rate every 60s
  const [liveTick, setLiveTick] = useState(0);

  const isStuntCoordinator = input.workStatus === "stunt_coordinator";

  const update = useCallback((field: keyof ExhibitGInput, value: unknown) => {
    setInput((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Tick every 60s when live rate is on, to re-trigger the calculation
  useEffect(() => {
    if (!showLiveRate) return;
    const interval = setInterval(() => setLiveTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, [showLiveRate]);

  // Live calculation — runs whenever input changes (not for stunt coordinator — flat rate)
  // When showLiveRate is on, uses current time as dismiss time for the calculation
  // Only requires callTime to be set — reportOnSet defaults to callTime if empty
  const liveBreakdown: CalculationBreakdown | null = useMemo(() => {
    if (isStuntCoordinator) return null;
    if (!input.callTime) return null;
    const reportOnSet = input.reportOnSet || input.callTime;
    const dismissTime = showLiveRate ? getCurrentTimeSnapped() : input.dismissOnSet;
    if (!dismissTime) return null;
    try {
      return calculateRate({ ...input, reportOnSet, dismissOnSet: dismissTime });
    } catch {
      return null;
    }
  }, [input, isStuntCoordinator, showLiveRate, liveTick]);

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

  const handleTimeBlur = (field: keyof ExhibitGInput, value: string) => {
    if (value && isValidTime(value)) {
      update(field, snapToSixMinutes(value));
    }
  };

  const handleTimeFocus = (field: keyof ExhibitGInput, currentValue: string | null) => {
    if (!currentValue) {
      update(field, "12:00");
    }
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
        const flatRate = RATES.stunt_coordinator.daily;
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
            reportOnSet: null,
            dismissOnSet: null,
            reportMakeupWardrobe: null,
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
      if (input.callTime && input.reportOnSet && input.dismissOnSet) {
        try {
          calculation = calculateRate(input);
          expectedAmount = calculation.grandTotal;
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

  const handleDocUpload = (doc: WorkDocument) => {
    setDocuments((prev) => [...prev, doc]);
  };

  const handleDocRemove = (index: number) => {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleExhibitGUpload = (doc: WorkDocument) => {
    setExhibitGDocs((prev) => [...prev, doc]);
  };

  const handleExhibitGRemove = (index: number) => {
    setExhibitGDocs((prev) => prev.filter((_, i) => i !== index));
  };

  const hasExhibitGPreview = exhibitGDocs.length > 0;

  return (
    <div className={hasExhibitGPreview ? "max-w-7xl mx-auto" : "max-w-3xl mx-auto space-y-6"}>
      <div className={hasExhibitGPreview ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : ""}>
        {/* Left column: Exhibit G Preview (only when docs uploaded, desktop) */}
        {hasExhibitGPreview && (
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
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
          {/* Show Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="showName">Show Title</Label>
              <Input
                id="showName"
                value={input.showName}
                onChange={(e) => update("showName", e.target.value)}
                placeholder="e.g., Action Movie 3"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="workDate">Work Date</Label>
              <Input
                id="workDate"
                type="date"
                value={input.workDate}
                onChange={(e) => update("workDate", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {!isStuntCoordinator && (
              <div className="space-y-1">
                <Label htmlFor="characterName">Character Name</Label>
                <Input
                  id="characterName"
                  value={input.characterName}
                  onChange={(e) => update("characterName", e.target.value)}
                  placeholder="e.g., Stunt Double - Lead"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="workStatus">Agreement Type</Label>
              <Select
                value={input.workStatus}
                onValueChange={(v) => update("workStatus", v as RateSchedule)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="theatrical_basic">Theatrical Basic ($1,246/day)</SelectItem>
                  <SelectItem value="television">Television ($1,246/day)</SelectItem>
                  <SelectItem value="stunt_coordinator">Stunt Coordinator ($1,938/day)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Exhibit G Attachment — right under Agreement Type */}
          <div>
            <DocumentUpload
              documents={exhibitGDocs}
              onUpload={handleExhibitGUpload}
              onRemove={handleExhibitGRemove}
              documentTypes={["exhibit_g"]}
            />
          </div>

          <Separator />

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
          <div>
            <h3 className="font-semibold mb-4">Work Times</h3>
            <div className="space-y-0">
              <div className="flex items-center justify-between gap-4 p-2 rounded bg-muted/50">
                <Label htmlFor="callTime" className="text-sm shrink-0">Call Time</Label>
                <Input id="callTime" type="time" value={input.callTime} onChange={(e) => update("callTime", e.target.value)} onFocus={() => handleTimeFocus("callTime", input.callTime || null)} onBlur={() => handleTimeBlur("callTime", input.callTime)} className="w-40" />
              </div>
              <div className="flex items-center justify-between gap-4 p-2">
                <Label htmlFor="reportMakeupWardrobe" className="text-sm shrink-0">Report Makeup/Wardrobe</Label>
                <Input id="reportMakeupWardrobe" type="time" value={input.reportMakeupWardrobe || ""} onChange={(e) => update("reportMakeupWardrobe", e.target.value || null)} onFocus={() => handleTimeFocus("reportMakeupWardrobe", input.reportMakeupWardrobe)} onBlur={() => handleTimeBlur("reportMakeupWardrobe", input.reportMakeupWardrobe || "")} className="w-40" />
              </div>
              <div className="flex items-center justify-between gap-4 p-2 rounded bg-muted/50">
                <Label htmlFor="reportOnSet" className="text-sm shrink-0">Report On Set</Label>
                <Input id="reportOnSet" type="time" value={input.reportOnSet} onChange={(e) => update("reportOnSet", e.target.value)} onFocus={() => handleTimeFocus("reportOnSet", input.reportOnSet || null)} onBlur={() => handleTimeBlur("reportOnSet", input.reportOnSet)} className="w-40" />
              </div>

              {/* Meals — between Report On Set and Dismiss On Set */}
              <div className="border-t border-b py-3 my-1 space-y-3">
                {/* ND Meal */}
                <div className="space-y-0">
                  <div className="flex items-center space-x-2 p-2">
                    <Checkbox id="showNdMeal" checked={showNdMeal} onCheckedChange={(v) => { setShowNdMeal(!!v); if (!v) { update("ndMealIn", null); update("ndMealOut", null); } }} />
                    <Label htmlFor="showNdMeal" className="text-sm font-normal">ND (Non-Deductible) Meal</Label>
                  </div>
                  {showNdMeal && (
                    <div className="pl-6 space-y-0">
                      <div className="flex items-center justify-between gap-4 p-2 rounded bg-muted/50">
                        <Label htmlFor="ndMealIn" className="text-sm shrink-0">ND Meal In</Label>
                        <Input id="ndMealIn" type="time" value={input.ndMealIn || ""} onChange={(e) => update("ndMealIn", e.target.value || null)} onFocus={() => handleTimeFocus("ndMealIn", input.ndMealIn)} onBlur={() => handleTimeBlur("ndMealIn", input.ndMealIn || "")} className="w-40" />
                      </div>
                      <div className="flex items-center justify-between gap-4 p-2">
                        <Label htmlFor="ndMealOut" className="text-sm shrink-0">ND Meal Out</Label>
                        <Input id="ndMealOut" type="time" value={input.ndMealOut || ""} onChange={(e) => update("ndMealOut", e.target.value || null)} onFocus={() => handleTimeFocus("ndMealOut", input.ndMealOut)} onBlur={() => handleTimeBlur("ndMealOut", input.ndMealOut || "")} className="w-40" />
                      </div>
                    </div>
                  )}
                </div>
                {/* 1st Meal */}
                <div className="space-y-0">
                  <div className="flex items-center space-x-2 p-2">
                    <Checkbox id="showFirstMeal" checked={showFirstMeal} onCheckedChange={(v) => { setShowFirstMeal(!!v); if (!v) { update("firstMealStart", null); update("firstMealFinish", null); setShowSecondMeal(false); update("secondMealStart", null); update("secondMealFinish", null); } }} />
                    <Label htmlFor="showFirstMeal" className="text-sm font-normal">1st Meal</Label>
                  </div>
                  {showFirstMeal && (
                    <div className="pl-6 space-y-0">
                      <div className="flex items-center justify-between gap-4 p-2 rounded bg-muted/50">
                        <Label htmlFor="firstMealStart" className="text-sm shrink-0">1st Meal Start</Label>
                        <Input id="firstMealStart" type="time" value={input.firstMealStart || ""} onChange={(e) => update("firstMealStart", e.target.value || null)} onFocus={() => handleTimeFocus("firstMealStart", input.firstMealStart)} onBlur={() => handleTimeBlur("firstMealStart", input.firstMealStart || "")} className="w-40" />
                      </div>
                      <div className="flex items-center justify-between gap-4 p-2">
                        <Label htmlFor="firstMealFinish" className="text-sm shrink-0">1st Meal Finish</Label>
                        <Input id="firstMealFinish" type="time" value={input.firstMealFinish || ""} onChange={(e) => update("firstMealFinish", e.target.value || null)} onFocus={() => handleTimeFocus("firstMealFinish", input.firstMealFinish)} onBlur={() => handleTimeBlur("firstMealFinish", input.firstMealFinish || "")} className="w-40" />
                      </div>
                    </div>
                  )}
                </div>
                {/* 2nd Meal — only visible when 1st Meal is checked */}
                {showFirstMeal && (
                <div className="space-y-0">
                  <div className="flex items-center space-x-2 p-2">
                    <Checkbox id="showSecondMeal" checked={showSecondMeal} onCheckedChange={(v) => { setShowSecondMeal(!!v); if (!v) { update("secondMealStart", null); update("secondMealFinish", null); } }} />
                    <Label htmlFor="showSecondMeal" className="text-sm font-normal">2nd Meal</Label>
                  </div>
                  {showSecondMeal && (
                    <div className="pl-6 space-y-0">
                      <div className="flex items-center justify-between gap-4 p-2 rounded bg-muted/50">
                        <Label htmlFor="secondMealStart" className="text-sm shrink-0">2nd Meal Start</Label>
                        <Input id="secondMealStart" type="time" value={input.secondMealStart || ""} onChange={(e) => update("secondMealStart", e.target.value || null)} onFocus={() => handleTimeFocus("secondMealStart", input.secondMealStart)} onBlur={() => handleTimeBlur("secondMealStart", input.secondMealStart || "")} className="w-40" />
                      </div>
                      <div className="flex items-center justify-between gap-4 p-2">
                        <Label htmlFor="secondMealFinish" className="text-sm shrink-0">2nd Meal Finish</Label>
                        <Input id="secondMealFinish" type="time" value={input.secondMealFinish || ""} onChange={(e) => update("secondMealFinish", e.target.value || null)} onFocus={() => handleTimeFocus("secondMealFinish", input.secondMealFinish)} onBlur={() => handleTimeBlur("secondMealFinish", input.secondMealFinish || "")} className="w-40" />
                      </div>
                    </div>
                  )}
                </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-4 p-2">
                <Label htmlFor="dismissOnSet" className="text-sm shrink-0">Dismiss On Set</Label>
                <Input
                  id="dismissOnSet"
                  type="time"
                  value={input.dismissOnSet}
                  onChange={(e) => update("dismissOnSet", e.target.value)}
                  onFocus={() => handleTimeFocus("dismissOnSet", input.dismissOnSet || null)}
                  onBlur={() => handleTimeBlur("dismissOnSet", input.dismissOnSet)}
                  className="w-40"
                />
              </div>
              <div className="flex items-center justify-between gap-4 p-2 rounded bg-muted/50">
                <Label htmlFor="dismissMakeupWardrobe" className="text-sm shrink-0">Dismiss Makeup/Wardrobe</Label>
                <Input id="dismissMakeupWardrobe" type="time" value={input.dismissMakeupWardrobe || ""} onChange={(e) => update("dismissMakeupWardrobe", e.target.value || null)} onFocus={() => handleTimeFocus("dismissMakeupWardrobe", input.dismissMakeupWardrobe)} onBlur={() => handleTimeBlur("dismissMakeupWardrobe", input.dismissMakeupWardrobe || "")} className="w-40" />
              </div>

              {/* Stunt Adjustment */}
              <div className="border-t pt-3 mt-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="shrink-0">
                    <Label htmlFor="stuntAdjustment" className="text-sm">Stunt Adjustment</Label>
                    <p className="text-xs text-muted-foreground">Meal penalties calculated from times above</p>
                  </div>
                  <div className="relative w-40">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input id="stuntAdjustment" type="number" min="0" step="50" value={input.stuntAdjustment || ""} onChange={(e) => update("stuntAdjustment", parseFloat(e.target.value) || 0)} className="pl-7 w-40" placeholder="0.00" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Live meal penalty display */}
          {liveMealPenaltySummary && (
            <div className="rounded-lg bg-amber-950/30 border border-amber-700/50 p-3">
              <p className="text-sm font-medium text-amber-300 mb-1">Meal Penalties</p>
              <div className="space-y-0.5">
                {Object.entries(liveMealPenaltySummary.mealTotals).map(([meal, total]) => (
                  <div key={meal} className="flex justify-between text-sm">
                    <span className="text-amber-400">{meal} Penalty</span>
                    <span className="font-semibold text-amber-300">{formatCurrency(total)}</span>
                  </div>
                ))}
                {liveMealPenaltySummary.forcedCallPenalty > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-400">Forced Call Penalty</span>
                    <span className="font-semibold text-amber-300">{formatCurrency(liveMealPenaltySummary.forcedCallPenalty)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold border-t border-amber-700/50 pt-1 mt-1">
                  <span className="text-amber-300">Total Penalties</span>
                  <span className="text-amber-300">{formatCurrency(liveMealPenaltySummary.totalPenalties)}</span>
                </div>
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
                <Label htmlFor="forcedCall" className="text-sm font-normal">Forced Call</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="isSixthDay" checked={input.isSixthDay} onCheckedChange={(v) => {
                  if (v) { update("isSeventhDay", false); update("isHoliday", false); }
                  update("isSixthDay", !!v);
                }} />
                <Label htmlFor="isSixthDay" className="text-sm font-normal">6th Consecutive Day</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="isSeventhDay" checked={input.isSeventhDay} onCheckedChange={(v) => {
                  if (v) { update("isSixthDay", false); update("isHoliday", false); }
                  update("isSeventhDay", !!v);
                }} />
                <Label htmlFor="isSeventhDay" className="text-sm font-normal">7th Consecutive Day</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="isHoliday" checked={input.isHoliday} onCheckedChange={(v) => {
                  if (v) { update("isSixthDay", false); update("isSeventhDay", false); }
                  update("isHoliday", !!v);
                }} />
                <Label htmlFor="isHoliday" className="text-sm font-normal">Holiday</Label>
              </div>
            </div>
          </div>

          {/* Live Rate Display */}
          {liveBreakdown && (
            <div className="rounded-lg border-2 border-primary bg-primary/5 p-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {showLiveRate ? "Live Rate (as of now)" : "Calculated Total"}
                </p>
                <p className="text-3xl font-bold tracking-tight">
                  {formatCurrency(liveBreakdown.grandTotal)}
                </p>
                <div className="flex justify-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span>{liveBreakdown.netWorkHours}h worked</span>
                  {liveBreakdown.penalties.totalPenalties > 0 && (
                    <span>+ {formatCurrency(liveBreakdown.penalties.totalPenalties)} penalties</span>
                  )}
                </div>
              </div>
            </div>
          )}
          </>)}

          <Separator />

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={input.notes} onChange={(e) => update("notes", e.target.value)} placeholder="What do you need to remember about this work day?" rows={3} />
          </div>

          <Separator />

          {/* Documents — hide wardrobe_photo for stunt coordinator */}
          <div>
            <h3 className="font-semibold mb-3">Documents & Photos</h3>
            <DocumentUpload
              documents={documents}
              onUpload={handleDocUpload}
              onRemove={handleDocRemove}
              documentTypes={isStuntCoordinator
                ? ["call_sheet", "contract", "other", "paystub"]
                : ["call_sheet", "contract", "wardrobe_photo", "other", "paystub"]
              }
            />
          </div>

          {/* Show Live Rate — only when work date is today */}
          {!isStuntCoordinator && isToday(input.workDate) && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="showLiveRate"
                checked={showLiveRate}
                onCheckedChange={(v) => setShowLiveRate(!!v)}
              />
              <Label htmlFor="showLiveRate" className="text-sm font-normal">
                Show live rate
              </Label>
            </div>
          )}

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
