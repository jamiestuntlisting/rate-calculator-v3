"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  type CommonPayments,
  type ReverseCandidate,
  type ReverseResult,
  type SearchedRate,
} from "@/lib/reverse-daily";

/**
 * The reverse calculator: paste in what a check paid, and the search
 * runs normal day shapes through the real engine until some of them land
 * on that figure — the fastest way to see how a rate was probably worked
 * out, and therefore where it was worked out wrong. No date is asked:
 * every rate in force in the last two years is searched, and a match
 * names its rate.
 */

const fromLabel = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

const rateLabel = (rate: SearchedRate) =>
  `${dayRate(rate.daily)} from ${fromLabel(rate.effectiveFrom)}`;

/** Whole dollars where the figure has none — the grid is dense. */
const gridMoney = (n: number) =>
  Number.isFinite(n)
    ? `$${n.toLocaleString("en-US", {
        minimumFractionDigits: Math.round(n * 100) % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      })}`
    : "—";

/** One candidate day, told as a sentence. */
function shapeStory(candidate: ReverseCandidate): string {
  const pieces = [
    `${candidate.workedHours}h worked`,
    `call 6:00 AM`,
    `lunch ${toDisplay(candidate.lunchStart)}–${toDisplay(candidate.lunchFinish)}${
      candidate.lunchLateHours
        ? ` (${candidate.lunchLateHours}h late)`
        : ""
    }`,
  ];
  if (candidate.secondMeal && candidate.secondMealStart && candidate.secondMealFinish) {
    pieces.push(
      `2nd meal ${toDisplay(candidate.secondMealStart)}–${toDisplay(candidate.secondMealFinish)}`
    );
  }
  pieces.push(`dismissed ${toDisplay(candidate.dismissTime)}`);
  pieces.push(
    candidate.adjustment
      ? `$${candidate.adjustment} stunt adjustment`
      : "no stunt adjustment"
  );
  pieces.push(
    candidate.penalties
      ? `${formatCurrency(candidate.penalties)} meal penalties`
      : "no meal penalties"
  );
  pieces.push(`at the ${dayRate(candidate.baseDaily)} rate (${fromLabel(candidate.rateDate)})`);
  return pieces.join(", ");
}

