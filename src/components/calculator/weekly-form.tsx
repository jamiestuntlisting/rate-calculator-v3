"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { CollapsibleSection } from "@/components/calculator/collapsible-section";
import { formatCurrency } from "@/lib/time-utils";
import {
  calculateWeekly,
  OVERTIME_ABSORPTION_NOTE,
  type WeeklyExtra,
  type WeeklyInput,
} from "@/lib/weekly/weekly-engine";
import {
  CURRENT_WEEKLY_SCALE,
  WEEKLY_SCALE_OPTIONS,
} from "@/lib/weekly/weekly-rates";
import {
  groupRecordsForWeekly,
  MIN_DAYS_FOR_WEEKLY,
  workRecordsToWeeklyInput,
  type WeeklyDerivation,
} from "@/lib/weekly/from-work-records";
import type { WorkRecord } from "@/types";
import { Loader2, CalendarRange } from "lucide-react";
import { toast } from "sonner";

const EXTRA_OPTIONS: Array<{ value: WeeklyExtra; label: string; hint: string }> =
  [
    { value: null, label: "None", hint: "" },
    {
      value: "loc_allowance",
      label: "Location allowance",
      hint: "The 4 hours by which a 48-hour Distant guarantee exceeds the 44 the weekly rate buys.",
    },
    {
      value: "holiday",
      label: "Holiday",
      hint: "One extra day at scale.",
    },
  ];

const EMPTY: WeeklyInput = {
  scaleWeeklyRate: 0,
  contractWeeklyRate: 0,
  daysWorked: 5,
  holidayDays: 0,
  adjustments: 0,
  dailyOvertimeHours: 0,
  doubleTimeHours: 0,
  penaltyOvertimeHours: 0,
  weeklyOvertimeHours: 0,
  extra: null,
  sixthDay: false,
  seventhDay: false,
  postSubtotalAdjustments: 0,
};

const money = (n: number) => formatCurrency(n);

interface WeekGroup {
  showName: string;
  records: WorkRecord[];
}

/** "24–28 Aug 2026", or the single date when a week is one day long. */
function dateRange(records: WorkRecord[]): string {
  const dates = records.map((r) => r.workDate).sort();
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const first = fmt(dates[0]);
  const last = fmt(dates[dates.length - 1]);
  return first === last ? first : `${first} – ${last}`;
}

