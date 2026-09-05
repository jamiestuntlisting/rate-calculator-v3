"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";
import { AGREEMENTS, agreementLabel, dayRate } from "@/lib/agreements";
import { formatCurrency } from "@/lib/time-utils";
import { toDisplay } from "@/components/calculator/time-select";
import {
  reverseDaily,
  type ReverseCandidate,
  type ReverseResult,
  type SearchedRate,
} from "@/lib/reverse-daily";

/**
 * The reverse calculator, for admins: what a check paid, worked back to
 * the day. Each story is a row — the stretches of the day, the
 * adjustment, the penalties, the rate — so the whole picture is read
 * across one line; near misses carry their gap.
 */

const fromLabel = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const rateLabel = (rate: SearchedRate) => `${dayRate(rate.daily)} ${fromLabel(rate.effectiveFrom)}`;

/** "6h", "6.5h", "1.2h". */
const hours = (h: number) => `${Number(h.toFixed(1))}h`;

/** The half-hour meal, as the search takes it. */
const MEAL_HOURS = 0.5;
/** Lunch is due six hours after call. */
const LUNCH_DUE_HOURS = 6;

/**
 * The stretches of a candidate day: call to lunch, then lunch to wrap —
 * split around the second meal when the day took one.
 */
function stretches(c: ReverseCandidate) {
  const toLunch = LUNCH_DUE_HOURS + c.lunchLateHours;
  const afterLunch = c.spanHours - toLunch - MEAL_HOURS;
  if (!c.secondMeal) return { toLunch, afterLunch, toWrap: null as number | null };
  // The second meal is taken six hours after lunch ends.
  const toSecond = 6;
  return { toLunch, afterLunch: toSecond, toWrap: afterLunch - toSecond - MEAL_HOURS };
}

const gap = (diff: number) =>
  Math.abs(diff) < 0.005
    ? "exact"
    : `${diff > 0 ? "+" : "−"}${formatCurrency(Math.abs(diff))}`;

function StoryTable({ rows, withGap }: { rows: ReverseCandidate[]; withGap: boolean }) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Rate</th>
            <th className="py-2 pr-3 font-medium">Call→lunch</th>
            <th className="py-2 pr-3 font-medium">Lunch</th>
            <th className="py-2 pr-3 font-medium">Lunch→wrap</th>
            <th className="py-2 pr-3 font-medium text-right">Worked</th>
            <th className="py-2 pr-3 font-medium text-right">Adjust.</th>
            <th className="py-2 pr-3 font-medium text-right">Penalties</th>
            <th className="py-2 pr-3 font-medium text-right">Total</th>
            {withGap && <th className="py-2 font-medium text-right">Gap</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const s = stretches(c);
            return (
              <tr
                key={`${c.rateDate}-${c.dismissTime}-${c.adjustment}-${c.secondMeal}-${i}`}
                className="border-b border-border/40"
              >
                <td className="py-2 pr-3 whitespace-nowrap">{dayRate(c.baseDaily)} · {fromLabel(c.rateDate)}</td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {hours(s.toLunch)}
                  {c.lunchLateHours ? (
                    <span className="text-amber-300"> ({hours(c.lunchLateHours)} late)</span>
                  ) : null}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {toDisplay(c.lunchStart)}–{toDisplay(c.lunchFinish)}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {s.toWrap === null ? (
                    hours(s.afterLunch)
                  ) : (
                    <>
                      {hours(s.afterLunch)} · 2nd meal · {hours(s.toWrap)}
                    </>
                  )}
                  <span className="text-muted-foreground"> → {toDisplay(c.dismissTime)}</span>
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">{hours(c.workedHours)}</td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {c.adjustment ? `$${c.adjustment.toLocaleString("en-US")}` : "—"}
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  {c.penaltyCount ? `${c.penaltyCount} · ${formatCurrency(c.penalties)}` : "—"}
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap font-medium">{formatCurrency(c.total)}</td>
                {withGap && (
                  <td
                    className={`py-2 text-right whitespace-nowrap ${
                      c.diff > 0 ? "text-blue-300" : "text-amber-300"
                    }`}
                  >
                    {gap(c.diff)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminReversePage() {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [workStatus, setWorkStatus] = useState("theatrical_basic");
  const [result, setResult] = useState<ReverseResult | null>(null);

  // Coordinators on a flat deal have no hours to reverse; everyone else
  // in the pulldown earns overtime like the day performers do.
  const agreements = useMemo(
    () => AGREEMENTS.filter((a) => a.id !== "stunt_coordinator"),
    []
  );

  if (!user || !(user.role === "admin" || isAdminEmail(user.email))) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-muted-foreground">
        Admin access required.{" "}
        <Link href="/" className="underline underline-offset-2">
          Home
        </Link>
      </div>
    );
  }

  const run = () => {
    const target = parseFloat(amount);
    if (!Number.isFinite(target) || target <= 0) {
      setResult(null);
      return;
    }
    setResult(reverseDaily(target, workStatus));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-4">
      <div>
        <h1 className="text-2xl font-bold">Reverse calculator</h1>
        <p className="text-sm text-muted-foreground">
          What a check paid, worked back to the day. Call 6:00 AM; every rate of
          the last two years; adjustments in $100s.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1 min-w-0">
              <Label htmlFor="rev-amount" className="text-base">
                The check paid
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="rev-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") run();
                  }}
                  placeholder="0.00"
                  className="h-12 pl-7 text-lg"
                />
              </div>
            </div>
            <div className="space-y-1 min-w-0">
              <Label htmlFor="rev-agreement" className="text-base">
                Agreement
              </Label>
              <Select value={workStatus} onValueChange={setWorkStatus}>
                <SelectTrigger
                  id="rev-agreement"
                  className="text-lg h-12 data-[size=default]:h-12 w-full min-w-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agreements.map((agreement) => (
                    <SelectItem key={agreement.id} value={agreement.id} className="text-base">
                      {agreementLabel(agreement.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={run} className="w-full sm:w-auto">
            Work backwards
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {result.exact.length
                  ? `Lands on ${formatCurrency(result.target)}`
                  : `Nothing lands on ${formatCurrency(result.target)}`}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Rates searched: {result.rates.map(rateLabel).join(" · ")}.
              </p>
            </CardHeader>
            <CardContent>
              {result.exact.length ? (
                <StoryTable rows={result.exact} withGap={false} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No normal day at any of these rates pays that to the cent. The
                  nearest ones are below with their gap.
                </p>
              )}
            </CardContent>
          </Card>

          {result.close.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Near misses</CardTitle>
              </CardHeader>
              <CardContent>
                <StoryTable rows={result.close} withGap />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
