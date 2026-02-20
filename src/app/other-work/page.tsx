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
import { Save, ArrowLeft } from "lucide-react";

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

  const handleDocUpload = useCallback((doc: WorkDocument) => {
    setDocuments((prev) => [...prev, doc]);
  }, []);

  const handleDocRemove = useCallback((index: number) => {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
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
      <Button variant="ghost" onClick={() => router.push("/")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Other Work Day</CardTitle>
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

          {/* Attachments */}
          <div>
            <h3 className="font-semibold mb-3">Attachments</h3>
            <DocumentUpload
              documents={documents}
              onUpload={handleDocUpload}
              onRemove={handleDocRemove}
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
