"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/time-utils";
import {
  calculateWeekly,
  type WeeklyBreakdown,
  type WeeklyExtra,
} from "@/lib/weekly/weekly-engine";
import { CURRENT_WEEKLY_SCALE } from "@/lib/weekly/weekly-rates";
import { workRecordsToWeeklyInput } from "@/lib/weekly/from-work-records";
import {
  DEFAULT_WEEK_STARTS_ON,
  WEEK_DAY_NAMES,
  groupIntoWeeks,
  weekLabel,
  type WeekStartDay,
} from "@/lib/weekly/weeks";
import {
  DEFAULT_TURNAROUND_HOURS,
  turnaroundsFor,
} from "@/lib/weekly/turnaround";
import type { WorkRecord } from "@/types";
import { PayStubSection } from "@/components/shared/pay-stub-section";
import type { PayStubLine } from "@/lib/pay-stub";
import { useAuth } from "@/context/auth-context";

/**
 * The one thing left that a week's days cannot imply. Location allowance
 * and holiday are properties of that week, not of the deal, so they stay
 * here rather than moving up with the rates.
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

export function WeeklyForm() {
  const { user } = useAuth();
  // RATES is `as const`, so the literal type has to be widened to stay editable.
  const [scaleWeeklyRate, setScaleWeeklyRate] = useState<number>(
    CURRENT_WEEKLY_SCALE
  );
  const [contractWeeklyRate, setContractWeeklyRate] = useState<number>(
    CURRENT_WEEKLY_SCALE
  );
  const [records, setRecords] = useState<WorkRecord[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, WeekOverride>>({});
  /**
   * Weekly overtime is a term of the deal, not a sum of the hours worked.
   * Across 133 real cards, 32 were paid exactly 6.00 hours of it on weeks
   * totalling 35, 40, 48 and 56 hours — the figure does not move with the
   * work. So it is asked for once, with the rates, and applies to each week.
   */
  const [weeklyOvertimeHours, setWeeklyOvertimeHours] = useState(0);
  /**
   * Which day the production runs its payroll week from. Monday is the
   * common one, but it is a term of the deal rather than a rule, and a
   * week split on the wrong day misstates every guarantee in it.
   */
  const [weekStartsOn, setWeekStartsOn] =
    useState<WeekStartDay>(DEFAULT_WEEK_STARTS_ON);
  const [turnaroundHours, setTurnaroundHours] = useState(
    DEFAULT_TURNAROUND_HOURS
  );
  const [openWeek, setOpenWeek] = useState<string | null>(null);

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

  const ready = scaleWeeklyRate > 0 && contractWeeklyRate > 0;

  /** One calculation per week — a run across three weeks is three contracts. */
  const calculated = useMemo(
    () =>
      weeks.map((week) => {
        const override = overrides[week.start] ?? NO_OVERRIDE;
        const { input, derivation } = workRecordsToWeeklyInput(week.records, {
          scaleWeeklyRate,
          contractWeeklyRate,
        });
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
        return { week, derivation, breakdown, override, turnarounds };
      }),
    [
      weeks,
      overrides,
      scaleWeeklyRate,
      contractWeeklyRate,
      ready,
      weeklyOvertimeHours,
      turnaroundHours,
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="scaleWeeklyRate" className="text-base shrink-0">
            Weekly scale
          </Label>
          <MoneyInput
            id="scaleWeeklyRate"
            value={scaleWeeklyRate}
            onChange={setScaleWeeklyRate}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="contractWeeklyRate" className="text-base shrink-0">
            Contract rate
          </Label>
          <MoneyInput
            id="contractWeeklyRate"
            value={contractWeeklyRate}
            onChange={setContractWeeklyRate}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="weeklyOvertimeHours" className="text-base shrink-0">
            Weekly OT (hrs)
          </Label>
          <PlainNumber
            id="weeklyOvertimeHours"
            value={weeklyOvertimeHours}
            onChange={setWeeklyOvertimeHours}
            step="0.1"
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="turnaroundHours" className="text-base shrink-0">
            Turnaround (hrs)
          </Label>
          <PlainNumber
            id="turnaroundHours"
            value={turnaroundHours}
            onChange={setTurnaroundHours}
            step="0.5"
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="weekStartsOn" className="text-base shrink-0">
            Week starts
          </Label>
          <select
            id="weekStartsOn"
            value={weekStartsOn}
            onChange={(e) =>
              setWeekStartsOn(Number(e.target.value) as WeekStartDay)
            }
            className="border-input dark:bg-input/30 h-9 w-[10rem] shrink-0 rounded-md border bg-transparent px-3 py-1 text-center text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
          >
            {WEEK_DAY_NAMES.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="font-semibold text-lg">Days this covers</h2>

        {records === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your days…
          </div>
        ) : records.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No work days yet.{" "}
            <Link href="/" className="underline">
              Add one
            </Link>{" "}
            and it will show up here.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
            {records.map((record) => (
              <label
                key={record._id}
                className="flex items-center gap-3 p-2 rounded hover:bg-accent/40 cursor-pointer"
              >
                <Checkbox
                  checked={picked.has(record._id)}
                  onCheckedChange={() => toggle(record._id)}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm">
                    {shortDate(record.workDate)}
                  </span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {record.showName || "—"}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {calculated.map(({ week, derivation, breakdown, override, turnarounds }) => {
        const open = openWeek === week.start;
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
                  {weekLabel(week.start)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {week.records.length} day
                  {week.records.length === 1 ? "" : "s"}
                </span>
              </span>
              <span className="text-lg font-semibold tabular-nums shrink-0">
                {breakdown ? formatCurrency(breakdown.grandTotal) : "—"}
              </span>
            </button>

            {open && (
              <div className="border-t border-border p-4 space-y-4">
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
                    Enter a scale and contract rate above to work this week out.
                  </p>
                )}

                {breakdown && (
                  <div className="pt-3 border-t border-border space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Pay stub for this week
                    </p>
                    <PayStubSection
                      scope="week"
                      weekStart={week.start}
                      showName={week.records[0]?.showName || "this production"}
                      owed={breakdown.grandTotal}
                      performerName={
                        user
                          ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
                            user.email
                          : "This performer"
                      }
                      period={weekLabel(week.start).toLowerCase()}
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

                {turnarounds.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-border">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Turnaround
                    </p>
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
                            rest.short ? "text-amber-400" : "text-muted-foreground"
                          }`}
                        >
                          {rest.hours}h{rest.short ? " · short" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {derivation.daysWithoutCalculation > 0 && (
                  <p className="text-xs text-amber-400">
                    {derivation.daysWithoutCalculation} of these days has no
                    times entered, so its overtime is not counted here.
                  </p>
                )}
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

function PlainNumber({
  id,
  value,
  onChange,
  step,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
  step: string;
}) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      min="0"
      step={step}
      value={value || ""}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-[10rem] shrink-0 text-center"
      placeholder="0"
    />
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
