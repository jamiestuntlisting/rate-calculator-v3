"use client";

import { useEffect, useState, useMemo } from "react";
import { formatCurrency } from "@/lib/time-utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { WorkRecord } from "@/types";

/** Same rule the record page applies when a payment is typed in. */
function derivePaymentStatus(amount: number, expected: number | undefined): string {
  if (amount <= 0) return "unpaid";
  if (!expected || expected <= 0) return "paid_correctly";
  if (amount >= expected) {
    return amount > expected ? "overpaid" : "paid_correctly";
  }
  return "underpaid";
}

const iso = (d: Date) => d.toISOString().split("T")[0];

/** The one-word verdict a day wears: what happened against what we make it. */
const VERDICTS: Record<string, { label: string; tone: string }> = {
  paid_correctly: {
    label: "Right",
    tone: "bg-green-900/40 text-green-300 border-green-700/50",
  },
  underpaid: {
    label: "Under",
    tone: "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
  },
  overpaid: {
    label: "Over",
    tone: "bg-blue-900/40 text-blue-300 border-blue-700/50",
  },
  unpaid: {
    label: "Unpaid",
    tone: "bg-red-900/40 text-red-300 border-red-700/50",
  },
  late: {
    label: "Late",
    tone: "bg-purple-900/40 text-purple-300 border-purple-700/50",
  },
};

