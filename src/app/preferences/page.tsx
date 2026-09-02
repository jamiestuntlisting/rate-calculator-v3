"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/context/auth-context";
import { findPlan, planFor, type PlanId } from "@/lib/membership-plans";

type ViewMode = "grid" | "list";

/** A row of mutually exclusive choices. */
function Choice<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex rounded-md border border-border overflow-hidden shrink-0">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={`px-3 py-1.5 text-sm ${
              value === option.value
                ? "bg-accent font-medium"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PreferencesPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [view, setView] = useState<ViewMode>("grid");
  const [mounted, setMounted] = useState(false);
  /** Mobile number for texting in Exhibit Gs, and the number to text. */
  const [phone, setPhone] = useState("");
  const [intakeNumber, setIntakeNumber] = useState<string | null>(null);
  const [savingPhone, setSavingPhone] = useState(false);
  /** Transcription time-row order — the same preference the toggle on
   *  the transcription page saves; shown here so it is findable. */
  const [timeOrder, setTimeOrder] = useState<"chrono" | "card">("chrono");
  /** Whole form vs one question at a time, same deal. */
  const [transcribeMode, setTranscribeMode] = useState<"form" | "guided">(
    "form"
  );

  useEffect(() => {
    setMounted(true);
    const saved = window.localStorage.getItem("stl_g_view");
    if (saved === "grid" || saved === "list") setView(saved);
    const savedOrder = window.localStorage.getItem("stl_transcribe_order");
    if (savedOrder === "chrono" || savedOrder === "card")
      setTimeOrder(savedOrder);
    const savedMode = window.localStorage.getItem("stl_transcribe_mode");
    if (savedMode === "form" || savedMode === "guided")
      setTranscribeMode(savedMode);
    fetch("/api/me/phone")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { phone: string | null; intakeNumber: string | null }) => {
        if (data.phone) setPhone(data.phone);
        setIntakeNumber(data.intakeNumber);
      })
      .catch(() => {});
    fetch("/api/me/prefs")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(
        (data: {
          prefs?: { transcribeTimeOrder?: string; transcribeMode?: string };
        }) => {
          const v = data.prefs?.transcribeTimeOrder;
          if (v === "chrono" || v === "card") {
            setTimeOrder(v);
            try {
              window.localStorage.setItem("stl_transcribe_order", v);
            } catch {}
          }
          const m = data.prefs?.transcribeMode;
          if (m === "form" || m === "guided") {
            setTranscribeMode(m);
            try {
              window.localStorage.setItem("stl_transcribe_mode", m);
            } catch {}
          }
        }
      )
      .catch(() => {});
  }, []);

  const chooseTranscribeMode = (next: "form" | "guided") => {
    setTranscribeMode(next);
    try {
      window.localStorage.setItem("stl_transcribe_mode", next);
    } catch {}
    fetch("/api/me/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcribeMode: next }),
    }).catch(() => toast.error("Couldn't save the flow"));
  };

  const chooseTimeOrder = (next: "chrono" | "card") => {
    setTimeOrder(next);
    try {
      window.localStorage.setItem("stl_transcribe_order", next);
    } catch {}
    fetch("/api/me/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcribeTimeOrder: next }),
    }).catch(() => toast.error("Couldn't save the order"));
  };

  const savePhone = async () => {
    setSavingPhone(true);
    try {
      const res = await fetch("/api/me/phone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save");
      setPhone(data.phone ?? "");
      toast.success(
        data.phone ? "Number saved — you can text Gs in now" : "Number removed"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSavingPhone(false);
    }
  };

  const chooseView = (next: ViewMode) => {
    setView(next);
    window.localStorage.setItem("stl_g_view", next);
  };

  // The session carries the tier; the add-on lives on the membership page.
  const planId: PlanId = user ? planFor(user.tier as never, null) : "free";

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Preferences</h1>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg">Membership</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">{findPlan(planId).name}</p>
            <p className="text-sm text-muted-foreground">
              {findPlan(planId).tagline}
            </p>
          </div>
          <Link
            href="/membership"
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent shrink-0"
          >
            Change membership
          </Link>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg">Text in your Exhibit Gs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {intakeNumber
              ? `Text a photo of your Exhibit G to ${intakeNumber} and it lands in your tracker. We match on the number below.`
              : "Text a photo of your Exhibit G and it lands in your tracker — the intake number is being set up. We match on the number below."}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="pref-phone" className="text-sm">
                Your mobile number
              </Label>
              <Input
                id="pref-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-0100"
                className="h-11"
              />
            </div>
            <Button onClick={savePhone} disabled={savingPhone} className="h-11">
              {savingPhone ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {user?.tester && <BankFloorCard />}
      {user?.tester && <CalendarCard />}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Display</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {mounted && (
            <Choice
              label="Theme"
              description="Dark is easier to read on set at night."
              value={(theme as "light" | "dark" | "system") ?? "system"}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              onChange={setTheme}
            />
          )}
          <Choice
            label="Exhibit G view"
            description="How your Exhibit Gs are laid out by default."
            value={view}
            options={[
              { value: "grid", label: "Grid" },
              { value: "list", label: "List" },
            ]}
            onChange={chooseView}
          />
          <Choice
            label="Transcription times"
            description="Run the time fields through the day, or as the card's columns do."
            value={timeOrder}
            options={[
              { value: "chrono", label: "Day order" },
              { value: "card", label: "Card order" },
            ]}
            onChange={chooseTimeOrder}
          />
          <Choice
            label="Transcription flow"
            description="The whole form at once, or one question at a time."
            value={transcribeMode}
            options={[
              { value: "form", label: "All fields" },
              { value: "guided", label: "One at a time" },
            ]}
            onChange={chooseTranscribeMode}
          />
        </CardContent>
      </Card>
    </div>
  );
}


