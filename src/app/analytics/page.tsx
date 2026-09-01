"use client";

import React, { useEffect, useState, useMemo } from "react";
import { formatCurrency } from "@/lib/time-utils";
import { shortDay } from "@/lib/format-date";
import { isPaymentLate, paymentDueDate } from "@/lib/payment-due";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, ChevronDown, ChevronRight, FileDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { RateBreakdown } from "@/components/calculation/rate-breakdown";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/calculator/collapsible-section";
import { PayStubSection } from "@/components/shared/pay-stub-section";
import { owedLinesFromRecord, type PayStubLine } from "@/lib/pay-stub";
import { useAuth } from "@/context/auth-context";
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

/** The slice of a saved weekly this page needs. */
interface WeeklyLite {
  _id: string;
  kind: string;
  title: string;
  weekStart: string;
  expectedAmount: number;
}

/**
 * One line in a show's ledger: a daily on its own, or a whole weekly
 * (or 3-day) contract — its days grouped behind one row because the
 * contract is paid as one check, never day by day.
 */
type ShowItem =
  | { kind: "day"; record: WorkRecord }
  | {
      kind: "week";
      weekly: WeeklyLite;
      records: WorkRecord[];
      /** The saved weekly total when the Weekly page worked one out;
       * otherwise the sum of the days' approximations. */
      expected: number;
      approximate: boolean;
      paid: number;
      sortDate: string;
    };

/** "2,174.03" — in the ledger rows the $ stays on the totals, so the
 * columns read as numbers instead of a wall of dollar signs. */