export default function AnalyticsPage() {
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  /** Per-day paid entries being edited, keyed by record id. */
  const [paidEdits, setPaidEdits] = useState<Record<string, string>>({});
  /** Per-show paycheck amounts waiting to be applied. */
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [busyShow, setBusyShow] = useState<string | null>(null);

  /** Write one day's payment and mirror it locally. */
  const savePaid = async (record: WorkRecord, amount: number) => {
    const paymentStatus = derivePaymentStatus(amount, record.expectedAmount);
    const res = await fetch(`/api/work-records/${record._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paidAmount: amount,
        paymentStatus,
        paidDate: amount > 0 ? iso(new Date()) : null,
      }),
    });
    if (!res.ok) throw new Error();
    setRecords((prev) =>
      prev.map((r) =>
        r._id === record._id
          ? { ...r, paidAmount: amount, paymentStatus: paymentStatus as WorkRecord["paymentStatus"] }
          : r
      )
    );
  };

  const saveDayEdit = async (record: WorkRecord) => {
    const raw = paidEdits[record._id];
    if (raw === undefined) return;
    const amount = parseFloat(raw) || 0;
    if (amount === record.paidAmount) return;
    try {
      await savePaid(record, amount);
      toast.success("Payment saved");
    } catch {
      toast.error("Couldn't save that payment");
    }
  };

  /**
   * A paycheck rarely names its days, so it is applied the way payroll
   * applies it: oldest day first, filling what each is owed, spilling to
   * the next. A check bigger than what the show is owed leaves the excess
   * on the last day, which reads as overpaid rather than vanishing.
   */
  const applyCheck = async (
    show: string,
    showRecords: WorkRecord[]
  ) => {
    const amount = parseFloat(checks[show] ?? "") || 0;
    if (amount <= 0) {
      toast.error("Enter the paycheck amount first");
      return;
    }
    setBusyShow(show);
    try {
      let remaining = amount;
      let touched = 0;
      const withDue = showRecords.filter(
        (r) => (r.expectedAmount || 0) - r.paidAmount > 0
      );
      for (let i = 0; i < withDue.length && remaining > 0; i++) {
        const record = withDue[i];
        const due = (record.expectedAmount || 0) - record.paidAmount;
        const last = i === withDue.length - 1;
        // The last short day absorbs any excess instead of losing it.
        const add = last ? remaining : Math.min(due, remaining);
        await savePaid(record, Math.round((record.paidAmount + add) * 100) / 100);
        remaining = Math.round((remaining - add) * 100) / 100;
        touched += 1;
      }
      if (touched === 0) {
        toast.error("Nothing owed on this show — edit a day directly instead");
      } else {
        setChecks((prev) => ({ ...prev, [show]: "" }));
        toast.success(
          `Applied ${formatCurrency(amount)} across ${touched} day${touched === 1 ? "" : "s"}`
        );
      }
    } catch {
      toast.error("Couldn't apply the whole paycheck — check the days");
    } finally {
      setBusyShow(null);
    }
  };

  useEffect(() => {
    fetch("/api/work-records?limit=1000")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setRecords(data.records || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    if (records.length === 0) return null;

    const totalExpected = records.reduce((s, r) => s + (r.expectedAmount || 0), 0);
    const totalPaid = records.reduce((s, r) => s + r.paidAmount, 0);
    const totalOwed = totalExpected - totalPaid;
    const totalDays = records.length;

    const lateCount = records.filter((r) => r.paymentStatus === "late").length;
    const unpaidCount = records.filter((r) => r.paymentStatus === "unpaid").length;
    const paidCount = records.filter(
      (r) => r.paymentStatus === "paid_correctly" || r.paymentStatus === "overpaid"
    ).length;
    const underpaidCount = records.filter((r) => r.paymentStatus === "underpaid").length;
    const missingGCount = records.filter((r) => r.missingExhibitG).length;

    // By show — with the days themselves, oldest first, because this is
    // where payments get resolved and a paycheck lands on actual days.
    const showMap = new Map<
      string,
      { days: number; expected: number; paid: number; records: WorkRecord[] }
    >();
    for (const r of records) {
      const name = r.showName || "Unknown";
      const existing =
        showMap.get(name) || { days: 0, expected: 0, paid: 0, records: [] };
      existing.days += 1;
      existing.expected += r.expectedAmount || 0;
      existing.paid += r.paidAmount;
      existing.records.push(r);
      showMap.set(name, existing);
    }
    const byShow = [...showMap.entries()]
      .map(([name, data]) => ({
        name,
        ...data,
        records: [...data.records].sort((a, b) =>
          a.workDate.localeCompare(b.workDate)
        ),
      }))
      .sort((a, b) => b.expected - a.expected);

    // By month — parse from ISO string to avoid timezone shifts
    const monthMap = new Map<string, { days: number; expected: number; paid: number }>();
    for (const r of records) {
      const ymd = r.workDate.split("T")[0];
      const key = ymd.substring(0, 7); // "YYYY-MM"
      const existing = monthMap.get(key) || { days: 0, expected: 0, paid: 0 };
      existing.days += 1;
      existing.expected += r.expectedAmount || 0;
      existing.paid += r.paidAmount;
      monthMap.set(key, existing);
    }
    const byMonth = [...monthMap.entries()]
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => b.month.localeCompare(a.month));

    // By agreement type
    const agreementMap = new Map<string, { days: number; expected: number }>();
    const otherCatLabels: Record<string, string> = {
      commercial: "Commercial",
      music_video: "Music Video",
      low_budget: "Low Budget",
      other: "Other Work",
    };
    for (const r of records) {
      const type = r.workType === "other"
        ? (otherCatLabels[r.otherWorkCategory || "other"] || "Other Work")
        : r.workStatus === "stunt_coordinator" ? "Stunt Coordinator"
        : r.workStatus === "television" ? "Television" : "Theatrical Basic";
      const existing = agreementMap.get(type) || { days: 0, expected: 0 };
      existing.days += 1;
      existing.expected += r.expectedAmount || 0;
      agreementMap.set(type, existing);
    }
    const byAgreement = [...agreementMap.entries()]
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.expected - a.expected);

    // Average daily rate (SAG-AFTRA only)
    const sagRecords = records.filter(
      (r) => r.workType !== "other" && r.expectedAmount && r.expectedAmount > 0
    );
    const avgDailyRate = sagRecords.length > 0
      ? sagRecords.reduce((s, r) => s + (r.expectedAmount || 0), 0) / sagRecords.length
      : 0;

    return {
      totalExpected,
      totalPaid,
      totalOwed,
      totalDays,
      lateCount,
      unpaidCount,
      paidCount,
      underpaidCount,
      missingGCount,
      byShow,
      byMonth,
      byAgreement,
      avgDailyRate,
    };
  }, [records]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  if (!stats || records.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Summary</h1>
        <p className="text-muted-foreground">No work records yet. Start recording work days to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Summary</h1>

      {/* Top-level stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Work Days</p>
            <p className="text-2xl font-bold">{stats.totalDays}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Expected</p>
            <p className="text-2xl font-bold">{formatCurrency(stats.totalExpected)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Paid</p>
            <p className="text-2xl font-bold text-green-400">{formatCurrency(stats.totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Outstanding</p>
            <p className={`text-2xl font-bold ${stats.totalOwed > 0 ? "text-red-400" : ""}`}>
              {formatCurrency(stats.totalOwed)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payment status overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Paid</p>
            <p className="text-xl font-bold text-green-400">{stats.paidCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Unpaid</p>
            <p className="text-xl font-bold text-red-400">{stats.unpaidCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Late</p>
            <p className="text-xl font-bold text-purple-400">{stats.lateCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Underpaid</p>
            <p className="text-xl font-bold text-yellow-400">{stats.underpaidCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Missing G</p>
            <p className="text-xl font-bold text-red-400">{stats.missingGCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Average daily rate */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">Average Daily Rate (SAG-AFTRA)</p>
          <p className="text-2xl font-bold">{formatCurrency(stats.avgDailyRate)}</p>
        </CardContent>
      </Card>

      {/* Earnings by Show */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Earnings by Show</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.byShow.length === 0 ? (
            <p className="text-muted-foreground text-sm">No data</p>
          ) : (
            <div className="space-y-1">
              {/* One row per day: show, date, what we calculated, what they
                  were paid (typed straight in), and the verdict — the same
                  ledger shape as a pay stub, nothing to open. */}
              {stats.byShow.map((show) => (
                <div key={show.name} className="pb-2">
                  {show.records.map((record) => {
                    const ymd = record.workDate.split("T")[0];
                    const edit = paidEdits[record._id];
                    return (
                      <div
                        key={record._id}
                        className="flex items-center gap-2 py-1.5 border-b border-border/30"
                      >
                        <Link
                          href={`/work/${record._id}`}
                          className="flex-1 min-w-0"
                        >
                          <span className="block text-sm font-medium truncate">
                            {show.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {ymd}
                          </span>
                        </Link>
                        <span className="text-sm tabular-nums shrink-0 w-20 text-right">
                          {formatCurrency(record.expectedAmount || 0)}
                        </span>
                        <div className="relative w-24 shrink-0">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                            $
                          </span>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            value={edit ?? (record.paidAmount || "")}
                            onChange={(e) =>
                              setPaidEdits((prev) => ({
                                ...prev,
                                [record._id]: e.target.value,
                              }))
                            }
                            onBlur={() => saveDayEdit(record)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                            placeholder="0.00"
                            className="pl-6 h-9 text-sm"
                          />
                        </div>
                        <span
                          className={`shrink-0 w-14 text-center rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${
                            VERDICTS[record.paymentStatus]?.tone ??
                            VERDICTS.unpaid.tone
                          }`}
                        >
                          {VERDICTS[record.paymentStatus]?.label ?? "Unpaid"}
                        </span>
                      </div>
                    );
                  })}

                  <div className="flex items-center gap-2 py-1.5">
                    <span className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
                      Add a paycheck for {show.name} — fills the oldest unpaid
                      day first
                    </span>
                    <div className="relative w-24 shrink-0">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        $
                      </span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        value={checks[show.name] ?? ""}
                        onChange={(e) =>
                          setChecks((prev) => ({
                            ...prev,
                            [show.name]: e.target.value,
                          }))
                        }
                        placeholder="0.00"
                        className="pl-6 h-9 text-sm"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-14 px-0"
                      disabled={busyShow === show.name}
                      onClick={() => applyCheck(show.name, show.records)}
                    >
                      {busyShow === show.name ? "…" : "Apply"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Earnings by Month */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Earnings by Month</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.byMonth.length === 0 ? (
            <p className="text-muted-foreground text-sm">No data</p>
          ) : (
            <div className="space-y-3">
              {stats.byMonth.map((m) => {
                const [year, month] = m.month.split("-");
                const label = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                });
                return (
                  <div key={m.month} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{label}</p>
                      <p className="text-sm text-muted-foreground">{m.days} day{m.days !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(m.expected)}</p>
                      {m.paid > 0 && (
                        <p className="text-xs text-green-400">{formatCurrency(m.paid)} paid</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* By Agreement Type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">By Agreement Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stats.byAgreement.map((a) => (
              <div key={a.type} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{a.type}</Badge>
                  <span className="text-sm text-muted-foreground">{a.days} day{a.days !== 1 ? "s" : ""}</span>
                </div>
                <p className="font-semibold">{formatCurrency(a.expected)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
