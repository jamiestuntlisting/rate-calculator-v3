"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/time-utils";
import { ReminderBanners } from "@/components/tracker/reminder-banners";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkRecord } from "@/types";
import { weekLabel } from "@/lib/weekly/weeks";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  unpaid: "bg-red-900/40 text-red-300 border-red-700/50",
  paid_correctly: "bg-green-900/40 text-green-300 border-green-700/50",
  underpaid: "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
  overpaid: "bg-blue-900/40 text-blue-300 border-blue-700/50",
  late: "bg-purple-900/40 text-purple-300 border-purple-700/50",
};

const STATUS_LABELS: Record<string, string> = {
  unpaid: "Unpaid",
  paid_correctly: "Paid Correctly",
  underpaid: "Underpaid",
  overpaid: "Overpaid",
  late: "Late",
};

const RECORD_STATUS_COLORS: Record<string, string> = {
  complete: "",
  needs_times: "bg-orange-900/40 text-orange-300 border-orange-700/50",
  draft: "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
  attachment_only: "bg-blue-900/40 text-blue-300 border-blue-700/50",
};

const RECORD_STATUS_LABELS: Record<string, string> = {
  complete: "Complete",
  needs_times: "Needs Times",
  draft: "Draft",
  attachment_only: "Attachment Only",
};

interface WeeklyGroup {
  _id: string;
  kind?: string;
  title: string;
  weekStart: string;
  weeklyRate: number;
  expectedAmount: number;
}

/**
 * Saved weeklies fold their days under one header; everything else stays a
 * flat row. Order interleaves naturally because a group sorts where its
 * first (most recent) member would have.
 */
function groupByWeekly(records: WorkRecord[], weeklies: WeeklyGroup[]) {
  const byId = new Map(weeklies.map((w) => [w._id, w]));
  const out: Array<
    | { kind: "record"; record: WorkRecord }
    | { kind: "weekly"; weekly: WeeklyGroup; records: WorkRecord[] }
  > = [];
  const seen = new Set<string>();
  for (const record of records) {
    const weeklyId = record.weeklyId ?? null;
    if (weeklyId && byId.has(weeklyId)) {
      if (seen.has(weeklyId)) continue;
      seen.add(weeklyId);
      out.push({
        kind: "weekly",
        weekly: byId.get(weeklyId)!,
        records: records.filter((r) => r.weeklyId === weeklyId),
      });
    } else {
      out.push({ kind: "record", record });
    }
  }
  return out;
}

