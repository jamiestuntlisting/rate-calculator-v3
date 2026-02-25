"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { RateBreakdown } from "@/components/calculation/rate-breakdown";
import { formatCurrency } from "@/lib/time-utils";
import { toast } from "sonner";
import type { WorkRecord } from "@/types";
import { ArrowLeft, Save, Upload, Trash2, Pencil, X } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  paid_correctly: "Paid Correctly",
  underpaid: "Underpaid",
  overpaid: "Overpaid",
  late: "Late",
};

const STATUS_COLORS: Record<string, string> = {
  unpaid: "bg-red-900/40 text-red-300 border-red-700/50",
  paid_correctly: "bg-green-900/40 text-green-300 border-green-700/50",
  underpaid: "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
  overpaid: "bg-blue-900/40 text-blue-300 border-blue-700/50",
  late: "bg-purple-900/40 text-purple-300 border-purple-700/50",
};

const RECORD_STATUS_LABELS: Record<string, string> = {
  complete: "Complete",
  needs_times: "Needs Times",
  draft: "Draft",
  attachment_only: "Attachment Only",
};

const AGREEMENT_LABELS: Record<string, string> = {
  theatrical_basic: "Theatrical Basic ($1,246/day)",
  television: "Television ($1,246/day)",
  stunt_coordinator: "Stunt Coordinator ($1,938/day)",
};

const OTHER_CATEGORY_LABELS: Record<string, string> = {
  commercial: "Commercial",
  music_video: "Music Video",
  low_budget: "Low Budget",
  other: "Other",
};

/** Format a date string (ISO or YYYY-MM-DD) without timezone shift */
function formatDateSafe(dateStr: string): string {
  // Extract the YYYY-MM-DD portion from the ISO string
  const ymd = dateStr.split("T")[0];
  const [year, month, day] = ymd.split("-").map(Number);
  return `${month}/${day}/${year}`;
}

