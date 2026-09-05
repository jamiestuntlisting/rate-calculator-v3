"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";
import { shortDay } from "@/lib/format-date";

/**
 * Audit a show: when a production has not paid correctly, transcribe
 * every Exhibit G from the run, price every performer's every day, and
 * set that against what they were paid. This page lists the audits
 * and opens a new one — the show, the performers involved, a note —
 * and the audit itself walks the steps (docs/audit-a-show.md).
 */
interface AuditRow {
  _id: string;
  showName: string;
  performers: string;
  status: string;
  createdAt: string;
  cards: number;
  transcribed: number;
}

const STEPS = [
  ["1", "Open the audit", "The show, who was on it, and a note."],
  ["2", "Upload every Exhibit G", "The whole run, card by card; the same uploader as the pile."],
  ["3", "Transcribe", "Every card through the transcription view; a review of what is done and what is left."],
  ["4", "Price every day", "The engine on each day by its date and agreement."],
  ["5", "Match the paychecks", "What was paid against what was owed, line by line."],
  ["6", "The package", "One report per performer, and one for the show."],
] as const;

export default function AuditsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [audits, setAudits] = useState<AuditRow[] | null>(null);
  const [showName, setShowName] = useState("");
  const [performers, setPerformers] = useState("");
  const [notes, setNotes] = useState("");
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    fetch("/api/admin/audits")
      .then((r) => r.json())
      .then((d: { audits?: AuditRow[] }) => setAudits(d.audits ?? []))
      .catch(() => setAudits([]));
  }, []);

  if (!user || !(user.role === "admin" || isAdminEmail(user.email))) {
    return <div className="max-w-4xl mx-auto px-4 py-10 text-sm text-muted-foreground">Admin access required.</div>;
  }

  const open = async () => {
    if (!showName.trim()) {
      toast.error("Name the show");
      return;
    }
    setOpening(true);
    try {
      const res = await fetch("/api/admin/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showName, performers, notes }),
      });
      const data = (await res.json()) as { audit?: { _id: string }; error?: string };
      if (!res.ok || !data.audit) throw new Error(data.error || String(res.status));
      router.push(`/admin/audits/${data.audit._id}?step=2`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open the audit");
      setOpening(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit a show</h1>
        <p className="text-sm text-muted-foreground">
          When a production has not paid correctly: every Exhibit G from the run, every day
          priced, every paycheck matched, and a package per performer.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">The steps</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 sm:grid-cols-2">
            {STEPS.map(([n, title, detail]) => (
              <li key={n} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold">
                  {n}
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-xs text-muted-foreground">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {audits && audits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Open audits</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/60">
            {audits.map((a) => (
              <Link
                key={a._id}
                href={`/admin/audits/${a._id}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 hover:underline"
              >
                <span className="font-medium">{a.showName}</span>
                <span className="text-sm text-muted-foreground">
                  {a.transcribed} of {a.cards} cards transcribed · opened {shortDay(a.createdAt.slice(0, 10))}
                  {a.status === "closed" ? " · closed" : ""}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Get started</CardTitle>
          <p className="text-xs text-muted-foreground">Open an audit; the Exhibit Gs come next.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="audit-show">Show title</Label>
            <Input
              id="audit-show"
              value={showName}
              onChange={(e) => setShowName(e.target.value)}
              placeholder="The show, as it appears on the Exhibit Gs"
              className="h-11"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-performers">Performers involved</Label>
            <Textarea
              id="audit-performers"
              value={performers}
              onChange={(e) => setPerformers(e.target.value)}
              placeholder="One per line, or however they come"
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-notes">Note</Label>
            <Textarea
              id="audit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Who asked, what is wrong, anything to remember"
              rows={3}
            />
          </div>
          <Button onClick={() => void open()} disabled={opening} className="w-full sm:w-auto">
            {opening ? "Opening…" : "Next: upload the Exhibit Gs"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