export function WeeklyForm() {
  const [input, setInput] = useState<WeeklyInput>(EMPTY);
  const [groups, setGroups] = useState<WeekGroup[] | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [builtFrom, setBuiltFrom] = useState<
    { showName: string; derivation: WeeklyDerivation } | null
  >(null);

  const update = <K extends keyof WeeklyInput>(key: K, value: WeeklyInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const ready = input.scaleWeeklyRate > 0 && input.contractWeeklyRate > 0;

  // A weekly contract is what five or more days on the same show add up to,
  // so the days already in the Tracker are the natural way in.
  const loadGroups = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/work-records?limit=200&sort=workDate&order=desc"
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { records: WorkRecord[] };
      const sag = data.records.filter((r) => r.workType !== "other");
      setGroups(groupRecordsForWeekly(sag));
    } catch {
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const buildFrom = (group: WeekGroup) => {
    const scale = input.scaleWeeklyRate || CURRENT_WEEKLY_SCALE;
    const { input: derived, derivation } = workRecordsToWeeklyInput(
      group.records,
      {
        scaleWeeklyRate: scale,
        // Someone on scale has the same number twice; anyone over-scale
        // corrects it in the field right below.
        contractWeeklyRate: input.contractWeeklyRate || scale,
      }
    );
    setInput(derived);
    setBuiltFrom({ showName: group.showName, derivation });
    toast.success(`Built from ${derivation.days} days on ${group.showName}`);
  };

  const breakdown = useMemo(() => {
    if (!ready) return null;
    try {
      return calculateWeekly(input);
    } catch {
      return null;
    }
  }, [input, ready]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {(loadingGroups || (groups && groups.length > 0) || builtFrom) && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div>
            <h2 className="font-semibold text-lg">Build it from your days</h2>
            <p className="text-sm text-muted-foreground">
              {MIN_DAYS_FOR_WEEKLY} or more days on the same show make a
              weekly contract. Pick a run and the week fills itself in.
            </p>
          </div>

          {loadingGroups ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Looking through your work days…
            </div>
          ) : (
            <div className="space-y-2">
              {groups?.map((group) => (
                <button
                  key={`${group.showName}-${group.records[0]._id}`}
                  type="button"
                  onClick={() => buildFrom(group)}
                  className="w-full text-left p-3 rounded-lg border border-border/60 hover:border-primary/60 hover:bg-accent/30 transition-colors flex items-center gap-3"
                >
                  <CalendarRange className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">
                      {group.showName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {group.records.length} days · {dateRange(group.records)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {builtFrom && (
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1">
              <p className="text-sm font-medium">
                Filled in from {builtFrom.derivation.days} days on{" "}
                {builtFrom.showName}
              </p>
              <p className="text-xs text-muted-foreground">
                {builtFrom.derivation.dailyOvertimeHours}h at 1.5× and{" "}
                {builtFrom.derivation.doubleTimeHours}h at 2× off those days,
                {" "}
                {money(builtFrom.derivation.adjustments)} in stunt adjustments
                and {money(builtFrom.derivation.mealPenalties)} of meal
                penalties. Check the rates below, then anything the days
                cannot know — weekly overtime and location allowance.
              </p>
              {builtFrom.derivation.daysWithoutCalculation > 0 && (
                <p className="text-xs text-amber-400">
                  {builtFrom.derivation.daysWithoutCalculation} of those days
                  has no times entered yet, so its overtime is not counted
                  here and the total is low.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border p-4 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Rates</h2>
          <p className="text-sm text-muted-foreground">
            Both come off your contract. Overtime is paid on whichever is
            lower, so they are not interchangeable.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="scaleWeeklyRate" className="text-base">
            Weekly scale rate
          </Label>
          <MoneyInput
            id="scaleWeeklyRate"
            value={input.scaleWeeklyRate}
            onChange={(v) => update("scaleWeeklyRate", v)}
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {WEEKLY_SCALE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => update("scaleWeeklyRate", option.rate)}
                aria-pressed={input.scaleWeeklyRate === option.rate}
                className={`text-xs rounded px-3 py-1.5 border transition-colors ${
                  input.scaleWeeklyRate === option.rate
                    ? "border-foreground/40 text-foreground"
                    : "border-border/40 text-muted-foreground hover:bg-accent/50"
                }`}
              >
                {option.label}
                <span className="text-muted-foreground">
                  {" "}
                  · ${option.rate.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {WEEKLY_SCALE_OPTIONS.find(
              (o) => o.rate === input.scaleWeeklyRate
            )?.note ??
              "A production that started under the last agreement stays on it, so check which one your contract names."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="contractWeeklyRate" className="text-base">
            Contract weekly rate
          </Label>
          <MoneyInput
            id="contractWeeklyRate"
            value={input.contractWeeklyRate}
            onChange={(v) => update("contractWeeklyRate", v)}
          />
          <p className="text-xs text-muted-foreground">
            What you negotiated. If you are on scale, the same number again.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-4">
        <h2 className="font-semibold text-lg">The week</h2>

        <div className="space-y-2">
          <Label htmlFor="daysWorked" className="text-base">
            Days on the card
          </Label>
          <Input
            id="daysWorked"
            type="number"
            inputMode="numeric"
            min="0"
            max="7"
            step="1"
            value={input.daysWorked || ""}
            onChange={(e) => update("daysWorked", parseFloat(e.target.value) || 0)}
            className="w-28"
            placeholder="5"
          />
          <p className="text-xs text-muted-foreground">
            Including hold, rehearsal and travel days. Days beyond the fifth
            are paid as the premiums below, not as more base.
          </p>
        </div>

        {/* Independent: a 7th day is flagged without a 6th on real cards. */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="sixthDay"
              checked={input.sixthDay}
              onCheckedChange={(v) => update("sixthDay", !!v)}
            />
            <Label htmlFor="sixthDay" className="text-base font-normal">
              6th consecutive day
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="seventhDay"
              checked={input.seventhDay}
              onCheckedChange={(v) => update("seventhDay", !!v)}
            />
            <Label htmlFor="seventhDay" className="text-base font-normal">
              7th consecutive day
            </Label>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="holidayDays" className="text-base">
            Worked holidays
          </Label>
          <Input
            id="holidayDays"
            type="number"
            inputMode="numeric"
            min="0"
            max="7"
            step="1"
            value={input.holidayDays || ""}
            onChange={(e) =>
              update("holidayDays", parseFloat(e.target.value) || 0)
            }
            className="w-28"
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground">
            Each one adds a day at scale to the base.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Overtime</h2>
          <p className="text-sm text-muted-foreground">
            Hours, not money. Every bucket is paid on a 44th of the weekly
            rate — including a 48-hour Distant week.
          </p>
        </div>

        <HoursInput
          id="dailyOvertimeHours"
          label="Daily overtime"
          hint="Hours past the day's guarantee, at 1.5×."
          value={input.dailyOvertimeHours ?? 0}
          onChange={(v) => update("dailyOvertimeHours", v)}
        />
        <HoursInput
          id="doubleTimeHours"
          label="Double time"
          hint="At 2×. Never absorbed by over-scale pay."
          value={input.doubleTimeHours ?? 0}
          onChange={(v) => update("doubleTimeHours", v)}
        />
        <HoursInput
          id="penaltyOvertimeHours"
          label="Penalty overtime"
          hint="Hours carried by penalties, at 1.5×."
          value={input.penaltyOvertimeHours ?? 0}
          onChange={(v) => update("penaltyOvertimeHours", v)}
        />
        <HoursInput
          id="weeklyOvertimeHours"
          label="Weekly overtime"
          hint="Hours past the weekly guarantee, at 1.5×."
          value={input.weeklyOvertimeHours ?? 0}
          onChange={(v) => update("weeklyOvertimeHours", v)}
        />
      </div>

      <CollapsibleSection
        title="Adjustments and allowances"
        summary={
          (input.adjustments ?? 0) > 0 ||
          (input.postSubtotalAdjustments ?? 0) > 0 ||
          input.extra
            ? "Set"
            : "Stunt adjustments, allowances, meal penalties"
        }
      >
        <div className="space-y-2">
          <Label htmlFor="adjustments" className="text-base">
            Stunt adjustments
          </Label>
          <MoneyInput
            id="adjustments"
            value={input.adjustments ?? 0}
            onChange={(v) => update("adjustments", v)}
          />
          <p className="text-xs text-muted-foreground">
            The week&apos;s total. These raise the overtime rate and the
            6th/7th-day premiums.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-base">Extra</Label>
          <div className="flex flex-wrap gap-1.5">
            {EXTRA_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => update("extra", option.value)}
                aria-pressed={input.extra === option.value}
                className={`text-xs rounded px-3 py-1.5 border transition-colors ${
                  input.extra === option.value
                    ? "border-foreground/40 text-foreground"
                    : "border-border/40 text-muted-foreground hover:bg-accent/50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {EXTRA_OPTIONS.find((o) => o.value === input.extra)?.hint && (
            <p className="text-xs text-muted-foreground">
              {EXTRA_OPTIONS.find((o) => o.value === input.extra)?.hint}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="postSubtotalAdjustments" className="text-base">
            Added after the subtotal
          </Label>
          <MoneyInput
            id="postSubtotalAdjustments"
            value={input.postSubtotalAdjustments ?? 0}
            onChange={(v) => update("postSubtotalAdjustments", v)}
          />
          <p className="text-xs text-muted-foreground">
            Allowances and meal penalties. These do not affect the overtime
            rate — a different number from the stunt adjustments above.
          </p>
        </div>
      </CollapsibleSection>

      <Separator />

      {breakdown ? (
        <div className="space-y-4">
          <div className="rounded-lg border-2 border-primary bg-primary/5 p-4 text-center">
            <p className="text-sm text-muted-foreground">Week total</p>
            <p className="text-3xl font-bold tracking-tight tabular-nums">
              {formatCurrency(breakdown.grandTotal)}
            </p>
            <div className="flex justify-center flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span>{formatCurrency(breakdown.hourlyRate)}/hr overtime</span>
              <span>{formatCurrency(breakdown.dailyRate)}/day</span>
              {breakdown.prorationFactor !== 1 && (
                <span>base × {breakdown.prorationFactor.toFixed(2)}</span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border p-4 space-y-2">
            <h2 className="font-semibold text-lg">Breakdown</h2>
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

            <div className="flex justify-between gap-3 text-sm pt-2 border-t border-border">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums shrink-0">
                {formatCurrency(breakdown.subtotal)}
              </span>
            </div>
            {breakdown.postSubtotalAdjustments !== 0 && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  Added after the subtotal
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

          {breakdown.overtimeAbsorbed && (
            <div className="rounded-lg bg-amber-950/30 border border-amber-700/50 p-3 space-y-1">
              <p className="text-sm font-medium text-amber-300">
                Weekly overtime absorbed
              </p>
              <p className="text-xs text-amber-200/80">
                Your over-scale pay covers{" "}
                {formatCurrency(breakdown.absorbedOvertime)} of weekly
                overtime, so it is not paid on top. Double time is never
                absorbed.
              </p>
              <p className="text-xs text-amber-200/60">
                {OVERTIME_ABSORPTION_NOTE}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Enter a scale rate and a contract rate to see the week.
          </p>
        </div>
      )}
    </div>
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
    <div className="relative w-44">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        $
      </span>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="pl-7"
        placeholder="0.00"
      />
    </div>
  );
}

function HoursInput({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-base font-normal">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.1"
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-24 shrink-0"
        placeholder="0"
      />
    </div>
  );
}