const fmtAmount = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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
  /**
   * Which uploaded Exhibit G backs which tracker row, so an unlogged day
   * can offer "transcribe it" instead of a dead end. Missing entries just
   * mean the day was typed in without an upload.
   */
  const [gUploadByRecord, setGUploadByRecord] = useState<Record<string, string>>({});
  /** Saved weeklies, so their days can fold into one row here. */
  const [weeklies, setWeeklies] = useState<WeeklyLite[]>([]);
  const [loading, setLoading] = useState(true);
  /** Per-day paid entries being edited, keyed by record id. */
  const [paidEdits, setPaidEdits] = useState<Record<string, string>>({});
  /** Per-show paycheck amounts waiting to be applied. */
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [busyShow, setBusyShow] = useState<string | null>(null);
  const [checkOpenFor, setCheckOpenFor] = useState<string | null>(null);
  /** Rows opened to their paycheck breakdown. */
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());

  /** Whose money this is — the member being viewed, for the payroll note. */
  const { user, viewingAs } = useAuth();
  const performerAccount = viewingAs ?? user;
  const performerName = performerAccount
    ? performerAccount.firstName
      ? `${performerAccount.firstName} ${performerAccount.lastName || ""}`.trim()
      : performerAccount.email
    : "This performer";

  /**
   * The resolution mark is a human decision, never derived: 'late' is
   * money being chased, 'done' closes the row whatever the amounts say,
   * null is nobody has said anything — shown as a dash, never as an
   * automatic "Unpaid".
   */
  const saveFlag = async (
    record: WorkRecord,
    flag: "late" | "done" | null
  ) => {
    try {
      const res = await fetch(`/api/work-records/${record._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentFlag: flag }),
      });
      if (!res.ok) throw new Error();
      setRecords((prev) =>
        prev.map((r) =>
          r._id === record._id ? { ...r, paymentFlag: flag } : r
        )
      );
    } catch {
      toast.error("Couldn't save the mark");
    }
  };

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

  /**
   * A weekly is paid as one check, so its Paid box takes the whole check
   * and the page spreads it across the contract's days — oldest first,
   * each day up to its own working, the last absorbing any difference.
   * The split is bookkeeping; the number that matters is the one typed.
   */
  const saveWeekTotal = async (weekRecords: WorkRecord[], total: number) => {
    const sorted = [...weekRecords].sort((a, b) =>
      a.workDate.localeCompare(b.workDate)
    );
    let remaining = Math.round(total * 100) / 100;
    for (let i = 0; i < sorted.length; i++) {
      const last = i === sorted.length - 1;
      const due = sorted[i].expectedAmount || 0;
      const pay =
        Math.round(
          (last ? Math.max(0, remaining) : Math.min(due, Math.max(0, remaining))) * 100
        ) / 100;
      await savePaid(sorted[i], pay);
      remaining = Math.round((remaining - pay) * 100) / 100;
    }
  };

  const saveWeekEdit = async (item: Extract<ShowItem, { kind: "week" }>) => {
    const raw = paidEdits[item.weekly._id];
    if (raw === undefined) return;
    const amount = parseFloat(raw) || 0;
    if (Math.abs(amount - item.paid) < 0.005) return;
    try {
      await saveWeekTotal(item.records, amount);
      toast.success("Check saved across the week");
    } catch {
      toast.error("Couldn't save that check");
    }
  };

  useEffect(() => {
    fetch("/api/work-records?limit=1000")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setRecords(data.records || []))
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch("/api/g-uploads")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { uploads?: Array<{ _id: string; workRecordId?: string }> }) => {
        const map: Record<string, string> = {};
        for (const u of data.uploads ?? []) {
          if (u.workRecordId) map[u.workRecordId] = u._id;
        }
        setGUploadByRecord(map);
      })
      .catch(() => {});
    fetch("/api/weeklies")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { weeklies?: WeeklyLite[] }) => setWeeklies(data.weeklies ?? []))
      .catch(() => {});
  }, []);

  const stats = useMemo(() => {
    if (records.length === 0) return null;

    const totalExpected = records.reduce((s, r) => s + (r.expectedAmount || 0), 0);
    const totalPaid = records.reduce((s, r) => s + r.paidAmount, 0);
    const totalOwed = totalExpected - totalPaid;
    const totalDays = records.length;

    // The page's whole job is moving a day along this pipeline:
    // Exhibit G only -> Logged -> Payment received -> Paid correctly ->
    // Done. Done is the human mark and beats everything; the rest are
    // read off what the record has.
    const stageOf = (r: WorkRecord) => {
      if (r.paymentFlag === "done") return "done";
      const expected = r.expectedAmount || 0;
      const paid = r.paidAmount || 0;
      if (paid > 0 && expected > 0 && Math.abs(paid - expected) < 0.005) {
        return "correct";
      }
      if (paid > 0) return "received";
      if (expected > 0) return "logged";
      return "gOnly";
    };
    const stages = { gOnly: 0, logged: 0, received: 0, correct: 0, done: 0 };
    for (const r of records) stages[stageOf(r)]++;
    const lateCount = records.filter((r) => isPaymentLate(r)).length;
    const missingGCount = records.filter((r) => r.missingExhibitG).length;
    // A G was uploaded but its times never read off — the day cannot be
    // priced until someone transcribes it, so it is a to-do, not a stat.
    const untranscribedCount = records.filter(
      (r) => !r.calculation && !r.callTime && gUploadByRecord[r._id]
    ).length;
    // Times are in but the day still has no working — usually a
    // transcribed G whose agreement has not been picked yet.
    const unpricedCount = records.filter(
      (r) => !r.calculation && r.callTime
    ).length;

    // By show — with the days themselves, oldest first, because this is
    // where payments get resolved and a paycheck lands on actual days.
    // Days attached to a saved weekly (or 3-day) fold into one item: the
    // contract is one check, so it gets one line, one calculated total
    // and one paid amount, with its days as the detail inside.
    const weeklyById = new Map(weeklies.map((w) => [w._id, w]));
    const showMap = new Map<string, { records: WorkRecord[] }>();
    for (const r of records) {
      const name = r.showName || "Unknown";
      const existing = showMap.get(name) || { records: [] };
      existing.records.push(r);
      showMap.set(name, existing);
    }
    const byShow = [...showMap.entries()]
      .map(([name, data]) => {
        const sorted = [...data.records].sort((a, b) =>
          a.workDate.localeCompare(b.workDate)
        );
        const grouped = new Map<string, WorkRecord[]>();
        const loose: WorkRecord[] = [];
        for (const r of sorted) {
          const weekly = r.weeklyId ? weeklyById.get(r.weeklyId) : undefined;
          if (weekly) {
            const list = grouped.get(weekly._id);
            if (list) list.push(r);
            else grouped.set(weekly._id, [r]);
          } else {
            loose.push(r);
          }
        }
        const items: ShowItem[] = [
          ...loose.map((record): ShowItem => ({ kind: "day", record })),
          ...[...grouped.entries()].map(([weeklyId, recs]): ShowItem => {
            const weekly = weeklyById.get(weeklyId)!;
            const daySum = recs.reduce(
              (s, r) => s + (r.expectedAmount || 0),
              0
            );
            const stored = weekly.expectedAmount || 0;
            return {
              kind: "week",
              weekly,
              records: recs,
              expected: stored > 0 ? stored : daySum,
              approximate: !(stored > 0),
              paid: recs.reduce((s, r) => s + r.paidAmount, 0),
              sortDate: recs[0].workDate,
            };
          }),
        ].sort((a, b) =>
          (a.kind === "day" ? a.record.workDate : a.sortDate).localeCompare(
            b.kind === "day" ? b.record.workDate : b.sortDate
          )
        );
        const expected = items.reduce(
          (s, item) =>
            s +
            (item.kind === "day"
              ? item.record.expectedAmount || 0
              : item.expected),
          0
        );
        const paid = data.records.reduce((s, r) => s + r.paidAmount, 0);
        return {
          name,
          days: data.records.length,
          expected,
          paid,
          items,
          looseRecords: loose,
          latest: sorted[sorted.length - 1]?.workDate ?? "",
        };
      })
      // The same order as the Tracker: whoever worked most recently
      // sits on top, not whoever is owed the most.
      .sort((a, b) => b.latest.localeCompare(a.latest));

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


    return {
      totalExpected,
      totalPaid,
      totalOwed,
      totalDays,
      stages,
      lateCount,
      missingGCount,
      untranscribedCount,
      unpricedCount,
      byShow,
      byMonth,
      byAgreement,
    };
  }, [records, gUploadByRecord, weeklies]);

  /**
   * A weekly contract's line in the ledger. One row, the weekly total in
   * the Calculated column and one Paid box for the one check; the days
   * live inside the expansion, each with its own to-do (transcribe the
   * G, log the times) when it is not done.
   */
  const renderWeek = (
    item: Extract<ShowItem, { kind: "week" }>,
    showName: string
  ) => {
    const { weekly, records: weekRecords } = item;
    const rowOpen = openRows.has(weekly._id);
    const edit = paidEdits[weekly._id];
    const allDone = weekRecords.every((r) => r.paymentFlag === "done");
    const anyLate = weekRecords.some((r) => isPaymentLate(r));
    const verdict = allDone
      ? { label: "Done", tone: "bg-green-900/40 text-green-300 border-green-700/50" }
      : item.paid > 0
        ? (VERDICTS[derivePaymentStatus(item.paid, item.expected)] ?? null)
        : anyLate
          ? VERDICTS.late
          : null;
    const contractNoun = weekly.kind === "three_day" ? "3-day" : "Weekly";
    const weekStartYmd = weekly.weekStart.split("T")[0];
    /** Days with no times contribute nothing, so the figure is a floor. */
    const unworkedDays = weekRecords.filter((r) => !r.calculation).length;
    /**
     * The week's working, in stub columns. When the Weekly page has an
     * exact total the note quotes that one line; otherwise the per-day
     * approximations, which are what the shown total adds up from.
     */
    const weekOwedLines: PayStubLine[] = item.approximate
      ? weekRecords.map((r) => ({
          label: shortDay(r.workDate.split("T")[0]),
          hours: r.calculation?.netWorkHours ?? null,
          amount: r.expectedAmount || 0,
        }))
      : [
          {
            label: `${contractNoun} contract total (Weekly page working)`,
            hours: null,
            amount: item.expected,
          },
        ];
    return (
      <React.Fragment key={weekly._id}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 border-b border-border/30">
          <button
            type="button"
            aria-expanded={rowOpen}
            aria-label="Show the week's days"
            onClick={() =>
              setOpenRows((prev) => {
                const next = new Set(prev);
                if (next.has(weekly._id)) next.delete(weekly._id);
                else next.add(weekly._id);
                return next;
              })
            }
            className="order-1 w-5 shrink-0 text-muted-foreground hover:text-foreground"
          >
            {rowOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          <Link href="/weekly" className="order-2 min-w-0 flex-1 truncate">
            {/* The tag does the talking: one glance says this row is a
                contract paid as one check, not another day. */}
            <span className="mr-1.5 inline-block rounded border border-sky-700/60 bg-sky-900/40 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-sky-300">
              {contractNoun}
            </span>
            <span className="text-sm font-medium">{showName}</span>
            <span className="text-xs text-muted-foreground">
              {" "}· from {shortDay(weekly.weekStart.split("T")[0])} ·{" "}
              {weekRecords.length} day{weekRecords.length === 1 ? "" : "s"}
            </span>
          </Link>
          {verdict ? (
            <span
              className={`order-3 sm:order-5 shrink-0 w-14 text-center rounded px-1 py-0.5 text-[10px] font-semibold border ${verdict.tone}`}
            >
              {verdict.label}
            </span>
          ) : (
            <span className="order-3 sm:order-5 shrink-0 w-14 text-center text-xs text-muted-foreground">
              —
            </span>
          )}
          <div className="order-4 flex w-full items-center gap-2 pl-5 sm:w-auto sm:gap-3 sm:pl-0">
            <span className="mr-auto whitespace-nowrap text-[11px] text-muted-foreground sm:hidden">
              calc → paid
            </span>
            {item.expected ? (
              <span className="text-sm tabular-nums shrink-0 w-24 text-right">
                {unworkedDays > 0 && (
                  <span
                    className="mr-0.5 text-amber-400"
                    title={`${unworkedDays} day${unworkedDays === 1 ? "" : "s"} not transcribed yet — this is a minimum`}
                  >
                    ≥
                  </span>
                )}
                {fmtAmount(item.expected)}
                {item.approximate && "*"}
              </span>
            ) : (
              <span className="text-sm shrink-0 w-24 text-right text-muted-foreground">
                —
              </span>
            )}
            <div className="w-24 shrink-0 sm:ml-4 sm:w-28">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={edit ?? (item.paid || "")}
                onChange={(e) =>
                  setPaidEdits((prev) => ({
                    ...prev,
                    [weekly._id]: e.target.value,
                  }))
                }
                onBlur={() => saveWeekEdit(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                placeholder="0.00"
                className="h-9 text-sm text-right tabular-nums"
              />
            </div>
          </div>
        </div>
        {rowOpen && (
          <div className="border-b border-border/30 py-3 pl-8 pr-1 space-y-3">
            <p className="text-xs text-muted-foreground">
              A {contractNoun.toLowerCase()} is paid as one check — the Paid
              box holds the whole check, spread across the days as
              bookkeeping.{" "}
              {item.approximate
                ? "Its total here is the days' approximations added up; the Weekly page works the week out exactly."
                : "The total is the Weekly page's working for this week."}
              {unworkedDays > 0 &&
                ` ${unworkedDays} day${unworkedDays === 1 ? " has" : "s have"} no times yet, so the figure is a minimum — it rises as they are transcribed.`}
            </p>
            <div className="space-y-1">
              {weekRecords.map((r) => {
                const ymd = r.workDate.split("T")[0];
                return (
                  <div
                    key={r._id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                  >
                    <Link
                      href={`/work/${r._id}`}
                      className="min-w-0 flex-1 truncate"
                    >
                      {shortDay(ymd)}
                    </Link>
                    {r.calculation ? (
                      <span className="tabular-nums w-24 text-right shrink-0">
                        {fmtAmount(r.expectedAmount || 0)}
                      </span>
                    ) : r.callTime ? (
                      <Link
                        href={`/work/${r._id}?edit=1`}
                        className="shrink-0 text-xs text-amber-400 underline underline-offset-2"
                      >
                        Pick its agreement
                      </Link>
                    ) : gUploadByRecord[r._id] ? (
                      <Link
                        href={`/upload-g/${gUploadByRecord[r._id]}`}
                        className="shrink-0 text-xs text-amber-400 underline underline-offset-2"
                      >
                        Transcribe the G
                      </Link>
                    ) : (
                      <Link
                        href={`/work/${r._id}?edit=1`}
                        className="shrink-0 text-xs text-amber-400 underline underline-offset-2"
                      >
                        Log times
                      </Link>
                    )}
                    <span className="tabular-nums w-24 text-right shrink-0 text-muted-foreground sm:ml-4 sm:w-28">
                      {r.paidAmount ? fmtAmount(r.paidAmount) : "—"}
                    </span>
                    <span className="hidden w-14 shrink-0 sm:block" aria-hidden />
                  </div>
                );
              })}
            </div>
            {/* One check for the week — so one stub and one photo too. */}
            <CollapsibleSection
              title="Check & pay stub"
              summary="Add the week's check photo and lines, compared against our working"
            >
              <PayStubSection
                scope="week"
                weekStart={weekStartYmd}
                showName={showName}
                owed={item.expected}
                performerName={performerName}
                period={`the ${contractNoun.toLowerCase()} week of ${shortDay(weekStartYmd)}`}
                owedLines={weekOwedLines}
              />
            </CollapsibleSection>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Mark it:</span>
              <button
                type="button"
                onClick={async () => {
                  for (const r of weekRecords) {
                    await saveFlag(r, allDone ? null : "done");
                  }
                }}
                className={`rounded border px-2 py-1 text-xs ${
                  allDone
                    ? "border-green-700/60 bg-green-900/40 text-green-300"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                Done — not chasing this
              </button>
            </div>
          </div>
        )}
      </React.Fragment>
    );
  };

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
        <h1 className="text-2xl font-bold">Resolve</h1>
        <p className="text-muted-foreground">No work records yet. Start recording work days to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Resolve</h1>

      {/* One question: where does each day stand on its way from an
          Exhibit G photo to money resolved. One block per stage with the
          arrows saying which way a day travels; every stage shows even
          at zero, so the pipeline always has the same shape. */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-muted-foreground">Work days</p>
            <p className="text-2xl font-bold tabular-nums">{stats.totalDays}</p>
          </div>
          <div className="flex items-stretch gap-1 overflow-x-auto pb-1 sm:gap-1.5">
            {[
              { label: "Exhibit G", value: stats.stages.gOnly, tone: "border-zinc-500/60" },
              { label: "Logged", value: stats.stages.logged, tone: "border-blue-400/60" },
              { label: "Payment received", value: stats.stages.received, tone: "border-yellow-400/60" },
              { label: "Paid correctly", value: stats.stages.correct, tone: "border-green-500/60" },
              { label: "Done", value: stats.stages.done, tone: "border-primary/60" },
            ].map((stage, i) => (
              <React.Fragment key={stage.label}>
                {i > 0 && (
                  <ArrowRight
                    aria-hidden
                    className="h-4 w-4 shrink-0 self-center text-muted-foreground"
                  />
                )}
                <div
                  className={`min-w-[3.9rem] flex-1 rounded-lg border p-1.5 text-center sm:p-2 ${
                    stage.value > 0 ? stage.tone : "border-border opacity-50"
                  }`}
                >
                  <p className="text-xl font-bold tabular-nums leading-tight">
                    {stage.value}
                  </p>
                  <p className="text-[10px] leading-tight text-muted-foreground">
                    {stage.label}
                  </p>
                </div>
              </React.Fragment>
            ))}
          </div>
          {/* What still needs a hand: the page's to-do line. */}
          {(stats.untranscribedCount > 0 ||
            stats.unpricedCount > 0 ||
            stats.missingGCount > 0 ||
            stats.lateCount > 0) && (
            <p className="text-xs text-muted-foreground">
              {stats.untranscribedCount > 0 && (
                <>
                  {stats.untranscribedCount} Exhibit{" "}
                  {stats.untranscribedCount === 1 ? "G" : "Gs"} waiting to be{" "}
                  <Link href="/upload-g" className="underline underline-offset-2">
                    transcribed
                  </Link>
                  {". "}
                </>
              )}
              {stats.unpricedCount > 0 &&
                `${stats.unpricedCount} day${stats.unpricedCount === 1 ? " has" : "s have"} times but no agreement picked, so no working yet. `}
              {stats.missingGCount > 0 &&
                `${stats.missingGCount} day${stats.missingGCount === 1 ? "" : "s"} still missing an Exhibit G. `}
              {stats.lateCount > 0 &&
                `${stats.lateCount} late — no check by the second Wednesday after the work week.`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Work Days */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Work Days</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.byShow.length === 0 ? (
            <p className="text-muted-foreground text-sm">No data</p>
          ) : (
            <div className="space-y-1">
              <div className="hidden sm:flex items-center gap-3 pb-1 border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <span className="w-5 shrink-0" aria-hidden />
                <span className="flex-1 min-w-0">Show · date</span>
                <span className="w-24 text-right shrink-0">Calculated</span>
                <span className="w-28 text-right shrink-0 sm:ml-4">Paid</span>
                <span className="w-14 shrink-0" aria-hidden />
              </div>
              {/* One row per day: show, date, what we calculated, what they
                  were paid (typed straight in), and the verdict — the same
                  ledger shape as a pay stub, nothing to open. */}
              {stats.byShow.map((show) => (
                <div key={show.name} className="pb-2">
                  {show.items.map((item) => {
                    if (item.kind === "week") return renderWeek(item, show.name);
                    const record = item.record;
                    const ymd = record.workDate.split("T")[0];
                    const edit = paidEdits[record._id];
                    const rowOpen = openRows.has(record._id);
                    // The chip never says "Unpaid" on its own: a dash until
                    // a human marks the row (Late while chasing, Done when
                    // closed whatever the amounts say), or an amount was
                    // actually entered — then the arithmetic verdict shows.
                    // Late is derived, never hand-marked: no check by the
                    // second Wednesday after the work week. Done still
                    // beats it — closed is closed.
                    const verdict =
                      record.paymentFlag === "done"
                        ? { label: "Done", tone: "bg-green-900/40 text-green-300 border-green-700/50" }
                        : isPaymentLate(record)
                          ? VERDICTS.late
                          : (record.paidAmount || 0) > 0
                            ? VERDICTS[record.paymentStatus] ?? null
                            : null;
                    return (
                      <React.Fragment key={record._id}>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 border-b border-border/30">
                          <button
                            type="button"
                            aria-expanded={rowOpen}
                            aria-label="Show the paycheck breakdown"
                            onClick={() =>
                              setOpenRows((prev) => {
                                const next = new Set(prev);
                                if (next.has(record._id)) next.delete(record._id);
                                else next.add(record._id);
                                return next;
                              })
                            }
                            className="order-1 w-5 shrink-0 text-muted-foreground hover:text-foreground"
                          >
                            {rowOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                          <Link
                            href={`/work/${record._id}`}
                            className="order-2 min-w-0 flex-1 truncate"
                          >
                            <span className="text-sm font-medium">
                              {show.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {" "}· {shortDay(ymd)}
                            </span>
                          </Link>
                          {verdict ? (
                            <span
                              className={`order-3 sm:order-5 shrink-0 w-14 text-center rounded px-1 py-0.5 text-[10px] font-semibold border ${verdict.tone}`}
                            >
                              {verdict.label}
                            </span>
                          ) : (
                            <span className="order-3 sm:order-5 shrink-0 w-14 text-center text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                          <div className="order-4 flex w-full items-center gap-2 pl-5 sm:w-auto sm:gap-3 sm:pl-0">
                            <span className="mr-auto whitespace-nowrap text-[11px] text-muted-foreground sm:hidden">
                              calc → paid
                            </span>
                            {record.expectedAmount ? (
                              <span className="text-sm tabular-nums shrink-0 w-24 text-right">
                                {fmtAmount(record.expectedAmount)}
                              </span>
                            ) : (
                              <span className="text-sm shrink-0 w-24 text-right text-muted-foreground">
                                —
                              </span>
                            )}
                            <div className="w-24 shrink-0 sm:ml-4 sm:w-28">
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
                                className="h-9 text-sm text-right tabular-nums"
                              />
                            </div>
                          </div>
                        </div>
                        {rowOpen && (
                          <div className="border-b border-border/30 py-3 pl-8 pr-1 space-y-3">
                            {record.calculation ? (
                              <>
                                <RateBreakdown
                                  breakdown={record.calculation}
                                  linesOnly
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
                                <a
                                  href={`/api/work-records/${record._id}/expected-pay`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                                >
                                  <FileDown className="h-3.5 w-3.5" />
                                  Expected pay (PDF)
                                </a>
                              </>
                            ) : record.callTime ? (
                              <p className="text-sm text-muted-foreground">
                                The times are in, but no agreement has
                                been picked, so there is no working to
                                compare a check against.{" "}
                                <Link
                                  href={`/work/${record._id}?edit=1`}
                                  className="underline underline-offset-2"
                                >
                                  Open the day and pick its agreement
                                </Link>
                              </p>
                            ) : gUploadByRecord[record._id] ? (
                              <p className="text-sm text-muted-foreground">
                                This day’s Exhibit G hasn’t been
                                transcribed — no times, so nothing to
                                compare a check against.{" "}
                                <Link
                                  href={`/upload-g/${gUploadByRecord[record._id]}`}
                                  className="underline underline-offset-2"
                                >
                                  Transcribe the G
                                </Link>
                              </p>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                This day hasn’t been logged yet — no
                                times, so nothing to compare a check against.{" "}
                                <Link
                                  href={`/work/${record._id}?edit=1`}
                                  className="underline underline-offset-2"
                                >
                                  Log this day’s times
                                </Link>
                              </p>
                            )}
                            {record.workType !== "other" && (
                              <p className="text-xs text-muted-foreground">
                                {(record.paidAmount || 0) > 0 ||
                                record.paymentFlag === "done"
                                  ? `Payment was due by ${shortDay(paymentDueDate(record.workDate) ?? "")}.`
                                  : isPaymentLate(record)
                                    ? `Late — payment was due by ${shortDay(paymentDueDate(record.workDate) ?? "")}, the second Wednesday after the work week.`
                                    : `Payment due by ${shortDay(paymentDueDate(record.workDate) ?? "")} — the second Wednesday after the work week.`}
                              </p>
                            )}
                            {/* The check itself: its total and photo, and
                                the stub's lines against ours — image and
                                breakdown side by side once a photo is in. */}
                            <CollapsibleSection
                              title="Check & pay stub"
                              summary="Add the check's photo and lines, compared against our working"
                            >
                              <PayStubSection
                                scope="day"
                                workRecordId={record._id}
                                showName={show.name}
                                owed={record.expectedAmount || 0}
                                performerName={performerName}
                                period={`the work day of ${shortDay(ymd)}`}
                                owedLines={owedLinesFromRecord(record)}
                              />
                            </CollapsibleSection>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                Mark it:
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  saveFlag(
                                    record,
                                    record.paymentFlag === "done" ? null : "done"
                                  )
                                }
                                className={`rounded border px-2 py-1 text-xs ${
                                  record.paymentFlag === "done"
                                    ? "border-green-700/60 bg-green-900/40 text-green-300"
                                    : "border-border text-muted-foreground hover:bg-accent"
                                }`}
                              >
                                Done — not chasing this
                              </button>

                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}

                  <div className="flex items-center gap-3 py-1.5">
                    <span className="hidden w-5 shrink-0 sm:block" aria-hidden />
                    <span className="flex-1 min-w-0 text-xs font-medium">
                      Total
                    </span>
                    <span className="text-sm font-semibold tabular-nums shrink-0 w-24 text-right">
                      {formatCurrency(show.expected)}
                    </span>
                    <span className="text-sm font-semibold tabular-nums shrink-0 w-28 text-right sm:ml-4">
                      {formatCurrency(show.paid)}
                    </span>
                    <span className="w-14 shrink-0 text-center">
                      {show.looseRecords.length > 0 && (
                        <button
                          type="button"
                          aria-expanded={checkOpenFor === show.name}
                          onClick={() =>
                            setCheckOpenFor((prev) =>
                              prev === show.name ? null : show.name
                            )
                          }
                          className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
                        >
                          ＋ Check
                        </button>
                      )}
                    </span>
                  </div>
                  {checkOpenFor === show.name && (
                    <div className="flex items-center gap-2 py-1.5">
                      <span className="flex-1 min-w-0 text-xs text-muted-foreground">
                        Paycheck — fills the oldest unpaid daily first; a
                        weekly takes its check on its own row
                      </span>
                      <div className="w-24 shrink-0">
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
                          className="h-9 text-sm text-right tabular-nums"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-14 px-0"
                        disabled={busyShow === show.name}
                        onClick={() => applyCheck(show.name, show.looseRecords)}
                      >
                        {busyShow === show.name ? "…" : "Apply"}
                      </Button>
                    </div>
                  )}
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

