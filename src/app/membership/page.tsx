"use client";

import Link from "next/link";
import { Editable, EditablePage } from "@/components/shared/editable-page";

import { useEffect, useState } from "react";
import { Check, HelpCircle, Loader2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  FEATURES,
  PER_G_BREAK_EVEN,
  PLAN_PRICES,
  PLANS,
  findPlan,
  type PlanId,
} from "@/lib/membership-plans";

interface MembershipState {
  planId: PlanId;
  transcribedThisMonth: number;
  monthToDateCharges: number;
}

export default function MembershipPage() {
  const [membership, setMembership] = useState<MembershipState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<PlanId | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/membership");
        if (!res.ok) throw new Error();
        setMembership((await res.json()) as MembershipState);
      } catch {
        toast.error("Couldn't load your membership");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const choose = async (planId: PlanId) => {
    setSaving(planId);
    try {
      const res = await fetch("/api/membership", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) throw new Error();
      setMembership((prev) =>
        prev
          ? { ...prev, planId }
          : { planId, transcribedThisMonth: 0, monthToDateCharges: 0 }
      );
      toast.success(`You're on ${findPlan(planId).name}`);
    } catch {
      toast.error("Couldn't change your membership");
    } finally {
      setSaving(null);
    }
  };

  /** Whether a plan includes a given feature. */
  const includes = (planId: PlanId, feature: (typeof FEATURES)[number]) => {
    const plan = findPlan(planId);
    if (feature.transcriptionOnly) return plan.transcription !== null;
    if (feature.tier === "free") return true;
    return plan.tier === "plus" || plan.tier === "standard";
  };

  return (
    <EditablePage page="membership">
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">
          <Editable k="title" d="Membership" />
        </h1>
        <p className="text-muted-foreground mt-2">
          {loading
            ? "Checking your membership…"
            : membership
              ? `You're on ${findPlan(membership.planId).name}.`
              : "Pick the membership that fits how you work."}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          <Editable
            k="billing-note"
            d="No payment is collected yet — switch freely while we finish billing."
          />
        </p>
        <Link
          href="/membership/quiz"
          className="inline-flex items-center gap-1.5 mt-4 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          <HelpCircle className="h-4 w-4" />
          Which one is right for me?
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {PLANS.map((plan) => {
          const isCurrent = membership?.planId === plan.id;
          return (
            <div
              key={plan.id}
              className={`rounded-xl border p-5 flex flex-col ${
                isCurrent
                  ? "border-primary ring-1 ring-primary bg-primary/5"
                  : "border-border"
              }`}
            >
              <h2 className="text-xl font-semibold">
                <Editable k={`plan.${plan.id}.name`} d={plan.name} />
              </h2>

              <p className="mt-2">
                <span className="text-3xl font-bold">
                  <Editable k={`plan.${plan.id}.price`} d={`$${plan.price}`} />
                </span>
                <span className="text-muted-foreground text-sm">/month</span>
              </p>
              {plan.perGPrice !== undefined && (
                <p className="text-sm font-medium mt-1">
                  <Editable
                    k={`plan.${plan.id}.perG`}
                    d={`+ $${plan.perGPrice} per Exhibit G`}
                  />
                </p>
              )}
              {plan.priceNote && (
                <p className="text-xs text-muted-foreground mt-1">
                  <Editable k={`plan.${plan.id}.priceNote`} d={plan.priceNote} />
                </p>
              )}

              <p className="text-sm text-muted-foreground mt-3 flex-1">
                <Editable k={`plan.${plan.id}.tagline`} d={plan.tagline} />
              </p>

              <Button
                className="mt-4 w-full"
                variant={isCurrent ? "outline" : "default"}
                disabled={isCurrent || saving !== null || loading}
                onClick={() => choose(plan.id)}
              >
                {saving === plan.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isCurrent ? (
                  "Your membership"
                ) : (
                  `Switch to ${plan.name}`
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {/* What pay-as-you-go has cost so far this month. */}
      {membership?.planId === "plus_per_g" && (
        <div className="rounded-xl border border-border p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">This month</p>
            <p className="text-sm text-muted-foreground">
              {membership.transcribedThisMonth} Exhibit G
              {membership.transcribedThisMonth === 1 ? "" : "s"} transcribed ·
              ${membership.monthToDateCharges} in transcription charges
            </p>
          </div>
          {membership.transcribedThisMonth >= PER_G_BREAK_EVEN && (
            <p className="text-sm text-muted-foreground">
              At {PER_G_BREAK_EVEN}+ Gs a month, Plus + Transcription (
              ${PLAN_PRICES.transcriptionAddOn}/mo, unlimited) costs less.
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40">
              <th className="text-left font-medium p-3">What you get</th>
              {PLANS.map((plan) => (
                <th
                  key={plan.id}
                  className={`p-3 font-medium text-center ${
                    membership?.planId === plan.id ? "text-primary" : ""
                  }`}
                >
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((feature) => (
              <tr key={feature.label} className="border-t border-border">
                <td className="p-3">
                  <span className="font-medium">{feature.label}</span>
                  {feature.detail && (
                    <span className="block text-xs text-muted-foreground">
                      {feature.detail}
                    </span>
                  )}
                </td>
                {PLANS.map((plan) => (
                  <td key={plan.id} className="p-3 text-center">
                    {includes(plan.id, feature) ? (
                      <Check className="h-5 w-5 text-primary mx-auto" />
                    ) : (
                      <Minus className="h-4 w-4 text-muted-foreground/50 mx-auto" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </EditablePage>
  );
}
