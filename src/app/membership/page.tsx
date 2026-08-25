"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  FEATURES,
  PLANS,
  findPlan,
  type PlanId,
} from "@/lib/membership-plans";

export default function MembershipPage() {
  const [current, setCurrent] = useState<PlanId | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<PlanId | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/membership");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { planId: PlanId };
        setCurrent(data.planId);
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
      setCurrent(planId);
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
    if (feature.addOnOnly) return plan.transcriptionAddOn;
    if (feature.tier === "free") return true;
    return plan.tier === "plus" || plan.tier === "standard";
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">Membership</h1>
        <p className="text-muted-foreground mt-2">
          {loading
            ? "Checking your membership…"
            : current
              ? `You're on ${findPlan(current).name}.`
              : "Pick the membership that fits how you work."}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          No payment is collected yet — switch freely while we finish billing.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-10">
        {PLANS.map((plan) => {
          const isCurrent = current === plan.id;
          return (
            <div
              key={plan.id}
              className={`rounded-xl border p-5 flex flex-col ${
                isCurrent
                  ? "border-primary ring-1 ring-primary bg-primary/5"
                  : "border-border"
              }`}
            >
              <h2 className="text-xl font-semibold">{plan.name}</h2>

              <p className="mt-2">
                <span className="text-3xl font-bold">${plan.price}</span>
                <span className="text-muted-foreground text-sm">/month</span>
              </p>
              {plan.priceNote && (
                <p className="text-xs text-muted-foreground mt-1">
                  {plan.priceNote}
                </p>
              )}

              <p className="text-sm text-muted-foreground mt-3 flex-1">
                {plan.tagline}
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

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40">
              <th className="text-left font-medium p-3">What you get</th>
              {PLANS.map((plan) => (
                <th
                  key={plan.id}
                  className={`p-3 font-medium text-center ${
                    current === plan.id ? "text-primary" : ""
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
  );
}
