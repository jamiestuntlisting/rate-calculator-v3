"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";
import { decodeShowbizFile, isWeeklyCard, parseShowbizCsv } from "@/lib/showbiz";
import { SHOWBIZ_SAMPLE } from "@/lib/showbiz-sample-meta";
import {
  checkWeeklyCards,
  type WeeklyCardCheck,
  type WeeklyCheckSummary,
} from "@/lib/weekly/from-showbiz";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Signed, so it reads as "we are $2.10 over" rather than just a size. */
function signedMoney(n: number): string {
  if (n === 0) return "—";
  return `${n > 0 ? "+" : "−"}${money.format(Math.abs(n))}`;
}

interface RunResult extends WeeklyCheckSummary {
  fileName: string;
  /** Cards in the file that are not weekly, so none go missing quietly. */
  skipped: number;
  /** The bundled reference export rather than one the admin picked. */
  isSample: boolean;
}

export default function WeeklyBenchPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  /** The CSV text currently loaded, so it can be made the default. */
  const [loadedCsv, setLoadedCsv] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  /** Run one export's text through the engine, whatever it came from. */
  const runText = useCallback(
    (text: string, fileName: string, isSample: boolean) => {
      setLoadedCsv(text);
      const all = parseShowbizCsv(text);
      if (all.length === 0) {
        toast.error("No cards found — is that a SAG Cards export?");
        setResult(null);
        return;
      }

      const weekly = all.filter(isWeeklyCard);
      setResult({
        ...checkWeeklyCards(weekly),
        fileName,
        skipped: all.length - weekly.length,
        isSample,
      });
      setOnlyDifferences(false);
    },
    []
  );

  /**
   * The reference export runs on arrival, so the bench always has something
   * in it — a regression in the weekly engine is visible without anyone
   * having to go and find a CSV first.
   */
  const loadSample = useCallback(async () => {
    setRunning(true);
    setExpanded(null);
    try {
      const res = await fetch("/api/admin/showbiz-sample");
      if (!res.ok) {
        // Nothing stored yet — the bench just waits for a file.
        if (res.status === 404) return;
        throw new Error();
      }
      const name =
        res.headers.get("X-Export-Filename") || SHOWBIZ_SAMPLE.filename;
      runText(await res.text(), name, true);
    } catch (error) {
      console.error("weekly bench sample error:", error);
      toast.error("Couldn't load the reference export");
    } finally {
      setRunning(false);
    }
  }, [runText]);

  useEffect(() => {
    loadSample();
  }, [loadSample]);

  /** Keep this export as the one the bench opens with from now on. */
  const saveAsDefault = async () => {
    if (!loadedCsv || !result) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/showbiz-sample", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: loadedCsv, filename: result.fileName }),
      });
      if (!res.ok) throw new Error();
      setResult((prev) => (prev ? { ...prev, isSample: true } : prev));
      toast.success("Saved as the reference export");
    } catch {
      toast.error("Couldn't save that as the default");
    } finally {
      setSaving(false);
    }
  };

  const run = async (file: File) => {
    setRunning(true);
    setExpanded(null);
    try {
      // Parsed in the browser: an export carries real names and pay, and
      // nothing here needs it on the server.
      runText(decodeShowbizFile(await file.arrayBuffer()), file.name, false);
    } catch (error) {
      console.error("weekly bench error:", error);
      toast.error("Couldn't read that file");
    } finally {
      setRunning(false);
    }
  };

  if (authLoading) return null;

  if (!user || !isAdminEmail(user.email)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const rows =
    result && onlyDifferences
      ? result.checks.filter((c) => !c.matches)
      : result?.checks ?? [];

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => router.push("/admin")}
          className="text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          ← Admin
        </button>
        <h1 className="text-2xl font-bold">Weekly bench</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every weekly card in a ShowBiz SAG Cards export is run through our
          calculation and compared against what payroll actually paid. The
          reference export runs by default; swap in your own to check another.
          A file you pick is read in your browser and never uploaded.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              // Read synchronously: React clears currentTarget before the
              // async handler runs.
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file) run(file);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => fileInput.current?.click()}
              disabled={running}
              className="w-full sm:w-auto"
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {running ? "Running…" : "Use another export"}
            </Button>
            {result && !result.isSample && (
              <>
                <Button
                  variant="outline"
                  onClick={saveAsDefault}
                  disabled={running || saving}
                  className="w-full sm:w-auto"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Make this the default
                </Button>
                <Button
                  variant="ghost"
                  onClick={loadSample}
                  disabled={running || saving}
                  className="w-full sm:w-auto"
                >
                  <RotateCcw className="h-4 w-4" />
                  Back to the default
                </Button>
              </>
            )}
          </div>
          {result && (
            <p className="text-xs text-muted-foreground mt-3 break-all">
              {result.isSample ? "Reference export · " : ""}
              {result.fileName}
              {result.skipped > 0 &&
                ` — ${result.skipped} non-weekly card${
                  result.skipped === 1 ? "" : "s"
                } skipped`}
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Weekly cards" value={String(result.total)} />
            <Stat
              label="Matched"
              value={
                result.total
                  ? `${result.matched} · ${(
                      (result.matched / result.total) *
                      100
                    ).toFixed(1)}%`
                  : "—"
              }
              tone={result.matched === result.total ? "good" : undefined}
            />
            <Stat
              label="Differences"
              value={String(result.mismatched)}
              tone={result.mismatched > 0 ? "bad" : undefined}
            />
            <Stat
              label="Not calculable"
              value={String(result.errored)}
              tone={result.errored > 0 ? "warn" : undefined}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-lg">
                {rows.length} card{rows.length === 1 ? "" : "s"}
              </CardTitle>
              <button
                type="button"
                onClick={() => setOnlyDifferences((v) => !v)}
                aria-pressed={onlyDifferences}
                className={`text-xs rounded px-3 py-1.5 border transition-colors ${
                  onlyDifferences
                    ? "border-foreground/40 text-foreground"
                    : "border-border/40 text-muted-foreground hover:bg-accent/50"
                }`}
              >
                Only differences
              </button>
            </CardHeader>
            <CardContent className="space-y-2">
              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {onlyDifferences
                    ? "Every card matches payroll to the cent."
                    : "No weekly cards in that file."}
                </p>
              )}
              {rows.map((check) => (
                <CardRow
                  key={check.card.index}
                  check={check}
                  open={expanded === check.card.cardId}
                  onToggle={() =>
                    setExpanded((id) =>
                      id === check.card.cardId ? null : check.card.cardId
                    )
                  }
                />
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-rose-400"
        : tone === "warn"
          ? "text-amber-400"
          : "text-foreground";
  return (
    <div className="rounded border border-border/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${toneClass}`}>{value}</div>
    </div>
  );
}

function CardRow({
  check,
  open,
  onToggle,
}: {
  check: WeeklyCardCheck;
  open: boolean;
  onToggle: () => void;
}) {
  const { card, breakdown, error, grossDelta, matches } = check;

  return (
    <div className="rounded border border-border/50">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left p-3 flex items-start gap-2 hover:bg-accent/30 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {card.cardId}
            {card.performer && (
              <span className="text-muted-foreground font-normal">
                {" "}
                · {card.performer}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {card.production || "—"} · {card.daysWorked} day
            {card.daysWorked === 1 ? "" : "s"}
            {card.location ? ` · ${card.location}` : ""}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm tabular-nums">{money.format(card.gross)}</div>
          <div
            className={`text-xs tabular-nums ${
              error
                ? "text-amber-400"
                : matches
                  ? "text-muted-foreground"
                  : "text-rose-400"
            }`}
          >
            {error ? "can't calculate" : signedMoney(grossDelta)}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-border/50 p-3 space-y-3">
          {error ? (
            <p className="text-sm text-amber-400">{error}</p>
          ) : (
            breakdown && (
              <>
                <div className="space-y-1">
                  {breakdown.lineItems.map((item, i) => (
                    <div
                      key={`${item.label}-${i}`}
                      className="flex justify-between gap-3 text-xs"
                    >
                      <span className="text-muted-foreground">
                        {item.label}
                        {item.units !== 1 && ` · ${item.units}`}
                        {item.multiplier !== 1 && ` · ×${item.multiplier}`}
                      </span>
                      <span className="tabular-nums shrink-0">
                        {money.format(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1 pt-2 border-t border-border/50 text-xs">
                  <Line
                    label="Our subtotal"
                    ours={breakdown.subtotal}
                    theirs={card.subtotal}
                  />
                  {breakdown.postSubtotalAdjustments !== 0 && (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        Post-subtotal adjustments
                      </span>
                      <span className="tabular-nums">
                        {money.format(breakdown.postSubtotalAdjustments)}
                      </span>
                    </div>
                  )}
                  <Line
                    label="Our gross"
                    ours={breakdown.grandTotal}
                    theirs={card.gross}
                    bold
                  />
                </div>

                {breakdown.overtimeAbsorbed && (
                  <p className="text-xs text-muted-foreground">
                    Over-scale pay absorbed{" "}
                    {money.format(breakdown.absorbedOvertime)} of weekly
                    overtime.
                  </p>
                )}
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}

/** Ours against payroll's, with the difference called out when they differ. */
function Line({
  label,
  ours,
  theirs,
  bold,
}: {
  label: string;
  ours: number;
  theirs: number;
  bold?: boolean;
}) {
  const delta = ours - theirs;
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-medium" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums shrink-0">
        {money.format(ours)}
        {Math.abs(delta) >= 0.005 && (
          <span className="text-rose-400">
            {" "}
            vs {money.format(theirs)} ({signedMoney(delta)})
          </span>
        )}
      </span>
    </div>
  );
}