export default function WorkDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const [record, setRecord] = useState<WorkRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    showName: "",
    workDate: "",
    characterName: "",
    callTime: "",
    dismissOnSet: "",
    reportMakeupWardrobe: "" as string | null,
    dismissMakeupWardrobe: "" as string | null,
    stuntAdjustment: 0,
    forcedCall: false,
    isSixthDay: false,
    isSeventhDay: false,
    isHoliday: false,
    workStatus: "theatrical_basic",
    ndMealIn: "" as string | null,
    ndMealOut: "" as string | null,
    firstMealStart: "" as string | null,
    firstMealFinish: "" as string | null,
    secondMealStart: "" as string | null,
    secondMealFinish: "" as string | null,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Other work type edit state
  const [otherEditData, setOtherEditData] = useState({
    showName: "",
    workDate: "",
    expectedAmount: 0,
    notes: "",
  });

  const id = params.id as string;

  useEffect(() => {
    fetch(`/api/work-records/${id}`)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Not found");
      })
      .then((data) => {
        setRecord(data);
        setPaidAmount(data.paidAmount?.toString() || "");
        setPaymentStatus(data.paymentStatus || "unpaid");
        setNotes(data.notes || "");
      })
      .catch(() => {
        toast.error("Work record not found");
        router.push("/tracker");
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  const isOtherWorkType = record?.workType === "other";
  const isStuntCoordinator = record?.workStatus === "stunt_coordinator";

  const startEditing = () => {
    if (!record) return;
    if (isOtherWorkType) {
      setOtherEditData({
        showName: record.showName,
        workDate: record.workDate?.split("T")[0] || "",
        expectedAmount: record.expectedAmount || 0,
        notes: record.notes || "",
      });
    } else {
      setEditData({
        showName: record.showName,
        workDate: record.workDate?.split("T")[0] || "",
        characterName: record.characterName || "",
        callTime: record.callTime || "",
        dismissOnSet: record.dismissOnSet || "",
        reportMakeupWardrobe: record.reportMakeupWardrobe || "",
        dismissMakeupWardrobe: record.dismissMakeupWardrobe || "",
        stuntAdjustment: record.stuntAdjustment || 0,
        forcedCall: record.forcedCall || false,
        isSixthDay: record.isSixthDay || false,
        isSeventhDay: record.isSeventhDay || false,
        isHoliday: record.isHoliday || false,
        workStatus: record.workStatus || "theatrical_basic",
        ndMealIn: record.ndMealIn || "",
        ndMealOut: record.ndMealOut || "",
        firstMealStart: record.firstMealStart || "",
        firstMealFinish: record.firstMealFinish || "",
        secondMealStart: record.secondMealStart || "",
        secondMealFinish: record.secondMealFinish || "",
      });
    }
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const handleSaveOtherEdit = async () => {
    if (!otherEditData.showName.trim()) {
      toast.error("Job description is required");
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/work-records/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showName: otherEditData.showName.trim(),
          workDate: otherEditData.workDate,
          expectedAmount: otherEditData.expectedAmount,
          notes: otherEditData.notes,
        }),
      });

      if (!res.ok) throw new Error("Failed to update");

      const updated = await res.json();
      setRecord(updated);
      setNotes(otherEditData.notes);
      setEditing(false);
      toast.success("Record updated!");
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveEdit = async () => {
    if (isOtherWorkType) {
      return handleSaveOtherEdit();
    }

    if (!editData.showName) {
      toast.error("Show name is required");
      return;
    }

    setSavingEdit(true);
    try {
      // Stunt coordinator is flat rate — no recalculation needed
      if (editData.workStatus === "stunt_coordinator") {
        const res = await fetch(`/api/work-records/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            showName: editData.showName,
            workDate: editData.workDate,
            workStatus: editData.workStatus,
            characterName: "",
            callTime: "",
            dismissOnSet: "",
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
            expectedAmount: 1938,
            calculation: null,
            recordStatus: "complete",
            notes: record?.notes || "",
          }),
        });

        if (!res.ok) throw new Error("Failed to update");
        const updated = await res.json();
        setRecord(updated);
        setEditing(false);
        toast.success("Record updated!");
        return;
      }

      // Build the input for recalculation
      const calcInput = {
        showName: editData.showName,
        workDate: editData.workDate,
        callTime: editData.callTime,
        reportMakeupWardrobe: editData.reportMakeupWardrobe || null,
        dismissOnSet: editData.dismissOnSet,
        dismissMakeupWardrobe: editData.dismissMakeupWardrobe || null,
        ndMealIn: editData.ndMealIn || null,
        ndMealOut: editData.ndMealOut || null,
        firstMealStart: editData.firstMealStart || null,
        firstMealFinish: editData.firstMealFinish || null,
        secondMealStart: editData.secondMealStart || null,
        secondMealFinish: editData.secondMealFinish || null,
        stuntAdjustment: editData.stuntAdjustment,
        forcedCall: editData.forcedCall,
        isSixthDay: editData.isSixthDay,
        isSeventhDay: editData.isSeventhDay,
        isHoliday: editData.isHoliday,
        workStatus: editData.workStatus,
        characterName: editData.characterName,
        notes: record?.notes || "",
      };

      // Recalculate if we have the required time fields
      let calculation = record?.calculation;
      let expectedAmount = record?.expectedAmount;

      if (editData.callTime && editData.dismissOnSet) {
        const calcRes = await fetch("/api/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(calcInput),
        });

        if (calcRes.ok) {
          const calcData = await calcRes.json();
          calculation = calcData.breakdown;
          expectedAmount = calcData.breakdown.grandTotal;
        }
      }

      // Determine record status
      let recordStatus: string;
      if (editData.callTime && editData.dismissOnSet) {
        recordStatus = "complete";
      } else if (record?.documents?.some((d) => d.documentType === "exhibit_g")) {
        recordStatus = "needs_times";
      } else {
        recordStatus = "draft";
      }

      // Save updated record
      const updateData = {
        ...calcInput,
        calculation,
        expectedAmount,
        recordStatus,
      };

      const res = await fetch(`/api/work-records/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) throw new Error("Failed to update");

      const updated = await res.json();
      setRecord(updated);
      setEditing(false);
      toast.success("Record updated and recalculated!");
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  };

  /** Automatically determine payment status based on amounts */
  const derivePaymentStatus = (amount: number, expected: number | undefined): string => {
    if (amount <= 0) return "unpaid";
    if (!expected || expected <= 0) return "paid_correctly";
    if (amount >= expected) {
      return amount > expected ? "overpaid" : "paid_correctly";
    }
    return "underpaid";
  };

  const handleSavePayment = async () => {
    setSaving(true);
    try {
      const amount = parseFloat(paidAmount) || 0;
      const status = derivePaymentStatus(amount, record?.expectedAmount);

      const res = await fetch(`/api/work-records/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paidAmount: amount,
          paymentStatus: status,
          notes,
          paidDate: amount > 0 ? new Date().toISOString() : null,
        }),
      });

      if (!res.ok) throw new Error("Failed to update");

      const updated = await res.json();
      setRecord(updated);
      setPaymentStatus(updated.paymentStatus);
      toast.success("Payment info updated!");
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;

    const formData = new FormData();
    formData.append("file", e.target.files[0]);

    try {
      const uploadRes = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Upload failed");
      const { path } = await uploadRes.json();

      const res = await fetch(`/api/work-records/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photos: [...(record?.photos || []), path],
        }),
      });

      if (!res.ok) throw new Error("Failed to update record");

      const updated = await res.json();
      setRecord(updated);
      toast.success("Photo uploaded!");
    } catch {
      toast.error("Failed to upload photo");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this work record?")) return;

    try {
      const res = await fetch(`/api/work-records/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Work record deleted");
      router.push("/tracker");
    } catch {
      toast.error("Failed to delete record");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!record) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push("/tracker")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tracker
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={handleDelete}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>

      {/* Record Status Badge (SAG-AFTRA only) */}
      {!isOtherWorkType && record.recordStatus && record.recordStatus !== "complete" && (
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className={
              record.recordStatus === "draft"
                ? "bg-yellow-900/40 text-yellow-300 border-yellow-700/50"
                : record.recordStatus === "needs_times"
                  ? "bg-orange-900/40 text-orange-300 border-orange-700/50"
                  : "bg-blue-900/40 text-blue-300 border-blue-700/50"
            }
          >
            {RECORD_STATUS_LABELS[record.recordStatus] || record.recordStatus}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {record.recordStatus === "needs_times"
              ? "This Exhibit G needs work times to calculate your rate."
              : record.recordStatus === "draft"
                ? "This Exhibit G is incomplete. Edit to add missing details."
                : "This entry has attachments only. Edit to add Exhibit G details."}
          </span>
        </div>
      )}

      {/* Content area for PDF capture */}
      <div ref={contentRef} className="space-y-6">
        {/* Work Day Details */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {isOtherWorkType ? "Other Work Details" : "Work Day Details"}
              </CardTitle>
              {!editing ? (
                <Button variant="ghost" size="sm" onClick={startEditing}>
                  <Pencil className="mr-1 h-3 w-3" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                  >
                    <Save className="mr-1 h-3 w-3" />
                    {savingEdit ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={cancelEditing}
                    disabled={savingEdit}
                  >
                    <X className="mr-1 h-3 w-3" />
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isOtherWorkType ? (
              /* ── Other Work Type ── */
              editing ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label className="text-sm text-muted-foreground">Role</Label>
                    <Input
                      value={otherEditData.showName}
                      onChange={(e) => setOtherEditData(d => ({ ...d, showName: e.target.value }))}
                      placeholder="e.g., Stunt Double, Background"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-sm text-muted-foreground">Work Date</Label>
                      <Input
                        type="date"
                        value={otherEditData.workDate}
                        onChange={(e) => setOtherEditData(d => ({ ...d, workDate: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm text-muted-foreground">Amount Owed</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={otherEditData.expectedAmount || ""}
                          onChange={(e) => setOtherEditData(d => ({ ...d, expectedAmount: parseFloat(e.target.value) || 0 }))}
                          className="pl-7"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm text-muted-foreground">Notes</Label>
                    <Textarea
                      value={otherEditData.notes}
                      onChange={(e) => setOtherEditData(d => ({ ...d, notes: e.target.value }))}
                      rows={3}
                      placeholder="What do you need to remember about this work day?"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Show</p>
                    <p className="font-semibold">{record.showName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Date</p>
                    <p className="font-semibold">
                      {formatDateSafe(record.workDate)}
                    </p>
                  </div>
                  {record.otherWorkCategory && (
                    <div>
                      <p className="text-muted-foreground">Category</p>
                      <p className="font-semibold">
                        {OTHER_CATEGORY_LABELS[record.otherWorkCategory] || record.otherWorkCategory}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground">Amount Owed</p>
                    <p className="font-semibold">
                      {record.expectedAmount
                        ? formatCurrency(record.expectedAmount)
                        : "—"}
                    </p>
                  </div>
                  {record.characterName && (
                    <div>
                      <p className="text-muted-foreground">Role</p>
                      <p className="font-semibold">{record.characterName}</p>
                    </div>
                  )}
                  {record.notes && (
                    <div className="col-span-2 md:col-span-3">
                      <p className="text-muted-foreground">Notes</p>
                      <p className="font-semibold whitespace-pre-wrap">{record.notes}</p>
                    </div>
                  )}
                </div>
              )
            ) : (
              /* ── SAG-AFTRA Work Type ── */
              editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <Label className="text-sm text-muted-foreground">Show</Label>
                      <Input
                        value={editData.showName}
                        onChange={(e) => setEditData(d => ({ ...d, showName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm text-muted-foreground">Date</Label>
                      <Input
                        type="date"
                        value={editData.workDate}
                        onChange={(e) => setEditData(d => ({ ...d, workDate: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm text-muted-foreground">Agreement Type</Label>
                      <Select
                        value={editData.workStatus}
                        onValueChange={(v) => setEditData(d => ({ ...d, workStatus: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="theatrical_basic">Theatrical Basic</SelectItem>
                          <SelectItem value="television">Television</SelectItem>
                          <SelectItem value="stunt_coordinator">Stunt Coordinator</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* Non-stunt-coordinator fields */}
                  {editData.workStatus !== "stunt_coordinator" && (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <Label className="text-sm text-muted-foreground">Character</Label>
                          <Input
                            value={editData.characterName}
                            onChange={(e) => setEditData(d => ({ ...d, characterName: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-sm text-muted-foreground">Call Time</Label>
                          <Input
                            type="time"
                            value={editData.callTime}
                            onChange={(e) => setEditData(d => ({ ...d, callTime: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <Label className="text-sm text-muted-foreground">Dismiss On Set</Label>
                          <Input
                            type="time"
                            value={editData.dismissOnSet}
                            onChange={(e) => setEditData(d => ({ ...d, dismissOnSet: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-sm text-muted-foreground">Report Makeup/Wardrobe</Label>
                          <Input
                            type="time"
                            value={editData.reportMakeupWardrobe || ""}
                            onChange={(e) => setEditData(d => ({ ...d, reportMakeupWardrobe: e.target.value || null }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-sm text-muted-foreground">Wrapped</Label>
                          <Input
                            type="time"
                            value={editData.dismissMakeupWardrobe || ""}
                            onChange={(e) => setEditData(d => ({ ...d, dismissMakeupWardrobe: e.target.value || null }))}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <Label className="text-sm text-muted-foreground">Stunt Adj ($)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="50"
                            value={editData.stuntAdjustment || ""}
                            onChange={(e) => setEditData(d => ({ ...d, stuntAdjustment: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-sm text-muted-foreground">1st Meal Start</Label>
                          <Input
                            type="time"
                            value={editData.firstMealStart || ""}
                            onChange={(e) => setEditData(d => ({ ...d, firstMealStart: e.target.value || null }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-sm text-muted-foreground">1st Meal Finish</Label>
                          <Input
                            type="time"
                            value={editData.firstMealFinish || ""}
                            onChange={(e) => setEditData(d => ({ ...d, firstMealFinish: e.target.value || null }))}
                          />
                        </div>
                      </div>
                      {/* Day Type & Penalties checkboxes */}
                      <div className="flex flex-wrap gap-4 pt-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="edit-forcedCall"
                            checked={editData.forcedCall}
                            onCheckedChange={(v) => setEditData(d => ({ ...d, forcedCall: !!v }))}
                          />
                          <Label htmlFor="edit-forcedCall" className="text-sm font-normal">Forced Call</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="edit-isSixthDay"
                            checked={editData.isSixthDay}
                            onCheckedChange={(v) => setEditData(d => ({ ...d, isSixthDay: !!v }))}
                          />
                          <Label htmlFor="edit-isSixthDay" className="text-sm font-normal">6th Consecutive Day</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="edit-isSeventhDay"
                            checked={editData.isSeventhDay}
                            onCheckedChange={(v) => setEditData(d => ({ ...d, isSeventhDay: !!v }))}
                          />
                          <Label htmlFor="edit-isSeventhDay" className="text-sm font-normal">7th Consecutive Day</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="edit-isHoliday"
                            checked={editData.isHoliday}
                            onCheckedChange={(v) => setEditData(d => ({ ...d, isHoliday: !!v }))}
                          />
                          <Label htmlFor="edit-isHoliday" className="text-sm font-normal">Holiday</Label>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Show</p>
                    <p className="font-semibold">{record.showName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Date</p>
                    <p className="font-semibold">
                      {formatDateSafe(record.workDate)}
                    </p>
                  </div>
                  {!isStuntCoordinator && (
                    <div>
                      <p className="text-muted-foreground">Character</p>
                      <p className="font-semibold">{record.characterName || "—"}</p>
                    </div>
                  )}
                  {!isStuntCoordinator && (
                    <>
                      <div>
                        <p className="text-muted-foreground">Call Time</p>
                        <p className="font-semibold">{record.callTime || "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Dismiss On Set</p>
                        <p className="font-semibold">{record.dismissOnSet || "—"}</p>
                      </div>
                    </>
                  )}
                  {record.workStatus && (
                    <div>
                      <p className="text-muted-foreground">Agreement</p>
                      <p className="font-semibold">
                        {AGREEMENT_LABELS[record.workStatus] || record.workStatus}
                      </p>
                    </div>
                  )}
                  {isStuntCoordinator && (
                    <div>
                      <p className="text-muted-foreground">Flat Rate</p>
                      <p className="font-semibold">{formatCurrency(record.expectedAmount || 1938)}</p>
                    </div>
                  )}
                  {!isStuntCoordinator && record.stuntAdjustment > 0 && (
                    <div>
                      <p className="text-muted-foreground">Stunt Adjustment</p>
                      <p className="font-semibold">
                        {formatCurrency(record.stuntAdjustment)}
                      </p>
                    </div>
                  )}
                  {!isStuntCoordinator && record.forcedCall && (
                    <div>
                      <Badge variant="destructive">Forced Call</Badge>
                    </div>
                  )}
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* Rate Breakdown (only for SAG-AFTRA complete records with calculation) */}
        {!isOtherWorkType && record.calculation && (
          <RateBreakdown breakdown={record.calculation} compact />
        )}

        <Separator />

        {/* Payment Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {isOtherWorkType ? "Amount Owed" : "Expected Payment"}
                </p>
                <p className="text-xl font-bold">
                  {record.expectedAmount
                    ? formatCurrency(record.expectedAmount)
                    : "—"}
                </p>
              </div>
              <Badge
                variant="secondary"
                className={STATUS_COLORS[paymentStatus] || "bg-gray-800 text-gray-300"}
              >
                {STATUS_LABELS[paymentStatus] || paymentStatus}
              </Badge>
            </div>

            <div className="space-y-1">
              <Label htmlFor="paidAmount">Amount Paid ($)</Label>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="paidAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="pl-7"
                  placeholder="0.00"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Status is automatically determined from the paid amount
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Add notes about this work day..."
              />
            </div>

            <Button
              onClick={handleSavePayment}
              disabled={saving}
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Documents — displayed inline */}
        {record.documents && record.documents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Attached Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {record.documents.map((doc, i) => {
                  const ext = doc.filename.split(".").pop()?.toLowerCase() || "";
                  const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
                  const isPdf = ext === "pdf";
                  const docTypeLabel =
                    doc.documentType === "exhibit_g" ? "Exhibit G"
                    : doc.documentType === "call_sheet" ? "Call Sheet"
                    : doc.documentType === "contract" ? "Contract"
                    : doc.documentType === "wardrobe_photo" ? "Wardrobe Photo"
                    : doc.documentType === "paystub" ? "Paystub"
                    : "Other";

                  return (
                    <div key={`${doc.filename}-${i}`} className="rounded-lg border overflow-hidden">
                      <div className="flex items-center justify-between p-2 bg-muted/30">
                        <span className="text-sm font-medium truncate min-w-0">
                          {doc.originalName}
                        </span>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {docTypeLabel}
                        </Badge>
                      </div>
                      {isImage && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={`/api/uploads/${doc.filename}`}
                          alt={doc.originalName}
                          className="w-full max-h-[600px] object-contain bg-muted"
                        />
                      )}
                      {isPdf && (
                        <iframe
                          src={`/api/uploads/${doc.filename}`}
                          title={doc.originalName}
                          className="w-full h-[600px] border-0"
                        />
                      )}
                      {!isImage && !isPdf && (
                        <div className="p-4 text-center">
                          <a
                            href={`/api/uploads/${doc.filename}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            Download {doc.originalName}
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>{/* end contentRef */}

      {/* Photos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Photos & Documents</CardTitle>
            <Button asChild variant="outline" size="sm">
              <label className="cursor-pointer">
                <Upload className="mr-2 h-4 w-4" />
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadPhoto}
                />
              </label>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {record.photos && record.photos.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {record.photos.map((photo, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-lg border overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo}
                    alt={`Document ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4">
              No photos uploaded yet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
