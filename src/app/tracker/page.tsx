"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/time-utils";
import { ReminderBanners } from "@/components/tracker/reminder-banners";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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

export default function TrackerPage() {
  const router = useRouter();
  const [records, setRecords] = useState<WorkRecord[]>([]);
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
  const totalExpected = records.reduce((sum, r) => sum + (r.expectedAmount || 0), 0);
  const totalPaid = records.reduce((sum, r) => sum + r.paidAmount, 0);
  const lateCount = records.filter((r) => r.paymentStatus === "late").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Payment Tracker</h1>
        <Button asChild>
          <Link href="/">Record Work Day</Link>
        </Button>
      </div>

      {/* Reminder Banners */}
      <ReminderBanners records={records} />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Records</p>
            <p className="text-2xl font-bold">{records.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Expected</p>
            <p className="text-2xl font-bold">{formatCurrency(totalExpected)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Paid</p>
            <p className="text-2xl font-bold">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Late</p>
            <p className="text-2xl font-bold text-purple-400">{lateCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-3">
            <Input
              placeholder="Search by show name..."
              value={searchShow}
              onChange={(e) => setSearchShow(e.target.value)}
              className="md:max-w-xs"
            />
            <div className="flex gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
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
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Newest First</SelectItem>
                  <SelectItem value="asc">Oldest First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

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
                No work records found. Start by recording a work day.
              </p>
              <Button asChild>
                <Link href="/">Record Work Day</Link>
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
                  {records.map((record) => (
                    <TableRow
                      key={record._id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/work/${record._id}`)}
                    >
                      <TableCell className="font-medium">
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
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