export default function TrackerPage() {
  const router = useRouter();
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [weeklies, setWeeklies] = useState<WeeklyGroup[]>([]);
  const [collapsedWeeklies, setCollapsedWeeklies] = useState<Set<string>>(
    new Set()
  );
  /** The record a new weekly is being created for, if any. */
  const [newWeeklyFor, setNewWeeklyFor] = useState<string | null>(null);
  const [newWeeklyTitle, setNewWeeklyTitle] = useState("");
  const [newWeeklyStart, setNewWeeklyStart] = useState("");

  const assignToWeekly = async (recordId: string, weeklyId: string | null) => {
    try {
      const res = await fetch("/api/weeklies/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, weeklyId }),
      });
      if (!res.ok) throw new Error();
      fetchRecords();
    } catch {
      toast.error("Couldn't update the weekly");
    }
  };

  const createWeeklyAndAssign = async (recordId: string) => {
    if (!newWeeklyTitle.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(newWeeklyStart)) {
      toast.error("A show name and a start date make the weekly");
      return;
    }
    try {
      const res = await fetch("/api/weeklies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newWeeklyTitle.trim(),
          weekStart: newWeeklyStart,
          weekStartsOn: 1,
          agreement: "theatrical_basic",
          weeklyRate: 0,
          distantLocation: false,
          expectedAmount: 0,
          recordIds: [],
        }),
      });
      if (!res.ok) throw new Error();
      const weekly = await res.json();
      await assignToWeekly(recordId, weekly._id);
      setNewWeeklyFor(null);
      setNewWeeklyTitle("");
      setNewWeeklyStart("");
      toast.success(`${weekly.title} created — day added`);
    } catch {
      toast.error("Couldn't create the weekly");
    }
  };
  const [loading, setLoading] = useState(true);
  const [searchShow, setSearchShow] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("desc");

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        order: sortOrder,
        ...(statusFilter !== "all" && { status: statusFilter }),
        ...(searchShow && { show: searchShow }),
      });
      fetch("/api/weeklies")
        .then((r) => r.json())
        .then((d) => setWeeklies(d.weeklies ?? []))
        .catch(() => {});
      const res = await fetch(`/api/work-records?${params}`);
      if (res.ok) {
        const data = await res.json();
        const now = new Date();

        // Auto-mark unpaid records as late if past payment due date
        const lateUpdates: Promise<void>[] = [];
        const updatedRecords = data.records.map((r: WorkRecord) => {
          if (
            r.paymentStatus === "unpaid" &&
            r.paymentDueDate &&
            new Date(r.paymentDueDate) < now
          ) {
            // Fire and forget update to server
            lateUpdates.push(
              fetch(`/api/work-records/${r._id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paymentStatus: "late" }),
              }).then(() => {})
            );
            return { ...r, paymentStatus: "late" as const };
          }
          return r;
        });

        setRecords(updatedRecords);

        // Let background updates complete silently
        if (lateUpdates.length > 0) {
          Promise.all(lateUpdates).catch(() => {});
        }
      }
    } catch (error) {
      console.error("Failed to fetch records:", error);
    } finally {
      setLoading(false);
    }
  }, [sortOrder, statusFilter, searchShow]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Calculate summary stats
  const lateCount = records.filter((r) => r.paymentStatus === "late").length;

  return (
    <div className="space-y-6">
      {/* The title wraps rather than running under the button: a flex item
          will not shrink below its content unless told to. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold min-w-0">Tracker</h1>
        <Button asChild className="shrink-0">
          <Link href="/">Add Work Day</Link>
        </Button>
      </div>

      {/* Reminder Banners */}
      <ReminderBanners records={records} />

      {/* One line, so the records themselves are what fills the screen. The
          money is on each row and on the Summary page; four cards of it here
          only pushed the list past the fold. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">{records.length}</span>{" "}
          record{records.length === 1 ? "" : "s"}
        </span>
        {lateCount > 0 && (
          <span className="text-muted-foreground">
            <span className="font-medium text-purple-400">{lateCount}</span> late
          </span>
        )}
      </div>

      {/* No card and no heading: three controls explain themselves, and the
          box around them cost more height than they do. */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search by show name..."
          value={searchShow}
          onChange={(e) => setSearchShow(e.target.value)}
          className="w-full sm:w-auto sm:flex-1 sm:max-w-xs"
        />
        <div className="flex flex-1 gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="flex-1 min-w-0 sm:w-[160px] sm:flex-none">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="paid_correctly">Paid Correctly</SelectItem>
                  <SelectItem value="underpaid">Underpaid</SelectItem>
                  <SelectItem value="overpaid">Overpaid</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger className="flex-1 min-w-0 sm:w-[160px] sm:flex-none">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Newest First</SelectItem>
                  <SelectItem value="asc">Oldest First</SelectItem>
                </SelectContent>
              </Select>
        </div>
      </div>

      {/* Records Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">
              Loading records...
            </p>
          ) : records.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                No work records found. Start by adding a work day.
              </p>
              <Button asChild>
                <Link href="/">Add Work Day</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Show / Job</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Type
                    </TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupByWeekly(records, weeklies).map((entry) => {
                    if (entry.kind === "record") return renderRow(entry.record);
                    const { weekly, records: members } = entry;
                    const folded = collapsedWeeklies.has(weekly._id);
                    const paid = members.reduce((n, r) => n + (r.paidAmount || 0), 0);
                    return (
                      <React.Fragment key={`weekly-${weekly._id}`}>
                        <TableRow
                          className="cursor-pointer bg-primary/5 hover:bg-primary/10"
                          onClick={() =>
                            setCollapsedWeeklies((prev) => {
                              const next = new Set(prev);
                              if (next.has(weekly._id)) next.delete(weekly._id);
                              else next.add(weekly._id);
                              return next;
                            })
                          }
                        >
                          <TableCell className="font-medium whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              {folded ? (
                                <ChevronRight className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                              {weekLabel(weekly.weekStart).replace("Week of ", "")}
                            </span>
                          </TableCell>
                          <TableCell className="font-semibold">
                            {weekly.title}
                            <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border border-primary/40 text-primary">
                              {weekly.kind === "three_day" ? "3-day" : "Weekly"} · {members.length} day{members.length === 1 ? "" : "s"}
                            </span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                            {weekly.kind === "three_day" ? "3-day contract" : "Weekly contract"}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {weekly.expectedAmount
                              ? formatCurrency(weekly.expectedAmount)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {paid > 0 ? formatCurrency(paid) : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {folded ? "Tap to expand" : ""}
                          </TableCell>
                        </TableRow>
                        {!folded && members.map((record) => renderRow(record, true))}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  /** One day's row — a weekly member renders indented under its header. */
  function renderRow(record: WorkRecord, inWeekly = false) {
    return (
                    <TableRow
                      key={record._id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/work/${record._id}`)}
                    >
                      <TableCell className={`font-medium ${inWeekly ? "pl-8" : ""}`}>
                        {(() => {
                          const ymd = record.workDate.split("T")[0];
                          const [y, m, d] = ymd.split("-").map(Number);
                          return `${m}/${d}/${y}`;
                        })()}
                      </TableCell>
                      <TableCell>{record.showName}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {record.workType === "other" ? (
                          <Badge variant="outline" className="bg-gray-800 text-gray-300 border-gray-600">Other</Badge>
                        ) : (
                          record.characterName || "SAG-AFTRA"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {record.expectedAmount
                          ? formatCurrency(record.expectedAmount)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {record.paidAmount > 0
                          ? formatCurrency(record.paidAmount)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {record.workType !== "other" && (
                            <select
                              value={record.weeklyId ?? ""}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                const v = e.target.value;
                                if (v === "__new__") {
                                  setNewWeeklyFor(record._id);
                                  setNewWeeklyTitle(record.showName?.trim() || "");
                                  setNewWeeklyStart(record.workDate.split("T")[0]);
                                } else {
                                  assignToWeekly(record._id, v || null);
                                }
                              }}
                              className="h-7 max-w-[9rem] rounded border border-border/60 bg-transparent px-1 text-[11px] text-muted-foreground"
                            >
                              <option value="">No weekly</option>
                              {weeklies.map((w) => (
                                <option key={w._id} value={w._id}>
                                  {w.title} · {weekLabel(w.weekStart).replace("Week of ", "")}
                                </option>
                              ))}
                              <option value="__new__">＋ New weekly…</option>
                            </select>
                          )}
                          {newWeeklyFor === record._id && (
                            <span
                              onClick={(e) => e.stopPropagation()}
                              className="flex flex-col gap-1"
                            >
                              <Input
                                value={newWeeklyTitle}
                                onChange={(e) => setNewWeeklyTitle(e.target.value)}
                                placeholder="Show name"
                                className="h-7 text-xs"
                              />
                              <Input
                                type="date"
                                value={newWeeklyStart}
                                onChange={(e) => setNewWeeklyStart(e.target.value)}
                                className="h-7 text-xs"
                              />
                              <span className="flex gap-1">
                                <Button
                                  size="sm"
                                  className="h-6 px-2 text-[11px]"
                                  onClick={() => createWeeklyAndAssign(record._id)}
                                >
                                  Create
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[11px]"
                                  onClick={() => setNewWeeklyFor(null)}
                                >
                                  Cancel
                                </Button>
                              </span>
                            </span>
                          )}
                          <Badge
                            variant="secondary"
                            className={STATUS_COLORS[record.paymentStatus] || ""}
                          >
                            {STATUS_LABELS[record.paymentStatus] || record.paymentStatus}
                          </Badge>
                          {record.recordStatus && record.recordStatus !== "complete" && (
                            <Badge
                              variant="outline"
                              className={RECORD_STATUS_COLORS[record.recordStatus] || ""}
                            >
                              {RECORD_STATUS_LABELS[record.recordStatus] || record.recordStatus}
                            </Badge>
                          )}
                          {record.missingExhibitG && (
                            <Badge
                              variant="outline"
                              className="bg-red-900/40 text-red-300 border-red-700/50"
                            >
                              Missing G
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
    );
  }
}
