"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Info, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/time-utils";
import { RATES, type RateSchedule } from "@/lib/rate-constants";
import { AGREEMENTS, weekRate, weeklyAgreementLabel } from "@/lib/agreements";

/**
 * The picker's own short names — the full agreement names clip on a phone,
 * and inside this page's context "Theatrical/TV" says everything the long
 * form says. "Other" is a deal that is none of the schedules: it is the
 * one case where the weekly rate is typed rather than known.
 */
const SHORT_NAMES: Record<string, string> = {
  theatrical_basic: "Theatrical/TV",
  low_budget: "Low Budget",
  modified_low_budget: "Mod. Low Budget",
  ultra_low_budget: "Ultra Low Budget",
  stunt_coordinator: "Coordinator — flat",
  stunt_coordinator_daily: "Coordinator — daily",
};
import {
  calculateWeekly,
  type WeeklyBreakdown,
  type WeeklyExtra,
} from "@/lib/weekly/weekly-engine";
import { workRecordsToWeeklyInput } from "@/lib/weekly/from-work-records";
import {
  DEFAULT_WEEK_STARTS_ON,
  WEEK_DAY_NAMES,
  groupIntoWeeks,
  weekLabel,
  type WeekStartDay,
} from "@/lib/weekly/weeks";
import { turnaroundsFor } from "@/lib/weekly/turnaround";
import { WEEKLY_GUARANTEES, weekRules } from "@/lib/weekly/rules";
import type { WorkRecord } from "@/types";
import { CollapsibleSection } from "@/components/calculator/collapsible-section";
import { ShowCombobox } from "@/components/shared/show-combobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExhibitGViewer } from "@/components/shared/exhibit-g-viewer";
import { PayStubSection } from "@/components/shared/pay-stub-section";
import type { PayStubLine } from "@/lib/pay-stub";
import { useAuth } from "@/context/auth-context";

/**
 * Location allowance and holiday are properties of one week, not the deal,
 * so they stay per-week rather than moving up with the terms.
 */
interface WeekOverride {
  extra: WeeklyExtra;
}

const NO_OVERRIDE: WeekOverride = { extra: null };

const EXTRAS: Array<{ value: WeeklyExtra; label: string }> = [
  { value: null, label: "None" },
  { value: "loc_allowance", label: "Location allowance" },
  { value: "holiday", label: "Holiday" },
];

const shortDate = (workDate: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(workDate || "");
  if (!m) return workDate;
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  ).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
};

/** A placeholder name from a bulk upload, or no name at all. */
const isUnnamed = (record: WorkRecord, title: string) =>
  !record.showName?.trim() ||
  /^Untranscribed Exhibit G \d+$/.test(record.showName) ||
  (title.trim() !== "" && record.showName.startsWith(`${title} — Day `));

/** A day with no times on it cannot contribute hours to the week. */
const needsInfo = (record: WorkRecord) => !record.callTime;

/** The Exhibit G attached to a day, if one is. */
function gDocOf(record: WorkRecord) {
  return (record.documents ?? []).find(
    (doc) =>
      doc.documentType === "exhibit_g" &&
      /\.(jpe?g|png|gif|webp|pdf)$/i.test(doc.filename)
  );
}