/**
 * The Google Calendar work log (a feature under test): StuntListing
 * keeps a calendar for the member and shares it to them, so every day
 * they log shows up beside their own calendars, past and future.
 */
function CalendarCard() {
  const [status, setStatus] = useState<{
    configured: boolean;
    calendarId: string | null;
    sharedAt: string | null;
    link: string | null;
    email: string | null;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/calendar");
    if (res.ok) setStatus(await res.json());
  };
  useEffect(() => {
    load();
  }, []);

  const act = async (action: "connect" | "sync" | "disconnect") => {
    setBusy(action);
    try {
      const res =
        action === "disconnect"
          ? await fetch("/api/calendar", { method: "DELETE" })
          : await fetch("/api/calendar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
            });
      const body = (await res.json()) as { error?: string; mirrored?: number };
      if (!res.ok) throw new Error(body.error || "Couldn't reach Google Calendar");
      toast.success(
        action === "connect"
          ? `Calendar shared — check ${status?.email ?? "your email"} for Google's invitation. ${body.mirrored ?? 0} days written.`
          : action === "sync"
            ? `${body.mirrored ?? 0} days written`
            : "Calendar disconnected"
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reach Google Calendar");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-lg">Google Calendar work log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          A feature under test. StuntListing keeps a calendar for you —
          &ldquo;Your name — StuntListing Work Log&rdquo; — and shares it to
          your email, read only. Every day you log lands on it, past and
          future, and it sits beside your own calendars so you can switch it
          on or off without touching them. Edits here update the event;
          deleting a day removes it.
        </p>
        {status && !status.configured && (
          <p className="text-amber-400">
            Not set up yet — the company&rsquo;s Google service account key
            (GOOGLE_SERVICE_ACCOUNT_JSON) is needed on the Worker.
          </p>
        )}
        {status?.calendarId ? (
          <div className="space-y-2">
            <p>
              Shared to <span className="font-medium">{status.email}</span>
              {status.sharedAt ? ` on ${new Date(status.sharedAt).toLocaleDateString("en-US")}` : ""}.
              {" "}
              {status.link && (
                <a href={status.link} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Open it in Google Calendar ↗
                </a>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => act("sync")} disabled={busy !== null} variant="outline" className="h-11">
                {busy === "sync" ? "Writing…" : "Write every day again"}
              </Button>
              <Button onClick={() => act("disconnect")} disabled={busy !== null} variant="outline" className="h-11">
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => act("connect")} disabled={busy !== null || !status?.configured} className="h-11">
            {busy === "connect" ? "Sharing…" : "Share my work log to Google Calendar"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}


/**
 * Bank deposits (a feature under test): the one setting the matching
 * has — the smallest deposit that could be a paycheck. The bank page
 * itself is just Connect; the daily pull uses this floor.
 */
function BankFloorCard() {
  const [floor, setFloor] = useState("500");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch("/api/me/prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { prefs?: { depositFloor?: number } } | null) => {
        const f = data?.prefs?.depositFloor;
        if (typeof f === "number") setFloor(String(f));
      })
      .catch(() => undefined);
  }, []);
  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/me/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositFloor: parseFloat(floor) || 0 }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success("Saved");
    } catch {
      toast.error("Couldn't save the floor");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-lg">Bank deposits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          A feature under test. The smallest deposit that could be a
          paycheck: anything under it is left out when the daily pull
          matches deposits to expected pay.{" "}
          <Link href="/bank" className="underline underline-offset-2">
            Bank deposits
          </Link>
          .
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="pref-deposit-floor" className="text-xs text-muted-foreground">
              Floor
            </Label>
            <div className="relative w-40">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="pref-deposit-floor"
                type="number"
                inputMode="decimal"
                min="0"
                step="50"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                className="pl-7"
              />
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="h-11">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
