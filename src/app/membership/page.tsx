"use client";

import Link from "next/link";
import { Editable, EditablePage } from "@/components/shared/editable-page";

import { useEffect, useState } from "react";
import { Check, HelpCircle, Loader2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BOOKKEEPER_PLUS_CREDITS, CREDIT_COSTS, FEATURES, PLANS, PLAN_PRICES, findPlan, type PlanId } from "@/lib/membership-plans";

interface MembershipState {
  planId: PlanId;
  transcribedThisMonth: number;
  /** Credits used this month, on the plan with an allowance. */
  creditsUsed?: number;
  creditsIncluded?: number | null;
}

export default function MembershipPage() {
  const [membership, setMembership] = useState<MembershipState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<PlanId | null>(null);
  /** Price display only — billing itself is not wired yet. */
  const [cadence, setCadence] = useState<"monthly" | "yearly">("monthly");

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
          : { planId, transcribedThisMonth: 0, creditsUsed: 0 }
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

      {/* Monthly / yearly is a lens on the same plans — yearly is ten
          months for the price of twelve. */}
      <div className="flex justify-center mb-4">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(["monthly", "yearly"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setCadence(option)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize ${
                cadence === option
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
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
                  {cadence === "yearly" ? (
                    `$${plan.yearlyPrice}`
                  ) : (
                    <Editable k={`plan.${plan.id}.price`} d={`$${plan.price}`} />
                  )}
                </span>
                <span className="text-muted-foreground text-sm">
                  {cadence === "yearly" ? "/year" : "/month"}
                </span>
              </p>
              {cadence === "yearly" && plan.yearlyPrice > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  ${plan.price}/mo, billed yearly at ${plan.yearlyPrice}.
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

      {/* What the credits buy — the same table for every plan. */}
      <div className="rounded-xl border border-border p-4 mb-6">
        <p className="font-medium">What a transcription costs in credits</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Bookkeeper Plus includes {BOOKKEEPER_PLUS_CREDITS} a month; Max is unlimited.
        </p>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {CREDIT_COSTS.map((c) => (
              <tr key={c.kind} className="border-t border-border/60">
                <td className="py-2 pr-3 font-medium">{c.label}</td>
                <td className="py-2 pr-3 text-muted-foreground">{c.detail}</td>
                <td className="py-2 text-right tabular-nums whitespace-nowrap">
                  {c.credits} credit{c.credits === 1 ? "" : "s"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Credits used so far this month, on the plan with an allowance. */}
      {membership?.planId === "plus_per_g" && (
        <div className="rounded-xl border border-border p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">This month</p>
            <p className="text-sm text-muted-foreground">
              {membership.creditsUsed ?? membership.transcribedThisMonth} of {BOOKKEEPER_PLUS_CREDITS} credits used
            </p>
          </div>
          {(membership.creditsUsed ?? membership.transcribedThisMonth) >= BOOKKEEPER_PLUS_CREDITS && (
            <p className="text-sm text-muted-foreground">
              Out of credits this month — Max (${PLAN_PRICES.max}/mo) is unlimited.
            </p>
          )}
        </div>
      )}

      {/* No overflow-hidden on the wrapper: it would quietly disable the
          sticky header. The corner rounding moves onto the header cells.
          top-14 tucks the row under the app header, and the background is
          opaque so feature rows do not ghost through as they pass. */}
      <div className="rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="sticky top-14 z-10 rounded-tl-xl bg-[#202023] text-left font-medium p-2 sm:p-3 text-xs sm:text-sm">
                What you get
              </th>
              {PLANS.map((plan, index) => (
                <th
                  key={plan.id}
                  className={`sticky top-14 z-10 bg-[#202023] p-2 sm:p-3 font-medium text-center text-xs sm:text-sm break-words ${
                    index === PLANS.length - 1 ? "rounded-tr-xl" : ""
                  } ${membership?.planId === plan.id ? "text-primary" : ""}`}
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