export function WeeklyForm() {
  const { user } = useAuth();

  /**
   * The terms of the deal, asked as a questionnaire rather than a rate
   * sheet. Picking the contract seeds the weekly rate (still editable —
   * over-scale deals exist); the overnight-location question is what
   * actually decides the 44 vs 48 hour guarantee and the rest rule, so
   * it is asked in those words instead of asking which guarantee they
   * think they are on. Weekly overtime is not asked at all: hours past
   * the guarantee are derived from the days.
   */
  const [title, setTitle] = useState("");
  const [agreement, setAgreement] = useState<RateSchedule | "other">(
    "theatrical_basic"
  );
  const [weeklyRate, setWeeklyRate] = useState<number>(
    RATES.theatrical_basic.weekly
  );
  const [distantLocation, setDistantLocation] = useState(false);
  const [showLocationInfo, setShowLocationInfo] = useState(false);
  const [weekStartsOn, setWeekStartsOn] =
    useState<WeekStartDay>(DEFAULT_WEEK_STARTS_ON);

  const [records, setRecords] = useState<WorkRecord[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, WeekOverride>>({});
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  const [savingWeek, setSavingWeek] = useState<string | null>(null);
  const [savedWeeks, setSavedWeeks] = useState<Set<string>>(new Set());
  /** The day whose Exhibit G is open in the popup viewer, if any. */
  const [viewing, setViewing] = useState<WorkRecord | null>(null);

  // An "other" deal has no published scale, so its own rate stands in —
  // premiums then follow the deal rather than a schedule it is not on.
  const scaleWeeklyRate =
    agreement === "other" ? weeklyRate : RATES[agreement].weekly;
  const guarantee = distantLocation ? ("distant" as const) : ("studio" as const);
  const guaranteeHours =
    WEEKLY_GUARANTEES.find((g) => g.id === guarantee)?.hours ?? 44;
  // 12 hours is the studio rest rule; 11 is the overnight-location figure.
  const turnaroundHours = distantLocation ? 11 : 12;

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/work-records?limit=200&sort=workDate&order=desc"
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { records: WorkRecord[] };
      setRecords(data.records.filter((r) => r.workType !== "other"));
    } catch {
      setRecords([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * The shows this member has logged, newest first — the show being worked
   * this week is almost always the one touched most recently, so it should
   * be the first thing the pulldown offers.
   */
  const knownShows = useMemo(() => {
    const latest = new Map<string, string>();
    for (const record of records ?? []) {
      const name = record.showName?.trim();
      if (!name || /^Untranscribed Exhibit G \d+$/.test(name) || / — Day \d+$/.test(name)) {
        continue;
      }
      const touched = record.updatedAt || record.workDate || "";
      if (touched > (latest.get(name) ?? "")) latest.set(name, touched);
    }
    return [...latest.entries()]
      .sort((a, b) => b[1].localeCompare(a[1]))
      .map(([name]) => name);
  }, [records]);

  /**
   * The days offered: the picked show's, plus every unnamed upload —
   * an untranscribed Exhibit G could be anyone's, so it stays pickable
   * whichever show is chosen.
   */
  const offered = useMemo(() => {
    const all = records ?? [];
    if (!title.trim()) return all;
    return all.filter(
      (r) => r.showName?.trim() === title.trim() || isUnnamed(r, title)
    );
  }, [records, title]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const weeks = useMemo(() => {
    const chosen = (records ?? []).filter((r) => picked.has(r._id));
    return groupIntoWeeks(chosen, weekStartsOn);
  }, [records, picked, weekStartsOn]);

  const ready = weeklyRate > 0;

  /** One calculation per week — a run across three weeks is three contracts. */
  const calculated = useMemo(
    () =>
      weeks.map((week) => {
        const override = overrides[week.start] ?? NO_OVERRIDE;
        const { input, derivation } = workRecordsToWeeklyInput(week.records, {
          scaleWeeklyRate,
          contractWeeklyRate: weeklyRate,
        });
        // Weekly overtime is the hours the week ran past its guarantee,
        // read off the days rather than asked for.
        const weeklyOvertimeHours =
          Math.round(Math.max(0, derivation.workHours - guaranteeHours) * 10) /
          10;
        let breakdown: WeeklyBreakdown | null = null;
        if (ready) {
          try {
            breakdown = calculateWeekly({
              ...input,
              weeklyOvertimeHours,
              extra: override.extra,
            });
          } catch {
            breakdown = null;
          }
        }
        const turnarounds = turnaroundsFor(week.records, turnaroundHours);
        const rules = weekRules({
          derivation,
          turnarounds,
          turnaroundHours,
          guarantee,
        });
        return { week, derivation, breakdown, override, turnarounds, rules };
      }),
    [
      weeks,
      overrides,
      scaleWeeklyRate,
      weeklyRate,
      ready,
      guaranteeHours,
      turnaroundHours,
      guarantee,
    ]
  );

  const grandTotal = calculated.reduce(
    (sum, w) => sum + (w.breakdown?.grandTotal ?? 0),
    0
  );

  const setOverride = (start: string, patch: Partial<WeekOverride>) =>
    setOverrides((prev) => ({
      ...prev,
      [start]: { ...(prev[start] ?? NO_OVERRIDE), ...patch },
    }));

  /** What to call a day in a week: its show, or Day N until transcribed. */
  const dayLabel = (record: WorkRecord, index: number) =>
    isUnnamed(record, title) ? `Day ${index + 1}` : record.showName;

  const saveWeek = async (start: string, expectedAmount: number, ids: string[]) => {
    if (!title.trim()) {
      toast.error("Give the weekly a show title first — it names the group in your tracker");
      return;
    }
    setSavingWeek(start);
    try {
      const res = await fetch("/api/weeklies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          weekStart: start,
          weekStartsOn,
          agreement,
          weeklyRate,
          distantLocation,
          expectedAmount,
          recordIds: ids,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Couldn't save the weekly");
      }
      setSavedWeeks((prev) => new Set(prev).add(start));
      toast.success(`Saved — ${weekLabel(start)} is grouped in your tracker`);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the weekly");
    } finally {
      setSavingWeek(null);
    }
  };

  const viewingDoc = viewing ? gDocOf(viewing) : null;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* The G, in place: look at the card without leaving the week
          being built. Filling the day in still means the record page —
          the link at the bottom goes there. */}
      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] p-4">
          <DialogHeader>
            <DialogTitle className="text-base">
              {viewing ? `${shortDate(viewing.workDate)} · ${viewing.showName || "Untranscribed"}` : ""}
            </DialogTitle>
          </DialogHeader>
          {viewing && viewingDoc && (
            <>
              <ExhibitGViewer
                src={`/api/uploads/${viewingDoc.filename}`}
                alt={viewingDoc.originalName}
                isPdf={/\.pdf$/i.test(viewingDoc.filename)}
                height="55vh"
                initialRotation={viewingDoc.rotation ?? 0}
              />
              <Link
                href={`/work/${viewing._id}`}
                className="text-sm underline underline-offset-4 text-center"
              >
                Open the full record to fill it in
              </Link>
            </>
          )}
        </DialogContent>
      </Dialog>

      <CollapsibleSection
        title="Job Details"
        defaultOpen
        summary={
          [
            title,
            agreement === "other"
              ? `Other · ${weekRate(weeklyRate)}`
              : weeklyAgreementLabel(agreement),
            distantLocation ? "Overnight location" : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Show, contract and rate"
        }
      >
        <div className="space-y-3 p-1">
          <div className="space-y-1">
            <Label htmlFor="weeklyTitle" className="text-base">
              Show Title
            </Label>
            <ShowCombobox
              id="weeklyTitle"
              value={title}
              onChange={setTitle}
              options={knownShows}
              placeholder="Pick a show or type a new one"
              className="text-lg h-12"
            />
            <p className="text-xs text-muted-foreground">
              Filters the days below to this show — plus any Exhibit Gs with
              no name yet, since those could be its days.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="weeklyAgreement" className="text-base shrink-0">
              Contract
            </Label>
            <FieldSelect
              id="weeklyAgreement"
              value={agreement}
              onChange={(v) => {
                if (v === "other") {
                  setAgreement("other");
                  return;
                }
                const next = v as RateSchedule;
                setAgreement(next);
                // The contract knows its rate; nothing to type.
                setWeeklyRate(RATES[next].weekly);
              }}
              options={[
                ...AGREEMENTS.map((a) => ({
                  value: a.id,
                  label: `${SHORT_NAMES[a.id] ?? a.name} · ${weekRate(
                    RATES[a.id as RateSchedule].weekly
                  )}`,
                })),
                { value: "other", label: "Other · type the rate" },
              ]}
            />
          </div>

          {agreement === "other" && (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="weeklyRate" className="text-base shrink-0">
                Weekly rate
              </Label>
              <MoneyInput id="weeklyRate" value={weeklyRate} onChange={setWeeklyRate} />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="distantLocation"
                checked={distantLocation}
                onCheckedChange={(v) => setDistantLocation(!!v)}
              />
              <Label htmlFor="distantLocation" className="text-base font-normal">
                Were you on an overnight location?
              </Label>
              <button
                type="button"
                aria-label="What counts as an overnight location?"
                aria-expanded={showLocationInfo}
                onClick={() => setShowLocationInfo((v) => !v)}
                className="rounded-full border border-border p-1 text-muted-foreground hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            {showLocationInfo && (
              <p className="text-xs text-muted-foreground rounded-md bg-muted/40 border border-border/60 p-3">
                An overnight (distant) location is one far enough from the
                production&rsquo;s base that you were put up rather than going home
                — hotel and per diem, not your own bed. It changes the deal:
                the weekly guarantee is 48 hours instead of 44 (the extra
                four paid as location allowance), and rest between days can
                drop to 11 hours on two non-consecutive days. If you drove
                home each night, answer no.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="weekStartsOn" className="text-base shrink-0">
              Week starts
            </Label>
            <FieldSelect
              id="weekStartsOn"
              value={String(weekStartsOn)}
              onChange={(v) => setWeekStartsOn(Number(v) as WeekStartDay)}
              options={WEEK_DAY_NAMES.map((name, index) => ({
                value: String(index),
                label: name,
              }))}
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Which days did you work?"
        defaultOpen
        summary={
          picked.size > 0
            ? `${picked.size} day${picked.size === 1 ? "" : "s"} picked`
            : "Pick the days this weekly covers"
        }
      >
        <div className="p-1">
          {records === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your days…
            </div>
          ) : offered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {title.trim()
                ? `No days for “${title.trim()}” yet — and no unnamed Exhibit Gs to assign.`
                : "No work days yet."}{" "}
              <Link href="/" className="underline">
                Log one
              </Link>{" "}
              or{" "}
              <Link href="/get-started" className="underline">
                bulk-upload your Exhibit Gs
              </Link>
              .
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
              {offered.map((record) => (
                <div
                  key={record._id}
                  className="flex items-center gap-3 p-2 rounded hover:bg-accent/40"
                >
                  <Checkbox
                    checked={picked.has(record._id)}
                    onCheckedChange={() => toggle(record._id)}
                  />
                  {/* A day that needs info opens its Exhibit G on tap — the
                      row's job is to show you the card so the info can be
                      filled in. A complete day just toggles its checkbox. */}
                  {needsInfo(record) && gDocOf(record) ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => setViewing(record)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setViewing(record);
                      }}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <span className="block text-sm">
                        {shortDate(record.workDate)}
                      </span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {record.showName || "—"}
                      </span>
                    </span>
                  ) : needsInfo(record) ? (
                    <Link
                      href={`/work/${record._id}`}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <span className="block text-sm">
                        {shortDate(record.workDate)}
                      </span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {record.showName || "—"}
                      </span>
                    </Link>
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => toggle(record._id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") toggle(record._id);
                      }}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <span className="block text-sm">
                        {shortDate(record.workDate)}
                      </span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {record.showName || "—"}
                      </span>
                    </span>
                  )}
                  {needsInfo(record) && (
                    <Link
                      href={`/work/${record._id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border border-amber-500/60 text-amber-400 hover:bg-amber-500/10"
                    >
                      Needs info
                    </Link>
                  )}
                  {record.weeklyContract && !needsInfo(record) && (
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border border-primary/40 text-primary">
                      Weekly
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {calculated.map(({ week, breakdown, override, turnarounds, rules }) => {
        const open = openWeek === week.start;
        const saved = savedWeeks.has(week.start);
        // The weekly is defined by the first day actually worked — the
        // calendar boundary only decides which days belong together.
        const firstDay = (week.records[0]?.workDate ?? week.start).slice(0, 10);
        return (
          <div key={week.start} className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setOpenWeek(open ? null : week.start)}
              aria-expanded={open}
              className="w-full text-left p-4 flex items-center gap-3 hover:bg-accent/30 transition-colors"
            >
              {open ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 min-w-0">
                <span className="block font-medium">
                  {weekLabel(firstDay)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {week.records.length} day
                  {week.records.length === 1 ? "" : "s"}
                  {saved ? " · saved" : ""}
                </span>
              </span>
              <span className="text-lg font-semibold tabular-nums shrink-0">
                {breakdown ? formatCurrency(breakdown.grandTotal) : "—"}
              </span>
            </button>

            {open && (
              <div className="border-t border-border p-4 space-y-4">
                {/* The days inside this week, unnamed ones as Day N until
                    transcription gives them their real date and show. */}
                <div className="space-y-1">
                  {week.records.map((record, index) => (
                    <div
                      key={record._id}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="flex-1 min-w-0 truncate">
                        <span className="text-muted-foreground">
                          {shortDate(record.workDate)} ·{" "}
                        </span>
                        {dayLabel(record, index)}
                      </span>
                      {needsInfo(record) ? (
                        <Link
                          href={`/work/${record._id}`}
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border border-amber-500/60 text-amber-400 hover:bg-amber-500/10"
                        >
                          Needs info
                        </Link>
                      ) : (
                        <Link
                          href={`/work/${record._id}`}
                          className="shrink-0 text-xs text-muted-foreground underline underline-offset-2"
                        >
                          Details
                        </Link>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {EXTRAS.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() =>
                        setOverride(week.start, { extra: option.value })
                      }
                      aria-pressed={override.extra === option.value}
                      className={`text-xs rounded px-3 py-1.5 border transition-colors ${
                        override.extra === option.value
                          ? "border-foreground/40 text-foreground"
                          : "border-border/40 text-muted-foreground hover:bg-accent/50"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {breakdown ? (
                  <div className="space-y-1">
                    {breakdown.lineItems.map((item, i) => (
                      <div
                        key={`${item.label}-${i}`}
                        className="flex justify-between gap-3 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {item.label}
                          {item.units !== 1 && ` · ${item.units}`}
                          {item.multiplier !== 1 && ` · ×${item.multiplier}`}
                        </span>
                        <span className="tabular-nums shrink-0">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                    {breakdown.postSubtotalAdjustments !== 0 && (
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">
                          Meal penalties
                        </span>
                        <span className="tabular-nums shrink-0">
                          {formatCurrency(breakdown.postSubtotalAdjustments)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between gap-3 font-medium pt-2 border-t border-border">
                      <span>Total</span>
                      <span className="tabular-nums shrink-0">
                        {formatCurrency(breakdown.grandTotal)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Pick a contract above to work this week out.
                  </p>
                )}

                <button
                  type="button"
                  disabled={savingWeek === week.start}
                  onClick={() =>
                    saveWeek(
                      firstDay,
                      breakdown?.grandTotal ?? 0,
                      week.records.map((r) => r._id)
                    )
                  }
                  className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {savingWeek === week.start
                    ? "Saving…"
                    : saved
                      ? "Update this weekly"
                      : "Save weekly to tracker"}
                </button>
                <p className="text-xs text-muted-foreground -mt-2">
                  Groups these days under one weekly in your tracker
                  {title.trim() ? "" : " — needs the show title above"}.
                  Unnamed Exhibit Gs take the show title, labelled Day 1,
                  Day 2… until they are transcribed.
                </p>

                {breakdown && (
                  <div className="pt-3 border-t border-border space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Pay stub for this week
                    </p>
                    <PayStubSection
                      scope="week"
                      weekStart={firstDay}
                      showName={title.trim() || week.records[0]?.showName || "this production"}
                      owed={breakdown.grandTotal}
                      performerName={
                        user
                          ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
                            user.email
                          : "This performer"
                      }
                      period={weekLabel(firstDay).toLowerCase()}
                      owedLines={breakdown.lineItems.map(
                        (item): PayStubLine => ({
                          label: item.label,
                          hours: item.multiplier !== 1 ? item.units : null,
                          amount: item.amount,
                        })
                      )}
                    />
                  </div>
                )}

                <div className="pt-3 border-t border-border space-y-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Why this number
                  </p>
                  {rules.map((rule) => (
                    <div key={rule.id} className="space-y-0.5">
                      <div className="flex items-baseline gap-2">
                        <span
                          aria-hidden
                          className={`text-xs shrink-0 ${
                            rule.status === "breached"
                              ? "text-amber-400"
                              : rule.status === "check"
                                ? "text-muted-foreground"
                                : "text-primary"
                          }`}
                        >
                          {rule.status === "breached"
                            ? "!"
                            : rule.status === "check"
                              ? "?"
                              : "✓"}
                        </span>
                        <p
                          className={`text-sm font-medium ${
                            rule.status === "breached" ? "text-amber-400" : ""
                          }`}
                        >
                          {rule.title}
                        </p>
                      </div>
                      {rule.evidence && (
                        <p className="text-xs pl-5 text-foreground/80">
                          {rule.evidence}
                        </p>
                      )}
                      <p className="text-xs pl-5 text-muted-foreground">
                        {rule.detail}
                      </p>
                    </div>
                  ))}
                  {turnarounds.length > 0 && (
                    <div className="space-y-1 pl-5">
                      {turnarounds.map((rest) => (
                        <div
                          key={`${rest.from._id}-${rest.to._id}`}
                          className="flex justify-between gap-3 text-xs"
                        >
                          <span className="text-muted-foreground">
                            {shortDate(rest.from.workDate)} →{" "}
                            {shortDate(rest.to.workDate)}
                          </span>
                          <span
                            className={`tabular-nums shrink-0 ${
                              rest.short
                                ? "text-amber-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {rest.hours}h{rest.short ? " · short" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {calculated.length > 1 && (
        <div className="rounded-lg border-2 border-primary bg-primary/5 p-4 flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">
            {calculated.length} weeks
          </span>
          <span className="text-2xl font-bold tabular-nums">
            {formatCurrency(grandTotal)}
          </span>
        </div>
      )}
    </div>
  );
}

/** A plain select styled to sit beside the money and number fields. */
function FieldSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-input dark:bg-input/30 h-9 max-w-[16rem] min-w-0 flex-1 truncate rounded-md border bg-transparent py-1 pl-2 pr-7 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function MoneyInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="relative flex-1 min-w-0 max-w-[10rem]">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        $
      </span>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step="1"
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="pl-7 w-full"
        placeholder="0"
      />
    </div>
  );
}
