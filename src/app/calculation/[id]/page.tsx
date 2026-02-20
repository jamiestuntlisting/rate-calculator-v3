"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RateBreakdown } from "@/components/calculation/rate-breakdown";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CalculateResponse } from "@/types";
import { ArrowLeft, Save, Upload, Calendar, Mail } from "lucide-react";

export default function CalculationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<CalculateResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [accountingEmail, setAccountingEmail] = useState("");

  const id = params.id as string;

  useEffect(() => {
    // Try sessionStorage first (unsaved calculation)
    const cached = sessionStorage.getItem(`calc-${id}`);
    if (cached) {
      setData(JSON.parse(cached));
      return;
    }

    // Try fetching from DB (saved record)
    fetch(`/api/work-records/${id}`)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Not found");
      })
      .then((record) => {
        setData({
          calculationId: record._id,
          input: record,
          breakdown: record.calculation,
        });
        setSavedId(record._id);
      })
      .catch(() => {
        toast.error("Calculation not found");
        router.push("/");
      });
  }, [id, router]);

  const handleSave = async () => {
    if (!data) return;

    setSaving(true);
    try {
      const res = await fetch("/api/work-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data.input,
          calculation: data.breakdown,
          expectedAmount: data.breakdown.grandTotal,
          documents: data.documents || [],
          recordStatus: "complete",
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      const saved = await res.json();
      setSavedId(saved._id);
      toast.success("Work record saved!");
    } catch {
      toast.error("Failed to save work record");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!savedId || !e.target.files?.[0]) return;

    const formData = new FormData();
    formData.append("file", e.target.files[0]);

    try {
      const uploadRes = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Upload failed");

      const { path } = await uploadRes.json();

      // Update work record with photo
      await fetch(`/api/work-records/${savedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          $push: { photos: path },
        }),
      });

      toast.success("Photo uploaded!");
    } catch {
      toast.error("Failed to upload photo");
    }
  };

  const handleEmailAccounting = () => {
    if (!data) return;
    const subject = encodeURIComponent(
      `Pay Inquiry - ${data.input.showName} - ${data.input.workDate}`
    );
    const body = encodeURIComponent(
      `Hello,\n\nI am following up on payment for:\n\nShow: ${data.input.showName}\nWork Date: ${data.input.workDate}\nCharacter: ${data.input.characterName}\n\nCalculated Rate: $${data.breakdown.grandTotal.toFixed(2)}\n\nPlease let me know the status of this payment.\n\nThank you.`
    );
    const email = accountingEmail || "accounting@production.com";
    window.open(`mailto:${email}?subject=${subject}&body=${body}`);
  };

  const handleAddToCalendar = () => {
    if (!data) return;
    // Generate ICS file
    const dateStr = data.input.workDate.replace(/-/g, "");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `DTSTART:${dateStr}`,
      `DTEND:${dateStr}`,
      `SUMMARY:${data.input.showName} - Stunt Work`,
      `DESCRIPTION:Calculated Rate: $${data.breakdown.grandTotal.toFixed(2)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");

    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.input.showName}-${data.input.workDate}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading calculation...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Calculator
        </Button>
        {savedId && (
          <Badge variant="outline" className="text-green-600">
            Saved
          </Badge>
        )}
      </div>

      <RateBreakdown breakdown={data.breakdown} input={data.input} />

      {/* Attached Documents */}
      {data.documents && data.documents.length > 0 && (
        <div className="bg-muted/30 rounded-lg p-4">
          <p className="text-sm font-medium mb-2">
            {data.documents.length} document{data.documents.length !== 1 ? "s" : ""} attached
          </p>
          <div className="space-y-1">
            {data.documents.map((doc, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                {doc.originalName} ({doc.documentType.replace(/_/g, " ")})
              </p>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Action Buttons */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Actions</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Save */}
          {!savedId && (
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Work Record"}
            </Button>
          )}

          {/* Upload Photo */}
          <div>
            <Button
              asChild
              variant="outline"
              className="w-full"
              disabled={!savedId}
            >
              <label className="cursor-pointer">
                <Upload className="mr-2 h-4 w-4" />
                Upload Photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadPhoto}
                  disabled={!savedId}
                />
              </label>
            </Button>
            {!savedId && (
              <p className="text-xs text-muted-foreground mt-1">
                Save the record first to upload photos
              </p>
            )}
          </div>

          {/* Calendar */}
          <Button
            variant="outline"
            onClick={handleAddToCalendar}
            className="w-full"
          >
            <Calendar className="mr-2 h-4 w-4" />
            Add to Calendar
          </Button>

          {/* Email */}
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="accountingEmail" className="text-sm">
                Accounting Email
              </Label>
              <Input
                id="accountingEmail"
                type="email"
                value={accountingEmail}
                onChange={(e) => setAccountingEmail(e.target.value)}
                placeholder="accounting@production.com"
              />
            </div>
            <Button
              variant="outline"
              onClick={handleEmailAccounting}
              className="w-full"
            >
              <Mail className="mr-2 h-4 w-4" />
              Email Accounting
            </Button>
          </div>
        </div>

        {/* Edit / Recalculate */}
        <div className="pt-2">
          <Button
            variant="secondary"
            onClick={() => {
              // Store input data for prefill
              sessionStorage.setItem(
                "prefill-input",
                JSON.stringify(data.input)
              );
              router.push("/?edit=true");
            }}
            className="w-full"
          >
            Edit & Recalculate
          </Button>
        </div>
      </div>
    </div>
  );
}
