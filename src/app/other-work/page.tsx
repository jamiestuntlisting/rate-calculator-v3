"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DocumentUpload } from "@/components/shared/document-upload";
import { toast } from "sonner";
import type { WorkDocument, OtherWorkCategory } from "@/types";
import { OTHER_WORK_CATEGORY_LABELS } from "@/types";
import { Save } from "lucide-react";
import { TimeSelect, addMinutes, MEAL_MINUTES } from "@/components/calculator/time-select";
import { effectiveHourlyRate, workHoursFor } from "@/lib/work-hours";
import { formatCurrency } from "@/lib/time-utils";

export default function OtherWorkPage() {
  const router = useRouter();
  const [workDate, setWorkDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [showName, setShowName] = useState("");
  const [jobCompleted, setJobCompleted] = useState("");
  const [amountOwed, setAmountOwed] = useState("");
  const [notes, setNotes] = useState("");
  const [documents, setDocuments] = useState<WorkDocument[]>([]);
  const [saving, setSaving] = useState(false);
  const [workCategory, setWorkCategory] = useState<OtherWorkCategory>("other");

  /**
   * The times. Non-SAG work is not on the Basic Agreement, so nothing here
   * is run through the rate engine — but the hours are still worth having,
   * and against a flat fee they are the only thing that says whether the
   * fee was any good.
   */
  const [times, setTimes] = useState({
    callTime: "",
    firstMealStart: "",
    firstMealFinish: "",
    secondMealStart: "",
    secondMealFinish: "",
    dismissOnSet: "",
    dismissMakeupWardrobe: "",
  });

  const setTime = (key: keyof typeof times, value: string) =>
    setTimes((prev) => ({ ...prev, [key]: value }));

  /** Setting a meal's start offers a finish half an hour on, never overwrites one. */
  const setMealStart = (
    startKey: "firstMealStart" | "secondMealStart",
    finishKey: "firstMealFinish" | "secondMealFinish",
    value: string
  ) =>
    setTimes((prev) => ({
      ...prev,
      [startKey]: value,
      [finishKey]:
        value && !prev[finishKey] ? addMinutes(value, MEAL_MINUTES) : prev[finishKey],
    }));

  const hours = workHoursFor(times);
  const perHour = effectiveHourlyRate(parseFloat(amountOwed) || 0, hours?.netHours);

  const handleDocUpload = useCallback((doc: WorkDocument) => {
    setDocuments((prev) => [...prev, doc]);
  }, []);

  const handleDocRemove = useCallback((index: number) => {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDocRotate = useCallback((index: number, rotation: number) => {
    setDocuments((prev) =>
      prev.map((doc, i) => (i === index ? { ...doc, rotation } : doc))
    );
  }, []);

  const handleSave = async () => {
    if (!showName.trim()) {
      toast.error("Show / Production name is required");
      return;
    }
    if (!workDate) {
      toast.error("Work date is required");
      return;
    }

    setSaving(true);
    try {
      const amount = parseFloat(amountOwed) || 0;

      const res = await fetch("/api/work-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workType: "other",
          otherWorkCategory: workCategory,
          showName: showName.trim(),
          workDate,
          callTime: times.callTime || null,
          firstMealStart: times.firstMealStart || null,
          firstMealFinish: times.firstMealFinish || null,
          secondMealStart: times.secondMealStart || null,
          secondMealFinish: times.secondMealFinish || null,
          dismissOnSet: times.dismissOnSet || null,
          dismissMakeupWardrobe: times.dismissMakeupWardrobe || null,
          recordStatus: "complete",
          documents,
          expectedAmount: amount,
          characterName: jobCompleted.trim(),
          notes: notes.trim(),
          paymentStatus: "unpaid",
          paidAmount: 0,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      const saved = await res.json();
      toast.success("Work day saved!");
      router.push(`/work/${saved._id}`);
    } catch {
      toast.error("Failed to save work day");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Other Work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Work Category */}
          <div className="space-y-2">
            <Label>Work Category</Label>
            <div className="flex flex-wrap gap-3">
              {(Object.entries(OTHER_WORK_CATEGORY_LABELS) as [OtherWorkCategory, string][]).map(
                ([value, label]) => (
                  <label
                    key={value}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      workCategory === value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-muted-foreground/30 hover:border-primary/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="workCategory"
                      value={value}
                      checked={workCategory === value}
                      onChange={() => setWorkCategory(value)}
                      className="sr-only"
                    />
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                )
              )}
            </div>
          </div>

          {/* Show Name */}
          <div className="space-y-1">
            <Label htmlFor="showName">Show / Production Name</Label>
            <Input
              id="showName"
              value={showName}
              onChange={(e) => setShowName(e.target.value)}
              placeholder="e.g., Nike Campaign"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Work Date */}
            <div className="space-y-1">
              <Label htmlFor="workDate">Work Date</Label>
              <Input
                id="workDate"
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
              />
            </div>

            {/* Amount Owed */}
            <div className="space-y-1">
              <Label htmlFor="amountOwed">Amount Owed</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="amountOwed"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountOwed}
                  onChange={(e) => setAmountOwed(e.target.value)}
                  className="pl-7"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Role */}
          <div className="space-y-1">
            <Label htmlFor="jobCompleted">Role</Label>
            <Input
              id="jobCompleted"
              value={jobCompleted}
              onChange={(e) => setJobCompleted(e.target.value)}
              placeholder="e.g., Stunt Double, Background"
            />
          </div>

          {/* Times — the same fields as a SAG day, minus everything that
              only means something under the Basic Agreement. */}
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold">Work Times</h3>
              <p className="text-xs text-muted-foreground">
                Optional, and not calculated against SAG rates — this is not a
                SAG job. They tell you what the day actually cost you.
              </p>
            </div>

            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="callTime" className="shrink-0">
                Call Time
              </Label>
              <div className="flex-1 min-w-0 max-w-[15rem]">
                <TimeSelect
                  id="callTime"
                  value={times.callTime}
                  onChange={(v) => setTime("callTime", v)}
                />
              </div>
            </div>

            {(
              [
                ["1st Meal", "firstMealStart", "firstMealFinish"],
                ["2nd Meal", "secondMealStart", "secondMealFinish"],
              ] as const
            ).map(([label, startKey, finishKey]) => (
              <div key={label} className="space-y-1">
                <p className="text-sm text-muted-foreground">{label}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor={startKey} className="text-xs text-muted-foreground">
                      Out
                    </Label>
                    <TimeSelect
                      id={startKey}
                      value={times[startKey]}
                      onChange={(v) => setMealStart(startKey, finishKey, v)}
                      compact
                    />
                  </div>
                  <div>
                    <Label htmlFor={finishKey} className="text-xs text-muted-foreground">
                      In
                    </Label>
                    <TimeSelect
                      id={finishKey}
                      value={times[finishKey]}
                      onChange={(v) => setTime(finishKey, v)}
                      compact
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="dismissOnSet" className="shrink-0">
                Dismiss On Set
              </Label>
              <div className="flex-1 min-w-0 max-w-[15rem]">
                <TimeSelect
                  id="dismissOnSet"
                  value={times.dismissOnSet}
                  onChange={(v) => setTime("dismissOnSet", v)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="dismissMakeupWardrobe" className="shrink-0">
                Wrapped
              </Label>
              <div className="flex-1 min-w-0 max-w-[15rem]">
                <TimeSelect
                  id="dismissMakeupWardrobe"
                  value={times.dismissMakeupWardrobe}
                  onChange={(v) => setTime("dismissMakeupWardrobe", v)}
                />
              </div>
            </div>

            {hours && (
              <div className="rounded-lg border border-border p-3 space-y-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Worked</span>
                  <span className="tabular-nums">{hours.netHours}h</span>
                </div>
                {hours.mealHours > 0 && (
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      Meals, out of {hours.elapsedHours}h on the clock
                    </span>
                    <span className="tabular-nums">{hours.mealHours}h</span>
                  </div>
                )}
                {perHour !== null && (
                  <div className="flex justify-between gap-3 text-sm font-medium pt-1 border-t border-border">
                    <span>That fee, per hour worked</span>
                    <span className="tabular-nums">{formatCurrency(perHour)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Attachments */}
          <div>
            <h3 className="font-semibold mb-3">Attachments</h3>
            <DocumentUpload
              documents={documents}
              onUpload={handleDocUpload}
              onRemove={handleDocRemove}
              onRotate={handleDocRotate}
              documentTypes={["timecard", "contract", "paystub", "other"]}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What do you need to remember about this work day?"
              rows={3}
            />
          </div>

          {/* Save Button */}
          <div className="pt-4">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full"
              size="lg"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
