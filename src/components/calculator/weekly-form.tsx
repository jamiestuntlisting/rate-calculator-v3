"use client";

import { useMemo, useState } from "react";
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

/**
 * Weekly scale rates seen on real cards. The applicable rate is an input,
 * not something a date implies — 2021 cards carry both $3,936 and $3,955
 * for overlapping weeks, because productions sit on different Basic
 * Agreement years. These are a shortcut for typing, never a default.
 */
const OBSERVED_SCALE_RATES: Array<{ rate: number; seen: string }> = [
  { rate: 3936, seen: "2021" },
  { rate: 3955, seen: "2021" },
  { rate: 4034, seen: "2023" },
  { rate: 4489, seen: "2024–25" },
  { rate: 4478, seen: "2026" },
  { rate: 4646, seen: "2026" },
];

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

export function WeeklyForm() {
  const [input, setInput] = useState<WeeklyInput>(EMPTY);

  const update = <K extends keyof WeeklyInput>(key: K, value: WeeklyInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const ready = input.scaleWeeklyRate > 0 && input.contractWeeklyRate > 0;

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
            {OBSERVED_SCALE_RATES.map(({ rate, seen }) => (
              <button
                key={`${rate}-${seen}`}
                type="button"
                onClick={() => update("scaleWeeklyRate", rate)}
                aria-pressed={input.scaleWeeklyRate === rate}
                className={`text-xs rounded px-2 py-1 border transition-colors ${
                  input.scaleWeeklyRate === rate
                    ? "border-foreground/40 text-foreground"
                    : "border-border/40 text-muted-foreground hover:bg-accent/50"
                }`}
              >
                ${rate.toLocaleString()}
                <span className="text-muted-foreground"> · {seen}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Rates seen on real cards, as a shortcut for typing. Two
            productions can be on different rates in the same week — check it
            against your contract.
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
