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
import type { WorkRecord } from "@/types";

export default function AnalyticsPage() {
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [loading, setLoading] = useState(true);

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

    // By show
    const showMap = new Map<string, { days: number; expected: number; paid: number }>();
    for (const r of records) {
      const name = r.showName || "Unknown";
      const existing = showMap.get(name) || { days: 0, expected: 0, paid: 0 };
      existing.days += 1;
      existing.expected += r.expectedAmount || 0;
      existing.paid += r.paidAmount;
      showMap.set(name, existing);
    }
    const byShow = [...showMap.entries()]
      .map(([name, data]) => ({ name, ...data }))
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
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">No work records yet. Start recording work days to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

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
            <div className="space-y-3">
              {stats.byShow.map((show) => (
                <div key={show.name} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{show.name}</p>
                    <p className="text-sm text-muted-foreground">{show.days} day{show.days !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(show.expected)}</p>
                    {show.paid > 0 && show.paid < show.expected && (
                      <p className="text-xs text-yellow-400">
                        {formatCurrency(show.expected - show.paid)} owed
                      </p>
                    )}
                    {show.paid === 0 && show.expected > 0 && (
                      <p className="text-xs text-red-400">Unpaid</p>
                    )}
                    {show.paid >= show.expected && show.expected > 0 && (
                      <p className="text-xs text-green-400">Paid</p>
                    )}
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
