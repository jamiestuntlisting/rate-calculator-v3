"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { TimeSelect, toDisplay, WorkDateContext } from "@/components/calculator/time-select";
import {
  AGREEMENTS,
  FLAT_AGREEMENTS,
  THREE_DAY_OPTIONS,
  agreementLabel,
  dayRate,
  isFlatAgreement,
  threeDayContractRate,
  threeDayLabel,
  weeklyAgreementLabel,
  weeklyEquivalentDayRate,
} from "@/lib/agreements";
import { GapLine } from "@/components/calculator/gap-line";
import { CollapsibleSection } from "@/components/calculator/collapsible-section";
import { checkNdMeal, ND_MEAL_WINDOW_HOURS, ND_MEAL_MINUTES } from "@/lib/nd-meal";
import { shortDay } from "@/lib/format-date";
import { SuggestInput } from "@/components/shared/suggest-input";
import { clampMealFinish, mealLengthWarning, secondMealOrderWarning } from "@/lib/meal-length";
import { WRAP_MINUTES, wrapOrderWarning } from "@/lib/wrap-check";
import { ShowCombobox } from "@/components/shared/show-combobox";
import { effectiveHourlyRate, workHoursFor } from "@/lib/work-hours";
import { MEAL_MINUTES } from "@/components/calculator/time-select";
import { followedTime, offerAfterIfEmpty, offerBeforeIfEmpty } from "@/lib/follow-time";
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
import { MEAL_PENALTIES, RATES, type RateSchedule, commercialSessionFee } from "@/lib/rate-constants";
import { additionalContractPay } from "@/lib/multi-contract";
import { PayStubSection } from "@/components/shared/pay-stub-section";
import { useAuth } from "@/context/auth-context";
import { owedLinesFromRecord, type PayStubLine } from "@/lib/pay-stub";
import { toast } from "sonner";
import { toUploadableImage } from "@/lib/heic-to-jpeg";
import type { WorkDocument, WorkRecord } from "@/types";
import { DOCUMENT_TYPE_LABELS } from "@/types";
import { ExhibitGViewer } from "@/components/shared/exhibit-g-viewer";
import { RotatableThumb } from "@/components/shared/rotatable-thumb";
import { ArrowLeft, FileDown, Save, Upload, Trash2, Pencil, X } from "lucide-react";

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
  const { user } = useAuth();
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
    // "unset" = never stated: calculates daily, may still join a weekly.
    // "daily" is the deliberate choice that keeps the day out of them.
    contractLength: "unset" as "unset" | "daily" | "three_day" | "weekly",
    threeDayLength: "short" as "short" | "long",
    showName: "",
    workDate: "",
    characterName: "",
    callTime: "",
    dismissOnSet: "",
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
  /**
   * The meal blocks toggle open like they do on Log Work, so the two
   * forms read as the same form. Unchecking one clears its times.
   */
  const [editMeals, setEditMeals] = useState({
    nd: false,
    first: true,
    second: false,
  });
  /** Whether the 2nd meal's In was hand-set (offers keep tracking +6h). */
  const editSecondTouched = useRef(false);
  /** Same for the 1st meal's In: offers track call/ND, hand-set stays. */
  const editFirstTouched = useRef(false);

  /** Lunch defaults six hours after call, or after the ND meal's end. */
  const reofferEditMeals = (
    d: typeof editData,
    anchor: string | null
  ): Partial<typeof editData> => {
    if (!anchor || editFirstTouched.current || !editMeals.first) return {};
    const start = followedTime(anchor, null, MEAL_PENALTIES.maxHoursBeforeFirstMeal * 60) ?? "";
    const finish = followedTime(start, null, MEAL_MINUTES);
    const patch: Partial<typeof editData> = {
      firstMealStart: start,
      firstMealFinish: finish,
    };
    if (editMeals.second && !editSecondTouched.current) {
      patch.secondMealStart = followedTime(finish, null, MEAL_PENALTIES.maxHoursBeforeSecondMeal * 60);
      patch.secondMealFinish = followedTime(
        patch.secondMealStart,
        null,
        MEAL_MINUTES
      );
    }
    return patch;
  };
  /** The whole ND rule, said in the form the way Log Work says it. */
  const editNdMeal = checkNdMeal(
    editData.callTime,
    editData.ndMealIn,
    editData.ndMealOut
  );

  // Other work type edit state
  const [otherEditData, setOtherEditData] = useState({
    showName: "",
    workDate: "",
    expectedAmount: 0,
    notes: "",
    callTime: "",
    firstMealStart: "",
    firstMealFinish: "",
    secondMealStart: "",
    secondMealFinish: "",
    dismissOnSet: "",
    dismissMakeupWardrobe: "",
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

  /**
   * The attachment to read while filling the fields in. An Exhibit G wins;
   * failing that any viewable file, since people do photograph a call sheet
   * or a timecard and work from that.
   */
  /**
   * What we make the day up of, in the same shape a stub is read in — so the
   * note to payroll can put the two side by side.
   */
  const owedLines: PayStubLine[] = record ? owedLinesFromRecord(record) : [];

  /** Shows this member has logged, for the Show field's autocomplete. */
  const [knownShows, setKnownShows] = useState<string[]>([]);
  /** The g_upload linked to this record, if it still needs transcribing. */
  const [linkedUpload, setLinkedUpload] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/suggestions?kind=show")
      .then((r) => r.json())
      .then((data) => setKnownShows(data.names ?? []))
      .catch(() => {});
    fetch("/api/g-uploads")
      .then((r) => r.json())
      .then((data) => {
        const mine = (data.uploads ?? []).find(
          (u: { workRecordId?: string | null; transcription: unknown }) =>
            u.workRecordId === id && !u.transcription
        );
        setLinkedUpload(mine?._id ?? null);
      })
      .catch(() => {});
  }, [id]);

  const transcribeDoc: (WorkDocument & { index: number }) | null = (() => {
    const viewable = (record?.documents ?? [])
      .map((doc, index) => ({ ...doc, index }))
      .filter((doc) => /\.(jpe?g|png|gif|webp|pdf)$/i.test(doc.filename));
    return (
      viewable.find((doc) => doc.documentType === "exhibit_g") ??
      viewable[0] ??
      null
    );
  })();

  /**
   * ?edit=1 opens the form the moment the record loads — the Resolve
   * page links an unlogged day here so "log this day" lands in the
   * time fields, not on a read-only view.
   */
  const autoEditDone = useRef(false);
  useEffect(() => {
    if (autoEditDone.current || !record || editing) return;
    autoEditDone.current = true;
    // Read the query directly: useSearchParams would demand a Suspense
    // boundary at build time for no benefit on a fully client page.
    if (new URLSearchParams(window.location.search).get("edit") === "1") {
      startEditing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, editing]);

  const startEditing = () => {
    if (!record) return;
    if (isOtherWorkType) {
      setOtherEditData({
        callTime: record.callTime || "",
        firstMealStart: record.firstMealStart || "",
        firstMealFinish: record.firstMealFinish || "",
        secondMealStart: record.secondMealStart || "",
        secondMealFinish: record.secondMealFinish || "",
        dismissOnSet: record.dismissOnSet || "",
        dismissMakeupWardrobe: record.dismissMakeupWardrobe || "",
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
        dismissMakeupWardrobe: record.dismissMakeupWardrobe || "",
        stuntAdjustment: record.stuntAdjustment || 0,
        forcedCall: record.forcedCall || false,
        isSixthDay: record.isSixthDay || false,
        isSeventhDay: record.isSeventhDay || false,
        isHoliday: record.isHoliday || false,
        workStatus: record.workStatus || "theatrical_basic",
        contractLength:
          (record.contractLength as "daily" | "three_day" | "weekly" | null) ??
          (record.weeklyContract ? "weekly" : "unset"),
        threeDayLength: record.threeDayLength === "long" ? "long" : "short",
        ndMealIn: record.ndMealIn || "",
        ndMealOut: record.ndMealOut || "",
        firstMealStart: record.firstMealStart || "",
        firstMealFinish: record.firstMealFinish || "",
        secondMealStart: record.secondMealStart || "",
        secondMealFinish: record.secondMealFinish || "",
      });
      setEditMeals({
        nd: Boolean(record.ndMealIn || record.ndMealOut),
        // A record with no times yet is being transcribed; offer the 1st
        // meal open the way Log Work does for a fresh day.
        first:
          Boolean(record.firstMealStart || record.firstMealFinish) ||
          !record.callTime,
        second: Boolean(record.secondMealStart || record.secondMealFinish),
      });
      // Meals already on the record were set by someone: keep them.
      editSecondTouched.current = Boolean(
        record.secondMealStart || record.secondMealFinish
      );
      editFirstTouched.current = Boolean(
        record.firstMealStart || record.firstMealFinish
      );
    }
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  /**
   * Edits save themselves: two and a half seconds after the last change,
   * the record is written and recalculated in place, without closing the
   * form or raising a toast. The Save button remains for the impatient
   * and as the visible promise that the work is kept.
   */
  const editDataRef = useRef(editData);
  editDataRef.current = editData;
  const autoSaveArmed = useRef(false);
  useEffect(() => {
    if (!editing || isOtherWorkType) return;
    // Skip the render that opened the form; only real changes save.
    if (!autoSaveArmed.current) {
      autoSaveArmed.current = true;
      return;
    }
    if (!editData.showName.trim()) return;
    const timer = setTimeout(() => {
      handleSaveEdit({ silent: true });
    }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editData, editing, isOtherWorkType]);
  useEffect(() => {
    if (!editing) autoSaveArmed.current = false;
  }, [editing]);

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
          callTime: otherEditData.callTime || null,
          firstMealStart: otherEditData.firstMealStart || null,
          firstMealFinish: otherEditData.firstMealFinish || null,
          secondMealStart: otherEditData.secondMealStart || null,
          secondMealFinish: otherEditData.secondMealFinish || null,
          dismissOnSet: otherEditData.dismissOnSet || null,
          dismissMakeupWardrobe: otherEditData.dismissMakeupWardrobe || null,
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

  const handleSaveEdit = async (opts?: { silent?: boolean }) => {
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
            expectedAmount: RATES.stunt_coordinator.daily,
            calculation: null,
            recordStatus: "complete",
            notes: record?.notes || "",
          }),
        });

        if (!res.ok) throw new Error("Failed to update");
        const updated = await res.json();
        setRecord(updated);
        if (!opts?.silent) {
          setEditing(false);
          toast.success("Record updated!");
        }
        return;
      }

      // Build the input for recalculation
      const calcInput = {
        showName: editData.showName,
        workDate: editData.workDate,
        callTime: editData.callTime,
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
        // Without this the recalculation drops the flat deal, puts the day
        // back on scale and pays it overtime a flat deal never earns. The
        // flat rate is set on Log Work; here it survives the edit — unless
        // a commercial/flat-deal record was moved onto a schedule, where
        // the schedule takes over pricing.
        flatDayRate:
          isFlatAgreement(record?.workStatus) && !isFlatAgreement(editData.workStatus)
            ? null
            : record?.flatDayRate ?? null,
        // A weekly's day is approximated at the weekly scale over five
        // days — a scale day at that rate, shown everywhere with an
        // asterisk. Recalculating without it would price the day at the
        // daily scale, which is not the contract that was signed.
        dayRateOverride:
          editData.contractLength === "weekly"
            ? weeklyEquivalentDayRate(editData.workStatus, editData.workDate)
            : editData.contractLength === "three_day"
              ? Math.round(
                  (threeDayContractRate(
                    editData.workStatus,
                    editData.threeDayLength,
                    editData.workDate
                  ) /
                    3) *
                    100
                ) / 100
              : null,
        contractLength:
          editData.contractLength === "unset" ? null : editData.contractLength,
        threeDayLength:
          editData.contractLength === "three_day"
            ? editData.threeDayLength
            : null,
        weeklyContract: editData.contractLength === "weekly",
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
          // The engine works out one contract. Recalculating without adding
          // the others back would quietly drop a day's pay per contract.
          expectedAmount =
            calcData.breakdown.grandTotal +
            additionalContractPay(
              record?.contracts,
              editData.workStatus as RateSchedule | null,
              record?.multipleEpisodeWeekly ?? false,
              record?.flatDayRate,
              editData.workDate
            ).pay;
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
      if (!opts?.silent) {
        setEditing(false);
        toast.success("Record updated and recalculated!");
      }
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

  /** Turn a saved attachment and keep the turn. */
  const rotateDocument = async (index: number, rotation: number) => {
    if (!record) return;
    const documents = record.documents.map((doc, i) =>
      i === index ? { ...doc, rotation } : doc
    );
    setRecord({ ...record, documents });
    try {
      const res = await fetch(`/api/work-records/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Couldn't save the rotation");
    }
  };

  const handleUploadPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Read synchronously — React clears the input before the awaits run.
    const file = e.target.files?.[0];
    if (file) attachDocument(file, "other");
  };

  /** The stub photo lands with the payment it proves. */
  const handleUploadStub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) attachDocument(file, "paystub");
  };

  const attachDocument = async (
    original: File,
    documentType: WorkDocument["documentType"]
  ) => {
    // An iPhone HEIC becomes a JPEG here, so the preview can draw it.
    const file = await toUploadableImage(original);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadRes = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Upload failed");
      const { filename } = await uploadRes.json();

      // New uploads join the documents list, which is the structure that
      // knows how to preview and rotate; the old photos array is legacy
      // strings with nowhere to keep a rotation, shown read-only below.
      const res = await fetch(`/api/work-records/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: [
            ...(record?.documents || []),
            {
              filename,
              originalName: file.name,
              documentType,
              uploadedAt: new Date().toISOString(),
            },
          ],
        }),
      });

      if (!res.ok) throw new Error("Failed to update record");

      const updated = await res.json();
      setRecord(updated);
      toast.success("Attached!");
    } catch {
      toast.error("Failed to attach the file");
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
    // Every time field here belongs to the record's day; on any day but
    // today, TimeSelect uses this to refuse the clock the platform
    // stamps into an empty field on tap.
    <WorkDateContext.Provider value={editData.workDate || record.workDate || null}>
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Button variant="ghost" onClick={() => router.push("/tracker")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tracker
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
                    onClick={() => handleSaveEdit()}
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
            {/* Editing is where transcription happens, so the card opens
                with the fields rather than sitting on another screen. It
                scrolls with them: pinned to the top it sat over whatever
                was underneath, and a card covering the boxes you are
                filling in is worse than one you scroll back to. */}
            {editing &&
              (transcribeDoc ? (
                <div className="mb-4">
                  <ExhibitGViewer
                    src={`/api/uploads/${transcribeDoc.filename}`}
                    alt={transcribeDoc.originalName}
                    isPdf={/\.pdf$/i.test(transcribeDoc.filename)}
                    label={`${DOCUMENT_TYPE_LABELS[transcribeDoc.documentType]} — ${transcribeDoc.originalName}`}
                    height="42vh"
                    initialRotation={transcribeDoc.rotation ?? 0}
                    onRotate={(r) => rotateDocument(transcribeDoc.index, r)}
                  />
                  {linkedUpload && (
                    <Button asChild size="sm" className="mt-2">
                      <Link href={`/upload-g/${linkedUpload}`}>
                        Open the transcription view
                      </Link>
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Pinch or use the controls to get in close, and rotate if
                    it came in sideways. Fill the fields below from the card.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mb-4">
                  Nothing attached to transcribe from — add an Exhibit G under
                  Photos &amp; Documents and it will open here.
                </p>
              ))}

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
                      <DateField
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
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Work Times</p>
                    {(
                      [
                        ["Call Time", "callTime"],
                        ["1st Meal — out", "firstMealStart"],
                        ["1st Meal — in", "firstMealFinish"],
                        ["2nd Meal — out", "secondMealStart"],
                        ["2nd Meal — in", "secondMealFinish"],
                        ["Dismiss On Set", "dismissOnSet"],
                        ["Wrapped", "dismissMakeupWardrobe"],
                      ] as const
                    ).map(([label, key]) => (
                      <div key={key} className="flex items-center justify-between gap-4">
                        <Label
                          htmlFor={`other-${key}`}
                          className="text-sm text-muted-foreground shrink-0"
                        >
                          {label}
                        </Label>
                        <div className="flex-1 min-w-0 max-w-[13rem]">
                          <TimeSelect
                            id={`other-${key}`}
                            value={otherEditData[key]}
                            onChange={(v) =>
                              setOtherEditData((d) => ({ ...d, [key]: v }))
                            }
                            compact
                          />
                        </div>
                      </div>
                    ))}
                    <OtherWorkHours
                      times={otherEditData}
                      amount={otherEditData.expectedAmount}
                    />
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
                      {shortDay(record.workDate)}
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
                  {record.callTime && (
                    <div>
                      <p className="text-muted-foreground">Call</p>
                      <p className="font-semibold">
                        {toDisplay(record.callTime)}
                        {(record.dismissMakeupWardrobe || record.dismissOnSet) &&
                          ` → ${toDisplay(
                            record.dismissMakeupWardrobe || record.dismissOnSet || ""
                          )}`}
                      </p>
                    </div>
                  )}
                  <div className="col-span-2 md:col-span-3">
                    <OtherWorkHours times={record} amount={record.expectedAmount} />
                  </div>
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
                  <CollapsibleSection
                    title="Job Details"
                    defaultOpen
                    summary={
                      [
                        editData.showName,
                        editData.workDate,
                        editData.characterName,
                        editData.contractLength === "weekly"
                          ? weeklyAgreementLabel(editData.workStatus)
                          : agreementLabel(editData.workStatus),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Show title, date, character, agreement"
                    }
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1 min-w-0">
                        <Label htmlFor="edit-showName" className="text-base">Show Title</Label>
                        <ShowCombobox
                          id="edit-showName"
                          value={editData.showName}
                          onChange={(v) => setEditData(d => ({ ...d, showName: v }))}
                          options={knownShows}
                          className="text-lg h-12"
                        />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <Label htmlFor="edit-workDate" className="text-base">Work Date</Label>
                        <DateField
                          id="edit-workDate"
                          value={editData.workDate}
                          onChange={(e) => setEditData(d => ({ ...d, workDate: e.target.value }))}
                          className="text-lg h-12 w-full max-w-full"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {editData.workStatus !== "stunt_coordinator" && (
                        <div className="space-y-1 min-w-0">
                          <Label htmlFor="edit-characterName" className="text-base">Character Name</Label>
                          <SuggestInput
                            kind="character"
                            id="edit-characterName"
                            value={editData.characterName}
                            onChange={(v) => setEditData(d => ({ ...d, characterName: v }))}
                            placeholder="e.g., Stunt Double - Lead"
                            className="text-lg h-12"
                          />
                        </div>
                      )}
                      <div className="space-y-1 min-w-0">
                        <Label htmlFor="edit-contractLength" className="text-base">Contract Length</Label>
                        <Select
                          value={editData.contractLength}
                          onValueChange={(v) =>
                            setEditData((d) => ({
                              ...d,
                              contractLength: v as
                                | "unset"
                                | "daily"
                                | "three_day"
                                | "weekly",
                            }))
                          }
                        >
                          <SelectTrigger id="edit-contractLength" className="text-lg h-12 data-[size=default]:h-12 w-full min-w-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unset" className="text-base">Daily</SelectItem>
                            <SelectItem value="daily" className="text-base">Daily — keep out of weeklies</SelectItem>
                            <SelectItem value="three_day" className="text-base">3 Day (TV)</SelectItem>
                            <SelectItem value="weekly" className="text-base">Weekly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {editData.contractLength === "three_day" && (
                        <p className="text-xs text-muted-foreground -mt-1">
                          A television 3-day player. The day still logs
                          normally; the 3-day schedule rates are coming.
                        </p>
                      )}
                      <div className="space-y-1 min-w-0">
                        <Label htmlFor="edit-workStatus" className="text-base">Agreement Type</Label>
                        <Select
                          value={
                            editData.contractLength === "three_day"
                              ? `${editData.workStatus}|${editData.threeDayLength}`
                              : editData.workStatus
                          }
                          onValueChange={(v) =>
                            setEditData((d) => {
                              if (d.contractLength === "three_day") {
                                const [ws, len] = v.split("|");
                                return {
                                  ...d,
                                  workStatus: ws,
                                  threeDayLength: len === "long" ? "long" : "short",
                                };
                              }
                              return { ...d, workStatus: v };
                            })
                          }
                        >
                          <SelectTrigger id="edit-workStatus" className="text-lg h-12 data-[size=default]:h-12 w-full min-w-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {editData.contractLength === "three_day" ? (
                              THREE_DAY_OPTIONS.map((option) => (
                                <SelectItem
                                  key={`${option.workStatus}|${option.length}`}
                                  value={`${option.workStatus}|${option.length}`}
                                  className="text-base"
                                >
                                  {threeDayLabel(option, editData.workDate)}
                                </SelectItem>
                              ))
                            ) : (
                              <>
                                {AGREEMENTS.map((agreement) => (
                                  <SelectItem
                                    key={agreement.id}
                                    value={agreement.id}
                                    className="text-base"
                                  >
                                    {editData.contractLength === "weekly"
                                      ? weeklyAgreementLabel(agreement.id)
                                      : agreementLabel(agreement.id)}
                                  </SelectItem>
                                ))}
                                {FLAT_AGREEMENTS.map((agreement) => (
                                  <SelectItem
                                    key={agreement.id}
                                    value={agreement.id}
                                    className="text-base"
                                  >
                                    {agreement.id === "commercial"
                                      ? `Commercial — scale ${dayRate(commercialSessionFee(editData.workDate))}, type if over`
                                      : `${agreement.name} — the record's own rate`}
                                  </SelectItem>
                                ))}
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CollapsibleSection>

                  {/* The same rows in the same order as Log Work: call, the
                      meals in the middle, then the two ends of the day. The
                      engine reads the meals for penalties, so they belong
                      where they happened, not at the bottom. */}
                  {editData.workStatus !== "stunt_coordinator" && (
                    <>
                      <CollapsibleSection
                        title="Work Times"
                        defaultOpen
                        summary={
                          [toDisplay(editData.callTime), toDisplay(editData.dismissOnSet)]
                            .filter(Boolean)
                            .join(" → ") || "Call, meals and wrap"
                        }
                      >
                        <div className="space-y-0">
                          <div className="flex items-center justify-between gap-4 p-2 rounded bg-muted/50">
                            <Label htmlFor="edit-callTime" className="text-base shrink-0">Call Time</Label>
                            <div className="flex-1 min-w-0 max-w-[15rem]">
                              <TimeSelect
                                id="edit-callTime"
                                value={editData.callTime}
                                onChange={(v) =>
                                  setEditData((d) => ({
                                    ...d,
                                    callTime: v,
                                    ...reofferEditMeals(d, d.ndMealOut || v || null),
                                  }))
                                }
                              />
                            </div>
                          </div>
                          <GapLine
                            from={editData.callTime}
                            to={editData.firstMealStart}
                            label="from call to 1st meal"
                            warnAfterHours={6}
                          />
                          <div className="border-t border-b py-3 my-1 space-y-3">
                            {/* ND Meal */}
                            <div className="space-y-0">
                              <div className="flex items-center space-x-2 p-2">
                                <Checkbox
                                  id="edit-showNdMeal"
                                  checked={editMeals.nd}
                                  onCheckedChange={(v) => {
                                    setEditMeals(m => ({ ...m, nd: !!v }));
                                    if (!v) setEditData(d => ({ ...d, ndMealIn: null, ndMealOut: null }));
                                  }}
                                />
                                <Label htmlFor="edit-showNdMeal" className="text-base font-normal">ND (Non-Deductible) Meal</Label>
                              </div>
                              {editMeals.nd && (
                                <div className="grid grid-cols-2 gap-2 px-2 pb-2">
                                  <div>
                                    <Label htmlFor="edit-ndMealIn" className="text-sm text-muted-foreground">In</Label>
                                    <TimeSelect id="edit-ndMealIn" value={editData.ndMealIn || ""} onChange={(v) => setEditData(d => { const out = v ? followedTime(v, null, ND_MEAL_MINUTES) : null; return { ...d, ndMealIn: v || null, ndMealOut: out, ...reofferEditMeals(d, out || d.callTime || null) }; })} compact />
                                  </div>
                                  <div>
                                    <Label className="text-sm text-muted-foreground">Out</Label>
                                    <p className="flex h-10 items-center text-base tabular-nums">{editData.ndMealOut ? toDisplay(editData.ndMealOut) : "\u2014"}<span className="ml-2 text-xs text-muted-foreground">always 15 min</span></p>
                                  </div>
                                </div>
                              )}
                              {editMeals.nd && !editNdMeal.ok && (
                                <p className="px-2 pb-2 text-xs text-amber-400">
                                  {editNdMeal.problem === "ends_before_it_starts"
                                    ? "An ND meal has to end after it starts."
                                    : `An ND meal has to fall in the ${ND_MEAL_WINDOW_HOURS} hours after your call — from ${toDisplay(
                                        editData.callTime
                                      )} to ${toDisplay(
                                        editNdMeal.windowEnd
                                      )}. Outside that it is a deductible meal, which pays differently.`}
                                </p>
                              )}
                            </div>
                            {/* 1st Meal */}
                            <div className="space-y-0">
                              <div className="flex items-center space-x-2 p-2">
                                <Checkbox
                                  id="edit-showFirstMeal"
                                  checked={editMeals.first}
                                  onCheckedChange={(v) => {
                                    setEditMeals(m => ({ ...m, first: !!v, second: v ? m.second : false }));
                                    if (!v) {
                                      editFirstTouched.current = false;
                                      setEditData(d => ({ ...d, firstMealStart: null, firstMealFinish: null, secondMealStart: null, secondMealFinish: null }));
                                    } else {
                                      setEditData((d) => {
                                        const anchor = d.ndMealOut || d.callTime || null;
                                        if (!anchor || d.firstMealStart) return d;
                                        const start = followedTime(anchor, null, MEAL_PENALTIES.maxHoursBeforeFirstMeal * 60) ?? "";
                                        return {
                                          ...d,
                                          firstMealStart: start,
                                          firstMealFinish: followedTime(start, null, MEAL_MINUTES),
                                        };
                                      });
                                    }
                                  }}
                                />
                                <Label htmlFor="edit-showFirstMeal" className="text-base font-normal">1st Meal</Label>
                              </div>
                              {editMeals.first && (
                                <div className="grid grid-cols-2 gap-2 px-2 pb-2">
                                  <div>
                                    <Label htmlFor="edit-firstMealStart" className="text-sm text-muted-foreground">In</Label>
                                    <TimeSelect
                                      id="edit-firstMealStart"
                                      value={editData.firstMealStart || ""}
                                      onChange={(v) =>
                                        setEditData((d) => {
                                          editFirstTouched.current = true;
                                          // The Out follows the In: offered,
                                          // moved when crossed, kept when
                                          // later — and the 2nd meal follows
                                          // the 1st, six hours on by default.
                                          const finish = clampMealFinish(
                                            v,
                                            followedTime(
                                              v,
                                              d.firstMealFinish,
                                              MEAL_MINUTES
                                            )
                                          );
                                          const next = {
                                            ...d,
                                            firstMealStart: v || null,
                                            firstMealFinish: finish,
                                          };
                                          if (editMeals.second) {
                                            next.secondMealStart = editSecondTouched.current
                                              ? followedTime(
                                                  finish,
                                                  d.secondMealStart,
                                                  MEAL_PENALTIES.maxHoursBeforeSecondMeal * 60
                                                )
                                              : followedTime(finish, null, MEAL_PENALTIES.maxHoursBeforeSecondMeal * 60);
                                            next.secondMealFinish = followedTime(
                                              next.secondMealStart,
                                              d.secondMealFinish,
                                              MEAL_MINUTES
                                            );
                                          }
                                          return next;
                                        })
                                      }
                                      compact
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="edit-firstMealFinish" className="text-sm text-muted-foreground">Out</Label>
                                    <TimeSelect id="edit-firstMealFinish" value={editData.firstMealFinish || ""} onChange={(v) => setEditData((d) => { const next = { ...d, firstMealFinish: clampMealFinish(d.firstMealStart, v || null) }; if (editMeals.second) { next.secondMealStart = editSecondTouched.current ? followedTime(next.firstMealFinish, d.secondMealStart, MEAL_PENALTIES.maxHoursBeforeSecondMeal * 60) : followedTime(next.firstMealFinish, null, MEAL_PENALTIES.maxHoursBeforeSecondMeal * 60); next.secondMealFinish = followedTime(next.secondMealStart, d.secondMealFinish, MEAL_MINUTES); } return next; })} compact />
                                  </div>
                                </div>
                              )}
                              {editMeals.first &&
                                mealLengthWarning(editData.firstMealStart, editData.firstMealFinish) && (
                                  <p className="px-2 pb-2 text-xs text-amber-400">
                                    {mealLengthWarning(editData.firstMealStart, editData.firstMealFinish)}
                                  </p>
                                )}
                            </div>
                            {/* 2nd Meal — only visible when 1st Meal is on */}
                            {editMeals.first && (
                              <div className="space-y-0">
                                <GapLine
                                  from={editData.firstMealFinish}
                                  to={editData.secondMealStart}
                                  label="from 1st meal to 2nd"
                                  warnAfterHours={6}
                                />
                                <div className="flex items-center space-x-2 p-2">
                                  <Checkbox
                                    id="edit-showSecondMeal"
                                    checked={editMeals.second}
                                    onCheckedChange={(v) => {
                                      setEditMeals(m => ({ ...m, second: !!v }));
                                      if (!v) {
                                        editSecondTouched.current = false;
                                        setEditData(d => ({ ...d, secondMealStart: null, secondMealFinish: null }));
                                      } else {
                                        setEditData((d) => {
                                          const start = followedTime(d.firstMealFinish, d.secondMealStart, MEAL_PENALTIES.maxHoursBeforeSecondMeal * 60);
                                          return {
                                            ...d,
                                            secondMealStart: start,
                                            secondMealFinish: followedTime(start, d.secondMealFinish, MEAL_MINUTES),
                                          };
                                        });
                                      }
                                    }}
                                  />
                                  <Label htmlFor="edit-showSecondMeal" className="text-base font-normal">2nd Meal</Label>
                                </div>
                                {editMeals.second && (
                                  <div className="grid grid-cols-2 gap-2 px-2 pb-2">
                                    <div>
                                      <Label htmlFor="edit-secondMealStart" className="text-sm text-muted-foreground">In</Label>
                                      <TimeSelect
                                        id="edit-secondMealStart"
                                        value={editData.secondMealStart || ""}
                                        onChange={(v) => {
                                          editSecondTouched.current = true;
                                          setEditData((d) => ({
                                            ...d,
                                            secondMealStart: v || null,
                                            secondMealFinish: clampMealFinish(
                                              v,
                                              followedTime(
                                                v,
                                                d.secondMealFinish,
                                                MEAL_MINUTES
                                              )
                                            ),
                                          }));
                                        }}
                                        compact
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor="edit-secondMealFinish" className="text-sm text-muted-foreground">Out</Label>
                                      <TimeSelect id="edit-secondMealFinish" value={editData.secondMealFinish || ""} onChange={(v) => setEditData(d => ({ ...d, secondMealFinish: clampMealFinish(d.secondMealStart, v || null) }))} compact />
                                    </div>
                                  </div>
                                )}
                                {editMeals.second &&
                                  secondMealOrderWarning(editData.firstMealFinish, editData.secondMealStart) && (
                                    <p className="px-2 pb-2 text-xs text-amber-400">
                                      {secondMealOrderWarning(editData.firstMealFinish, editData.secondMealStart)}
                                    </p>
                                  )}
                                {editMeals.second &&
                                  mealLengthWarning(editData.secondMealStart, editData.secondMealFinish) && (
                                    <p className="px-2 pb-2 text-xs text-amber-400">
                                      {mealLengthWarning(editData.secondMealStart, editData.secondMealFinish)}
                                    </p>
                                  )}
                              </div>
                            )}
                          </div>
                          <GapLine
                            from={
                              editData.secondMealFinish ||
                              editData.firstMealFinish ||
                              editData.callTime
                            }
                            to={editData.dismissOnSet}
                            label={
                              editData.secondMealFinish || editData.firstMealFinish
                                ? "from the last meal to dismissal"
                                : "from call to dismissal"
                            }
                            warnAfterHours={6}
                          />
                          <div className="flex items-center justify-between gap-4 p-2">
                            <Label htmlFor="edit-dismissOnSet" className="text-base shrink-0">Dismiss On Set</Label>
                            <div className="flex-1 min-w-0 max-w-[15rem]">
                              <TimeSelect
                                id="edit-dismissOnSet"
                                value={editData.dismissOnSet}
                                onChange={(v) =>
                                  setEditData((d) => ({
                                    ...d,
                                    dismissOnSet: v,
                                    // The +15 offer only fills an EMPTY wrap
                                    // — a time already set never moves.
                                    dismissMakeupWardrobe: offerAfterIfEmpty(
                                      v,
                                      d.dismissMakeupWardrobe,
                                      WRAP_MINUTES
                                    ),
                                  }))
                                }
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-4 p-2 rounded bg-muted/50">
                            <Label htmlFor="edit-dismissMakeupWardrobe" className="text-base shrink-0">Wrapped</Label>
                            <div className="flex-1 min-w-0 max-w-[15rem]">
                              <TimeSelect
                                id="edit-dismissMakeupWardrobe"
                                value={editData.dismissMakeupWardrobe || ""}
                                onChange={(v) =>
                                  setEditData((d) => ({
                                    ...d,
                                    dismissMakeupWardrobe: v || null,
                                    // Whichever end is set first offers the
                                    // other — and only fills it when empty.
                                    dismissOnSet: v
                                      ? offerBeforeIfEmpty(v, d.dismissOnSet, WRAP_MINUTES) ?? d.dismissOnSet
                                      : d.dismissOnSet,
                                  }))
                                }
                              />
                            </div>
                          </div>
                          {wrapOrderWarning(editData.dismissOnSet, editData.dismissMakeupWardrobe) && (
                            <p className="px-2 pb-1 text-xs text-amber-400">
                              {wrapOrderWarning(editData.dismissOnSet, editData.dismissMakeupWardrobe)}
                            </p>
                          )}
                          <div className="border-t pt-3 mt-3">
                            <div className="flex items-center justify-between gap-4 p-2">
                              <Label htmlFor="edit-stuntAdjustment" className="text-base shrink-0">Stunt Adjustment</Label>
                              <div className="relative flex-1 min-w-0 max-w-[15rem]">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">$</span>
                                <Input
                                  id="edit-stuntAdjustment"
                                  type="number"
                                  min="0"
                                  step="50"
                                  value={editData.stuntAdjustment || ""}
                                  onChange={(e) => setEditData(d => ({ ...d, stuntAdjustment: parseFloat(e.target.value) || 0 }))}
                                  className="pl-7 w-full h-12 text-lg"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground px-2">Meal penalties calculated from times above</p>
                          </div>
                        </div>
                      </CollapsibleSection>

                      <Separator />

                      {/* Penalties — same block as Log Work, and a day can
                          only be one of 6th, 7th or a holiday. */}
                      <div>
                        <h3 className="font-semibold mb-3">Penalties</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="edit-forcedCall"
                              checked={editData.forcedCall}
                              onCheckedChange={(v) => setEditData(d => ({ ...d, forcedCall: !!v }))}
                            />
                            <Label htmlFor="edit-forcedCall" className="text-base font-normal">Forced Call</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="edit-isSixthDay"
                              checked={editData.isSixthDay}
                              onCheckedChange={(v) => setEditData(d => ({ ...d, isSixthDay: !!v, isSeventhDay: v ? false : d.isSeventhDay, isHoliday: v ? false : d.isHoliday }))}
                            />
                            <Label htmlFor="edit-isSixthDay" className="text-base font-normal">6th Consecutive Day</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="edit-isSeventhDay"
                              checked={editData.isSeventhDay}
                              onCheckedChange={(v) => setEditData(d => ({ ...d, isSeventhDay: !!v, isSixthDay: v ? false : d.isSixthDay, isHoliday: v ? false : d.isHoliday }))}
                            />
                            <Label htmlFor="edit-isSeventhDay" className="text-base font-normal">7th Consecutive Day</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="edit-isHoliday"
                              checked={editData.isHoliday}
                              onCheckedChange={(v) => setEditData(d => ({ ...d, isHoliday: !!v, isSixthDay: v ? false : d.isSixthDay, isSeventhDay: v ? false : d.isSeventhDay }))}
                            />
                            <Label htmlFor="edit-isHoliday" className="text-base font-normal">Holiday</Label>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <Button
                    className="w-full"
                    onClick={() => handleSaveEdit()}
                    disabled={savingEdit}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {savingEdit ? "Saving…" : "Save Changes"}
                  </Button>
                  <p className="text-xs text-muted-foreground -mt-2 text-center">
                    Changes also save themselves a moment after you stop
                    editing.
                  </p>
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
                      {shortDay(record.workDate)}
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
                        {record.flatDayRate
                          ? `${record.workStatus === "commercial" ? "Commercial" : "Flat"} ${dayRate(record.flatDayRate)}`
                          : record.contractLength === "three_day"
                            ? THREE_DAY_OPTIONS.filter(
                                (o) =>
                                  o.workStatus === record.workStatus &&
                                  o.length ===
                                    (record.threeDayLength === "long"
                                      ? "long"
                                      : "short")
                              ).map((o) => threeDayLabel(o, record.workDate))[0] ??
                              agreementLabel(record.workStatus || "")
                            : record.weeklyContract
                              ? weeklyAgreementLabel(record.workStatus || "")
                              : agreementLabel(record.workStatus || "")}
                      </p>
                      {record.contractLength === "daily" && (
                        <p className="text-xs text-muted-foreground">
                          Set Daily — kept out of weeklies
                        </p>
                      )}
                    </div>
                  )}
                  {isStuntCoordinator && (
                    <div>
                      <p className="text-muted-foreground">Flat Rate</p>
                      <p className="font-semibold">{formatCurrency(record.expectedAmount || RATES.stunt_coordinator.daily)}</p>
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
          <RateBreakdown
            breakdown={record.calculation}
            compact
            approximation={
              record.flatDayRate
                ? null
                : record.contractLength === "three_day"
                  ? "three_day"
                  : record.weeklyContract
                    ? "weekly"
                    : null
            }
          />
        )}

        <Separator />

        {/* Payment — what the day should pay, what it did pay, the stub
            that proves it, and the line-by-line comparison, in one place. */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Payment</CardTitle>
              <Button asChild variant="outline" size="sm">
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  Attach stub
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleUploadStub}
                  />
                </label>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {record.weeklyContract ? (
              /* A weekly is paid as one check for the whole week — asking
                 for a per-day expected and paid here invites entering the
                 week's money against a single day. The week's payment is
                 tracked on its weekly group. */
              <p className="text-sm text-muted-foreground">
                This day is part of a weekly contract, and the week is paid
                in one check. Track that payment on the weekly in your{" "}
                <Link href="/tracker" className="underline underline-offset-2">
                  Tracker
                </Link>{" "}
                or on the{" "}
                <Link href="/weekly" className="underline underline-offset-2">
                  Weekly page
                </Link>
                .
              </p>
            ) : (
              <>
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
              </>
            )}

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

            {/* The stubs attached to this day, kept beside the payment
                they prove. They also appear in Photos & Documents, which
                stays the full inventory. */}
            {(record.documents ?? []).some((d) => d.documentType === "paystub") && (
              <div className="space-y-2 pt-2">
                <p className="text-sm font-semibold">Attached stubs</p>
                <div className="grid grid-cols-2 gap-3">
                  {(record.documents ?? []).map((doc, i) =>
                    doc.documentType === "paystub" ? (
                      /\.pdf$/i.test(doc.filename) ? (
                        <a
                          key={`${doc.filename}-${i}`}
                          href={`/api/uploads/${doc.filename}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline self-center"
                        >
                          {doc.originalName}
                        </a>
                      ) : (
                        <RotatableThumb
                          key={`${doc.filename}-${i}`}
                          src={`/api/uploads/${doc.filename}`}
                          alt={doc.originalName}
                          rotation={doc.rotation ?? 0}
                          onRotate={(r) => rotateDocument(i, r)}
                          className="w-full"
                        />
                      )
                    ) : null
                  )}
                </div>
              </div>
            )}

            {/* The day's working as a handable document: performer, show,
                the G's times and the breakdown of the expected check. */}
            {record.calculation && (
              <div className="pt-2">
                <a
                  href={`/api/work-records/${record._id}/expected-pay`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                >
                  <FileDown className="h-4 w-4" />
                  Expected pay (PDF)
                </a>
              </div>
            )}

            {/* The stub for this day, line by line. A weekly contract's
                stub covers the week, so it lives on /weekly instead. */}
            {!isOtherWorkType &&
              !record.multipleEpisodeWeekly &&
              !record.weeklyContract && (
                <div className="pt-2 border-t border-border/50">
                  <p className="font-semibold mt-2">Pay stub</p>
                  <p className="text-sm text-muted-foreground mb-3">
                    What the stub says, line by line, against what we make it.
                  </p>
                  <PayStubSection
                    scope="day"
                    workRecordId={record._id}
                    showName={record.showName || "this production"}
                    owed={record.expectedAmount || 0}
                    performerName={
                      user
                        ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
                          user.email
                        : "This performer"
                    }
                    period={`the work day of ${formatDateSafe(record.workDate)}`}
                    owedLines={owedLines}
                  />
                </div>
              )}
          </CardContent>
        </Card>

        {/* Photos & Documents — one place for everything attached.
            The type of thing is the headline (an Exhibit G matters more
            than what the camera named the file); the filename rides
            underneath in small print. */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Photos &amp; Documents</CardTitle>
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
            <div className="space-y-4">
              {(record.documents ?? []).map((doc, i) => {
                const ext = doc.filename.split(".").pop()?.toLowerCase() || "";
                const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
                const isPdf = ext === "pdf";

                return (
                  <div key={`${doc.filename}-${i}`} className="rounded-lg border overflow-hidden">
                    <div className="p-2 bg-muted/30 min-w-0">
                      <p className="text-sm font-semibold">
                        {DOCUMENT_TYPE_LABELS[doc.documentType] ?? "Other"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {doc.originalName}
                      </p>
                    </div>
                    {isImage && (
                      <div className="p-2">
                        <RotatableThumb
                          src={`/api/uploads/${doc.filename}`}
                          alt={doc.originalName}
                          rotation={doc.rotation ?? 0}
                          onRotate={(r) => rotateDocument(i, r)}
                          className="w-full max-w-md mx-auto"
                        />
                      </div>
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
              {record.photos && record.photos.length > 0 && (
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
              )}
              {(record.documents ?? []).length === 0 &&
                (record.photos ?? []).length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    Nothing attached yet
                  </p>
                )}
            </div>
          </CardContent>
        </Card>
      </div>{/* end contentRef */}

      {/* Deleting sits past everything else and names what it removes, so
          it takes a deliberate scroll rather than a mis-tap next to Back. */}
      <div className="pt-6 mt-2 border-t border-border/50">
        <p className="text-sm font-medium">Delete this work day</p>
        <p className="text-xs text-muted-foreground mt-1 mb-3">
          Removes the record and everything attached to it. This cannot be
          undone.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          onClick={handleDelete}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete work day
        </Button>
      </div>
    </div>
    </WorkDateContext.Provider>
  );
}

/**
 * Hours from the times, and what a flat fee came to per hour of them.
 *
 * Non-SAG work is not on the Basic Agreement, so nothing here goes near the
 * rate engine — a commercial calculated at scale would state a figure the
 * performer is not owed. The hours are still theirs to know, and against a
 * day rate they are the number that says whether it was worth taking.
 */
function OtherWorkHours({
  times,
  amount,
}: {
  times: Parameters<typeof workHoursFor>[0];
  amount: number | null | undefined;
}) {
  const hours = workHoursFor(times);
  if (!hours) return null;
  const perHour = effectiveHourlyRate(amount, hours.netHours);

  return (
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
  );
}
