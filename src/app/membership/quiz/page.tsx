"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  PLAN_REASONS,
  QUIZ_STEPS,
  runQuiz,
  type QuizOption,
  type QuizStepId,
} from "@/lib/membership-quiz";
import {
  FEATURES,
  findPlan,
  PLANS,
  type PlanId,
} from "@/lib/membership-plans";

interface Answer {
  step: QuizStepId;
  value: string;
}

/** What a plan costs, said the way the plan actually bills. */
function priceLine(planId: PlanId): string {
  const plan = findPlan(planId);
  if (plan.price === 0) return "Free";
  if (plan.perGPrice) return `$${plan.price}/mo + $${plan.perGPrice} per G`;
  return `$${plan.price}/mo`;
}

export default function MembershipQuizPage() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [saving, setSaving] = useState(false);

  const current = runQuiz(answers);
  const done = "plan" in current;

  const choose = (option: QuizOption) => {
    if (done) return;
    setAnswers((prev) => [...prev, { step: current.step.id, value: option.value }]);
  };

  const back = () => setAnswers((prev) => prev.slice(0, -1));
  const restart = () => setAnswers([]);

  const applyPlan = async (planId: PlanId) => {
    setSaving(true);
    try {
      const res = await fetch("/api/membership", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) throw new Error();
      toast.success(`You're on ${findPlan(planId).name}`);
      router.push("/membership");
    } catch {
      toast.error("Couldn't change your plan");
    } finally {
      setSaving(false);
    }
  };

  // Position in the survey. The tree branches, so this counts what has been
  // answered rather than pretending to know how many are left.
  const questionNumber = answers.length + 1;

  return (
    <div className="max-w-2xl mx-auto px-4 space-y-6">
      <div>
        <Link
          href="/membership"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Membership
        </Link>
        <h1 className="text-2xl font-bold mt-2">
          Which membership is right for me?
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Six questions at most. It explains the difference between the plans
          as it goes.
        </p>
      </div>

      {!done ? (
        <>
          <div className="flex items-center gap-2">
            {QUIZ_STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full ${
                  i < answers.length
                    ? "bg-primary"
                    : i === answers.length
                      ? "bg-primary/40"
                      : "bg-border"
                }`}
              />
            ))}
          </div>

          <Card>
            <CardHeader>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Question {questionNumber}
              </p>
              <CardTitle className="text-xl leading-snug">
                {current.step.question}
              </CardTitle>
              {current.step.note && (
                <p className="text-sm text-muted-foreground pt-1">
                  {current.step.note}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-2 pb-6">
              {current.step.options.map((option) =>
                option.href ? (
                  // The joke answer: opens the job board and carries on, so
                  // it is a laugh rather than a dead end.
                  <a
                    key={option.value}
                    href={option.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => choose(option)}
                    className="w-full text-left p-4 rounded-lg border border-border/60 hover:bg-accent/40 transition-colors flex items-start gap-3"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium">
                        {option.label}
                      </span>
                      {option.detail && (
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          {option.detail}
                        </span>
                      )}
                    </span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  </a>
                ) : (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => choose(option)}
                    className="w-full text-left p-4 rounded-lg border border-border/60 hover:bg-accent/40 hover:border-primary/50 transition-colors"
                  >
                    <span className="block text-sm font-medium">
                      {option.label}
                    </span>
                    {option.detail && (
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        {option.detail}
                      </span>
                    )}
                  </button>
                )
              )}
            </CardContent>
          </Card>

          {answers.length > 0 && (
            <Button variant="ghost" size="sm" onClick={back}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          )}
        </>
      ) : (
        <Result
          planId={current.plan}
          saving={saving}
          onApply={() => applyPlan(current.plan)}
          onRestart={restart}
        />
      )}
    </div>
  );
}

function Result({
  planId,
  saving,
  onApply,
  onRestart,
}: {
  planId: PlanId;
  saving: boolean;
  onApply: () => void;
  onRestart: () => void;
}) {
  const plan = findPlan(planId);

  const includes = (id: PlanId, feature: (typeof FEATURES)[number]) => {
    const p = findPlan(id);
    if (feature.transcriptionOnly) return p.transcription !== null;
    return p.tier !== "free";
  };

  return (
    <div className="space-y-6">
      <Card className="border-2 border-primary bg-primary/5">
        <CardHeader>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Sounds like
          </p>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <CardTitle className="text-2xl">{plan.name}</CardTitle>
            <span className="text-lg font-semibold tabular-nums">
              {priceLine(planId)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          <p className="text-sm">{PLAN_REASONS[planId]}</p>
          {plan.priceNote && (
            <p className="text-xs text-muted-foreground">{plan.priceNote}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={onApply} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1 h-4 w-4" />
              )}
              Put me on {plan.name}
            </Button>
            <Button variant="outline" onClick={onRestart} disabled={saving}>
              <RotateCcw className="mr-1 h-4 w-4" />
              Start again
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How they compare</CardTitle>
          <p className="text-sm text-muted-foreground">
            Nothing is charged yet — picking a plan just applies it.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 pb-6">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={`rounded-lg border p-3 ${
                p.id === planId ? "border-primary/60 bg-primary/5" : "border-border/50"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="text-sm font-medium">
                  {p.name}
                  {p.id === planId && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      Suggested
                    </Badge>
                  )}
                </span>
                <span className="text-sm tabular-nums shrink-0">
                  {priceLine(p.id)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{p.tagline}</p>
              <ul className="mt-2 space-y-1">
                {FEATURES.map((feature) => (
                  <li
                    key={feature.label}
                    className={`text-xs flex items-start gap-1.5 ${
                      includes(p.id, feature)
                        ? "text-foreground"
                        : "text-muted-foreground/50 line-through"
                    }`}
                  >
                    <Check
                      className={`h-3 w-3 shrink-0 mt-0.5 ${
                        includes(p.id, feature) ? "" : "opacity-30"
                      }`}
                    />
                    {feature.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
