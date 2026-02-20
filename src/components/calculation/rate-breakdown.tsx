"use client";

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
  TableFooter,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/time-utils";
import type { CalculationBreakdown, ExhibitGInput } from "@/types";

interface RateBreakdownProps {
  breakdown: CalculationBreakdown;
  input?: ExhibitGInput;
  compact?: boolean;
}

export function RateBreakdown({ breakdown, input, compact = false }: RateBreakdownProps) {
  const {
    baseRate,
    adjustedBaseRate,
    adjustedHourlyRate,
    totalWorkHours,
    totalMealTime,
    netWorkHours,
    segments,
    penalties,
    dayMultiplier,
    grandTotal,
  } = breakdown;

  const hasStuntAdj = adjustedBaseRate > baseRate;
  const hasPenalties = penalties.totalPenalties > 0;

  return (
    <div className="space-y-6">
      {/* Grand Total */}
      <Card className="border-2 border-primary">
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Calculated Total</p>
            <p className="text-4xl font-bold tracking-tight">
              {formatCurrency(grandTotal)}
            </p>
            {input && (
              <p className="text-sm text-muted-foreground mt-1">
                {input.showName} &middot; {input.workDate}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Rate Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rate Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Base Daily Rate</p>
              <p className="font-semibold">{formatCurrency(baseRate)}</p>
            </div>
            {hasStuntAdj && (
              <div>
                <p className="text-muted-foreground">+ Stunt Adjustment</p>
                <p className="font-semibold">
                  {formatCurrency(adjustedBaseRate - baseRate)}
                </p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground">
                {hasStuntAdj ? "Adjusted Hourly" : "Hourly Rate"}
              </p>
              <p className="font-semibold">
                {formatCurrency(adjustedHourlyRate)}/hr
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Net Work Hours</p>
              <p className="font-semibold">{netWorkHours}h</p>
            </div>
            {!compact && (
              <>
                <div>
                  <p className="text-muted-foreground">Total Elapsed</p>
                  <p className="font-semibold">{totalWorkHours}h</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Meal Time</p>
                  <p className="font-semibold">{totalMealTime}h</p>
                </div>
              </>
            )}
          </div>

          {dayMultiplier.applied && (
            <div className="mt-3">
              <Badge variant="secondary">
                {dayMultiplier.type === "6th_day"
                  ? "6th Consecutive Day (1.5x)"
                  : dayMultiplier.type === "7th_day"
                    ? "7th Consecutive Day (2.0x)"
                    : "Holiday (2.0x)"}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Time Segments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Time Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segment</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Multiplier</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((seg, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{seg.label}</TableCell>
                  <TableCell className="text-right">{Number(seg.hours.toFixed(1))}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(seg.rate)}
                  </TableCell>
                  <TableCell className="text-right">{seg.multiplier}x</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(seg.subtotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="font-semibold">
                  Time Total
                </TableCell>
                <TableCell className="text-right font-bold">
                  {formatCurrency(
                    segments.reduce((sum, s) => sum + s.subtotal, 0)
                  )}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {/* Penalties */}
      {hasPenalties && (() => {
        // Group meal penalties by meal type for simplified display
        const mealTotals = penalties.mealPenalties.reduce<Record<string, number>>((acc, mp) => {
          acc[mp.meal] = (acc[mp.meal] || 0) + mp.amount;
          return acc;
        }, {});

        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Penalties</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Penalty</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(mealTotals).map(([meal, total]) => (
                    <TableRow key={meal}>
                      <TableCell className="font-medium">
                        {meal} Penalty
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(total)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {penalties.forcedCallPenalty > 0 && (
                    <TableRow>
                      <TableCell className="font-medium">
                        Forced Call Penalty
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(penalties.forcedCallPenalty)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">
                      Penalties Total
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(penalties.totalPenalties)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        );
      })()}

      {!compact && (
        <>
          <Separator />
          {/* Final Summary */}
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Time Earnings</span>
                <span className="font-semibold">
                  {formatCurrency(
                    segments.reduce((sum, s) => sum + s.subtotal, 0)
                  )}
                </span>
              </div>
              {hasPenalties && (
                <div className="flex justify-between">
                  <span>Penalties</span>
                  <span className="font-semibold">
                    + {formatCurrency(penalties.totalPenalties)}
                  </span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Grand Total</span>
                <span>{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