function CommonGrid({ grid, target }: { grid: CommonPayments; target: number }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{rateLabel(grid.rate)}</p>
      <div className="overflow-x-auto">
        {/* Five columns fit a 390px phone at the small size; the wrapper
            scrolls sideways rather than the page if a figure runs long. */}
        <table className="min-w-full text-xs sm:text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[10px] sm:text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
              <th className="py-1 pr-2 font-medium">Worked</th>
              {grid.adjustments.map((adj, i) => (
                <th
                  key={adj}
                  className={`py-1 px-1.5 sm:px-2 text-right font-medium whitespace-nowrap${
                    i === grid.adjustments.length - 1 ? " hidden sm:table-cell" : ""
                  }`}
                >
                  {adj ? `+$${adj}` : "scale"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.workedHours} className="border-b border-border/30">
                <td className="py-1 pr-2 text-muted-foreground">{row.workedHours}h</td>
                {row.totals.map((total, i) => {
                  const exact = Math.abs(total - target) < 0.005;
                  const nearest =
                    grid.nearest &&
                    grid.nearest.workedHours === row.workedHours &&
                    grid.nearest.adjustment === grid.adjustments[i];
                  return (
                    <td
                      key={grid.adjustments[i]}
                      // The widest adjustment column waits for a wider screen.
                      className={`py-1 px-1.5 sm:px-2 text-right whitespace-nowrap ${
                        i === row.totals.length - 1 ? "hidden sm:table-cell " : ""
                      }${
                        exact
                          ? "rounded bg-green-900/40 font-semibold text-green-300"
                          : nearest
                            ? "rounded bg-amber-900/30 font-medium text-amber-200"
                            : ""
                      }`}
                    >
                      {gridMoney(total)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    <div className="max-w-3xl mx-auto space-y-6 px-4">
      <div>
        <h1 className="text-2xl font-bold">Reverse calculator</h1>
        <p className="text-sm text-muted-foreground">
          Start from what a check paid and work backwards to the day. The
          search runs normal dailies through the engine at every rate in
          force in the last two years — call at 6:00 AM, lunch six hours in
          or late by each half hour up to two, the day running eight to
          sixteen hours in six-minute steps, a stunt adjustment up to $1,000
          in $50 steps, with and without a second meal — and reports the
          shapes that land on the number, or the closest ones when nothing
          does.
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
                    <SelectItem
                      key={agreement.id}
                      value={agreement.id}
                      className="text-base"
                    >
                      {agreementLabel(agreement.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Today&rsquo;s rate; every rate of the last two years is searched.
              </p>
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
                The obvious checks first
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                At the current rate, {rateLabel(result.rates[0])}. Rates
                searched:{" "}
                {result.rates.map((r) => rateLabel(r)).join("; ")}.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {result.obvious.map((check) => (
                <div
                  key={check.label}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-border/30 pb-2 text-sm"
                >
                  {/* The sentence takes the whole line on a phone and the
                      money sits under it; side by side once there is room. */}
                  <span className="basis-full sm:basis-auto sm:min-w-0 sm:flex-1">
                    {check.label}
                  </span>
                  <span className="tabular-nums font-medium">
                    {formatCurrency(check.total)}
                  </span>
                  <span
                    className={`w-28 text-right tabular-nums text-xs ${
                      Math.abs(check.diff) < 0.005
                        ? "text-green-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {Math.abs(check.diff) < 0.005
                      ? "the check exactly"
                      : check.diff > 0
                        ? `${formatCurrency(check.diff)} over`
                        : `${formatCurrency(-check.diff)} under`}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {result.exact.length
                  ? `Days that pay ${formatCurrency(result.target)} exactly`
                  : `Nothing lands on ${formatCurrency(result.target)} exactly`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {result.exact.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No normal day shape at any of the rates searched produces
                  that figure to the cent — the near misses below say how far
                  off the closest ones are, and the gap itself is often the
                  finding (a missing adjustment, a penalty paid or skipped, a
                  day paid at last year&rsquo;s rate).
                </p>
              )}
              {result.exact.map((candidate, i) => (
                <div
                  key={`${candidate.rateDate}-${candidate.dismissTime}-${candidate.adjustment}-${i}`}
                  className="rounded-lg border border-green-700/50 bg-green-900/20 p-3 text-sm"
                >
                  <p className="font-medium text-green-300">
                    {formatCurrency(candidate.total)} — the check exactly
                  </p>
                  <p className="text-muted-foreground">{shapeStory(candidate)}</p>
                  {candidate.workedHours <= 8 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Any day up to eight worked hours pays this same
                      guarantee minimum, so the hours here are one example.
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {result.close.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {result.exact.length ? "Near misses" : "The closest days"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.close.map((candidate, i) => (
                  <div
                    key={`${candidate.rateDate}-${candidate.dismissTime}-${candidate.adjustment}-${candidate.secondMeal}-${i}`}
                    className="rounded-lg border border-border p-3 text-sm"
                  >
                    <p className="font-medium">
                      {formatCurrency(candidate.total)}{" "}
                      <span
                        className={
                          candidate.diff > 0 ? "text-blue-300" : "text-amber-300"
                        }
                      >
                        — {formatCurrency(Math.abs(candidate.diff))}{" "}
                        {candidate.diff > 0 ? "more than" : "less than"} the
                        check
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      {shapeStory(candidate)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">What a normal day pays</CardTitle>
              <p className="text-xs text-muted-foreground">
                The finite table most checks are on somewhere: whole hours
                worked, meals on time, no penalties, the usual stunt
                adjustments across the top. Green is the check exactly;
                amber is the nearest cell at that rate.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {result.common.map((grid) => (
                <CommonGrid key={grid.rate.effectiveFrom} grid={grid} target={result.target} />
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
