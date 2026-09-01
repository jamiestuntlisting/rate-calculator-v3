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

  useEffect(() => {
    setMounted(true);
    const saved = window.localStorage.getItem("stl_g_view");
    if (saved === "grid" || saved === "list") setView(saved);
    fetch("/api/me/phone")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { phone: string | null; intakeNumber: string | null }) => {
        if (data.phone) setPhone(data.phone);
        setIntakeNumber(data.intakeNumber);
      })
      .catch(() => {});
  }, []);

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
        </CardContent>
      </Card>
    </div>
  );
}
