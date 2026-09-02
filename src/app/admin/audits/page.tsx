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

/**
 * Audit a show — a placeholder. The outline is docs/audit-a-show.md;
 * this page states it where the tool will live so the shape is agreed
 * before anything is built. Nothing here reads or writes data yet.
 */
const STEPS: Array<{ title: string; detail: string }> = [
  {
    title: "1. Open an audit",
    detail:
      "Name the show and the production company, and who asked. An audit is its own world: its cards, rows and people are private to it and never appear on anyone's tracker or pile.",
  },
  {
    title: "2. Upload every Exhibit G",
    detail:
      "The whole run — every card, every day. The same ingest as the pile (dedupe, R2, numbered rows), tagged to the audit instead of to a member.",
  },
  {
    title: "3. Transcribe every row",
    detail:
      "Not one performer's line but the whole card: each row becomes a person, a character, a work status and a day of times — the same fields the transcription form asks, with Claude's reading pre-filling each row for the transcriber to check.",
  },
  {
    title: "4. Price every day",
    detail:
      "The engine runs each row by its date and agreement — the same daily, weekly and 3-day math the app already does — so every performer has what they should have been paid, day by day and for the run.",
  },
  {
    title: "5. Match the paychecks",
    detail:
      "Each performer's stubs or check totals go in beside the working (the pay-stub transcription already exists per day); the shortfall points at a line, not a total. The reverse calculator says how a wrong figure was probably arrived at.",
  },
  {
    title: "6. The package",
    detail:
      "One report per performer — days, times, what was owed, what was paid, the gap — and one for the show; the expected-pay PDF per day already exists and stacks into it.",
  },
];

export default function AdminAuditsPage() {
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
    <div className="max-w-3xl mx-auto px-4 space-y-4">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Audit a show</h1>
        <p className="text-sm text-muted-foreground mt-1">
          A placeholder for an uncommon service: when a production has not
          paid correctly, transcribe every Exhibit G from the run, price
          every performer&rsquo;s every day, and set that against what they
          were paid. The outline is docs/audit-a-show.md; nothing below is
          built yet.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">The shape of it</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {STEPS.map((s) => (
            <div key={s.title} className="border-b border-border/30 pb-3 last:border-0">
              <p className="font-medium">{s.title}</p>
              <p className="text-sm text-muted-foreground">{s.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
