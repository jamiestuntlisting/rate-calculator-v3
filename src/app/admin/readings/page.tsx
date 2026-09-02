"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
} from "@/components/ui/table";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";
import { TEST_USER_EMAILS } from "@/lib/test-users";

/**
 * How well Claude reads an Exhibit G: the batting average of its
 * readings against what the performer finally saved, overall, per
 * field, per rule-book version, and rolling over the latest cards —
 * with every reading laid out field by field so a miss can be looked
 * at. The rule book lives in src/lib/g-reader/prompt.ts; the point of
 * this page is to tell whether a change to it helped.
 */

interface Average {
  counted: number;
  exact: number;
  small: number;
  meridiem: number;
  large: number;
  missed: number;
  spurious: number;
  average: number | null;
  closeEnough: number | null;
}

interface Score {
  field: string;
  readValue: string | null;
  finalValue: string | null;
  outcome: string;
  delta: number | null;
}

interface ReadingRow {
  id: string;
  gUploadId: string;
  uploadTitle: string;
  userEmail: string | null;
  model: string;
  servedModel: string | null;
  promptVersion: string;
  error: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
  scored: boolean;
  reading: Record<string, unknown> | null;
  scores: Score[];
}

interface Payload {
  model: string;
  promptVersion: string;
  overall: Average;
  rolling10: Average;
  rolling20: Average;
  scoredReadings: number;
  fields: Array<Average & { field: string }>;
  versions: Array<Average & { promptVersion: string; readings: number }>;
  readings: ReadingRow[];
}

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 1000) / 10}%`);
const FIELD_ORDER = [
  "showName",
  "workDate",
  "character",
  "callTime",
  "ndMealIn",
  "firstMealStart",
  "firstMealFinish",
  "secondMealStart",
  "secondMealFinish",
  "dismissOnSet",
  "dismissMakeupWardrobe",
  "stuntAdjustment",
];
const FIELD_LABEL: Record<string, string> = {
  showName: "Show",
  workDate: "Work date",
  character: "Character",
  callTime: "Call",
  ndMealIn: "ND meal in",
  firstMealStart: "1st meal in",
  firstMealFinish: "1st meal out",
  secondMealStart: "2nd meal in",
  secondMealFinish: "2nd meal out",
  dismissOnSet: "Dismiss on set",
  dismissMakeupWardrobe: "Wrapped",
  stuntAdjustment: "Stunt adjustment",
};
const OUTCOME_CLASS: Record<string, string> = {
  exact: "text-green-300",
  small: "text-lime-300",
  meridiem: "text-amber-300",
  large: "text-red-300",
  missed: "text-orange-300",
  spurious: "text-orange-300",
  blank: "text-muted-foreground",
};

function AverageCells({ a }: { a: Average }) {
  return (
    <>
      <TableCell className="text-right tabular-nums font-medium">{pct(a.average)}</TableCell>
      <TableCell className="text-right tabular-nums">{pct(a.closeEnough)}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{a.counted}</TableCell>
      <TableCell className="hidden md:table-cell text-right tabular-nums text-amber-300">{a.meridiem}</TableCell>
      <TableCell className="hidden md:table-cell text-right tabular-nums text-red-300">{a.large}</TableCell>
      <TableCell className="hidden md:table-cell text-right tabular-nums text-orange-300">
        {a.missed + a.spurious}
      </TableCell>
    </>
  );
}

const AverageHead = () => (
  <>
    <TableHead className="text-right">Exact</TableHead>
    <TableHead className="text-right">Close</TableHead>
    <TableHead className="text-right">n</TableHead>
    <TableHead className="hidden md:table-cell text-right">AM/PM</TableHead>
    <TableHead className="hidden md:table-cell text-right">Wrong</TableHead>
    <TableHead className="hidden md:table-cell text-right">Missed</TableHead>
  </>
);

export default function AdminReadingsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/readings");
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as Payload);
      } catch {
        setError("Couldn't load the readings");
      }
    })();
  }, []);

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
    <div className="max-w-5xl mx-auto px-4 space-y-4">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Claude reads the G</h1>
        <p className="text-sm text-muted-foreground mt-1">
          For test users ({TEST_USER_EMAILS.join(", ")}), Claude reads the
          performer&rsquo;s row off each Exhibit G as it lands and the
          transcription form opens pre-filled. When the G is marked done,
          every field it read is scored against what was saved: exact,
          close (a time within 15 minutes, money within $50), AM/PM (twelve
          hours out), wrong, missed (left blank) or spurious (filled a blank).
          The batting average is exact hits over fields with something to
          compare; &ldquo;close&rdquo; adds the near ones.
          {data && (
            <>
              {" "}
              Model {data.model}, rule book {data.promptVersion}.
            </>
          )}
        </p>
      </div>

      {error && <p className="text-sm text-amber-400">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Batting average</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Over</TableHead>
                      <AverageHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>All {data.scoredReadings} scored cards</TableCell>
                      <AverageCells a={data.overall} />
                    </TableRow>
                    <TableRow>
                      <TableCell>Last 10 cards</TableCell>
                      <AverageCells a={data.rolling10} />
                    </TableRow>
                    <TableRow>
                      <TableCell>Last 20 cards</TableCell>
                      <AverageCells a={data.rolling20} />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">By field</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <AverageHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...data.fields]
                      .sort(
                        (a, b) =>
                          FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field)
                      )
                      .map((f) => (
                        <TableRow key={f.field}>
                          <TableCell>{FIELD_LABEL[f.field] ?? f.field}</TableCell>
                          <AverageCells a={f} />
                        </TableRow>
                      ))}
                    {data.fields.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-muted-foreground">
                          Nothing scored yet — a card is scored when its performer marks it done.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">By rule-book version</CardTitle>
              <p className="text-xs text-muted-foreground">
                Change the prompt, bump its version, and the new line starts here.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead className="text-right">Cards</TableHead>
                      <AverageHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.versions.map((v) => (
                      <TableRow key={v.promptVersion}>
                        <TableCell>{v.promptVersion}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.readings}</TableCell>
                        <AverageCells a={v} />
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Readings</CardTitle>
              <p className="text-xs text-muted-foreground">
                Newest first. Tap one for what was read against what was saved.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.readings.length === 0 && (
                <p className="text-sm text-muted-foreground">No readings yet.</p>
              )}
              {data.readings.map((r) => {
                const avg = r.scores.length
                  ? (() => {
                      const counted = r.scores.filter((s) => s.outcome !== "blank");
                      const exact = counted.filter((s) => s.outcome === "exact").length;
                      return counted.length ? exact / counted.length : null;
                    })()
                  : null;
                const isOpen = open === r.id;
                return (
                  <div key={r.id} className="rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : r.id)}
                      className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3 text-left text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{r.uploadTitle || r.gUploadId}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {r.userEmail} · {new Date(r.createdAt).toLocaleString("en-US")} ·{" "}
                          {r.promptVersion}
                          {r.servedModel && r.servedModel !== r.model
                            ? ` · served by ${r.servedModel}`
                            : ""}
                          {r.durationMs != null ? ` · ${(r.durationMs / 1000).toFixed(1)}s` : ""}
                        </span>
                      </span>
                      <span className="tabular-nums text-xs">
                        {r.error ? (
                          <span className="text-red-300">error</span>
                        ) : r.scored ? (
                          <span className="text-green-300">{pct(avg)} exact</span>
                        ) : (
                          <span className="text-muted-foreground">not yet done</span>
                        )}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border p-3 text-sm">
                        {r.error && <p className="text-red-300">{r.error}</p>}
                        {r.scores.length > 0 ? (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Field</TableHead>
                                  <TableHead>Read</TableHead>
                                  <TableHead>Saved</TableHead>
                                  <TableHead>Outcome</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {[...r.scores]
                                  .sort(
                                    (a, b) =>
                                      FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field)
                                  )
                                  .map((s) => (
                                    <TableRow key={s.field}>
                                      <TableCell>{FIELD_LABEL[s.field] ?? s.field}</TableCell>
                                      <TableCell className="tabular-nums">{s.readValue ?? "—"}</TableCell>
                                      <TableCell className="tabular-nums">{s.finalValue ?? "—"}</TableCell>
                                      <TableCell className={OUTCOME_CLASS[s.outcome] ?? ""}>
                                        {s.outcome}
                                        {s.delta != null && s.delta !== 0
                                          ? ` (${s.delta > 0 ? "+" : ""}${s.delta})`
                                          : ""}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : r.reading ? (
                          <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                            {JSON.stringify(r.reading, null, 2)}
                          </pre>
                        ) : null}
                        <p className="mt-2 text-xs text-muted-foreground">
                          <Link href={`/upload-g/${r.gUploadId}`} className="underline">
                            Open the card
                          </Link>
                          {r.inputTokens != null
                            ? ` · ${r.inputTokens} in / ${r.outputTokens} out tokens`
                            : ""}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
