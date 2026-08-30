"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";
import { RATE_SCHEDULES } from "@/lib/rate-constants";

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

const fromLabel = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

const ROWS: Array<{
  label: string;
  cell: (c: (typeof RATE_SCHEDULES)[number]["cells"]) => number;
}> = [
  { label: "Day performer · daily", cell: (c) => c.basicDaily },
  { label: "Day performer · weekly", cell: (c) => c.basicWeekly },
  { label: "Coordinator flat deal · daily", cell: (c) => c.coordFlatDaily },
  { label: "Coordinator flat deal · weekly", cell: (c) => c.coordFlatWeekly },
  { label: "Coordinator (less than flat) · daily", cell: (c) => c.coordDailyDaily },
  { label: "Coordinator (less than flat) · weekly", cell: (c) => c.coordDailyWeekly },
];

/**
 * The rate schedules the calculator runs on, by effective date. Every
 * work day is priced by the schedule in force on its date, so this table
 * is the whole answer to "what rate did that day use".
 */
export default function AdminRatesPage() {
  const { user } = useAuth();
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

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Rate schedules</h1>
        <p className="text-sm text-muted-foreground mt-1">
          A work day is priced by the schedule in force on its date — rates
          change each July 1. The low budget tiers are not listed because
          they are written as percentages of the day performer row (65% /
          35% / 20%) and derive from whichever year applies.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Schedules the calculator knows
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-max text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 font-medium">Rate</th>
                  {RATE_SCHEDULES.map((s) => (
                    <th key={s.effectiveFrom} className="py-2 px-3 font-medium">
                      <span className="block">
                        From {fromLabel(s.effectiveFrom)}
                      </span>
                      <span
                        className={`mt-0.5 inline-block rounded border px-1 py-0.5 text-[10px] normal-case tracking-normal ${
                          s.source === "wage tables"
                            ? "border-green-700/50 text-green-300"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {s.source === "wage tables"
                          ? "verified tables"
                          : "scheduled 3%"}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-border/40">
                    <td className="py-2 pr-4">{row.label}</td>
                    {RATE_SCHEDULES.map((s) => (
                      <td
                        key={s.effectiveFrom}
                        className="py-2 px-3 tabular-nums"
                      >
                        {fmt(row.cell(s.cells))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3 text-sm text-muted-foreground">
          <p>
            <span className="text-foreground font-medium">
              Before Jul 1, 2025:
            </span>{" "}
            the earliest schedule above applies. The app never guesses a
            rate, so older years stay at the 2025 figures until the real
            wage tables for those years are added — ask Claude to load them
            when you have the tables in hand.
          </p>
          <p>
            <span className="text-foreground font-medium">
              &ldquo;Scheduled 3%&rdquo; columns
            </span>{" "}
            carry the 2026-30 agreement&rsquo;s contractual raises. Most cells
            match the published five-year ladders; confirm against the
            posted table each July in case a figure rounds differently.
          </p>
          <p>
            The 11/9/2023 mid-year increase (the strike year) is the known
            exception to the July 1 rhythm — it matters once pre-2025
            schedules are loaded.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
