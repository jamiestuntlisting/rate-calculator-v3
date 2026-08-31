"use client";

import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import {
  followedTime,
  offerAfterIfEmpty,
  offerBeforeIfEmpty,
  precedingTime,
} from "@/lib/follow-time";
import {
  MEAL_MIN_MINUTES,
  MEAL_MAX_MINUTES,
  clampMealFinish,
  mealLengthWarning,
} from "@/lib/meal-length";
import { ND_MEAL_MINUTES, checkNdMeal } from "@/lib/nd-meal";
import { WRAP_MINUTES, wrapOrderWarning } from "@/lib/wrap-check";
import { MEAL_PENALTIES } from "@/lib/rate-constants";
import { MEAL_MINUTES, toDisplay } from "@/components/calculator/time-select";

/**
 * The UI rules for setting times on Log Work, stated in words and run
 * against the exact functions the form calls — not a copy of them. If a
 * rule's code drifts, its row goes red here, and the same functions are
 * pinned by the vitest suite, which CI runs on every push and again on
 * a weekly schedule.
 */
interface RuleCheck {
  rule: string;
  example: string;
  expected: string;
  got: () => string;
}

const show = (v: string | null | undefined) => (v ? toDisplay(v) : "(empty)");

const RULES: Array<{ section: string; checks: RuleCheck[] }> = [
  {
    section: "Meals",
    checks: [
      {
        rule: `Setting a meal's In offers the Out ${MEAL_MINUTES} minutes on — but never overwrites an Out already entered.`,
        example: "In set to 12:00 PM, Out empty",
        expected: "12:30 PM",
        got: () => show(followedTime("12:00", null, MEAL_MINUTES)),
      },
      {
        rule: "An Out already entered stays where it was put when the In moves.",
        example: "In moved to 12:00 PM, Out already 12:45 PM",
        expected: "12:45 PM",
        got: () => show(followedTime("12:00", "12:45", MEAL_MINUTES)),
      },
      {
        rule: `Lunch is at least ${MEAL_MIN_MINUTES} minutes: an Out that would make it shorter snaps to In + ${MEAL_MIN_MINUTES}.`,
        example: "In 12:00 PM, Out typed as 12:10 PM",
        expected: "12:30 PM",
        got: () => show(clampMealFinish("12:00", "12:10")),
      },
      {
        rule: `Lunch is at most ${MEAL_MAX_MINUTES} minutes: an Out past the hour snaps to In + ${MEAL_MAX_MINUTES}.`,
        example: "In 12:00 PM, Out typed as 1:30 PM",
        expected: "1:00 PM",
        got: () => show(clampMealFinish("12:00", "13:30")),
      },
      {
        rule: "A crossed pair is left alone for the swapped-times warning, not silently repaired.",
        example: "In 12:00 PM, Out typed as 11:00 AM",
        expected: "warns",
        got: () => (mealLengthWarning("12:00", "11:00") ? "warns" : "silent"),
      },
      {
        rule: `Lunch is offered ${MEAL_PENALTIES.maxHoursBeforeFirstMeal} hours after call (the meal-interval rule); the 2nd meal ${MEAL_PENALTIES.maxHoursBeforeSecondMeal} hours after the 1st ends. Offers keep tracking their anchor until a hand touches them.`,
        example: "Call 8:00 AM → offered lunch In",
        expected: "2:00 PM",
        got: () =>
          show(
            followedTime(
              "08:00",
              null,
              MEAL_PENALTIES.maxHoursBeforeFirstMeal * 60
            )
          ),
      },
    ],
  },
  {
    section: "ND meal",
    checks: [
      {
        rule: `An ND meal is ${ND_MEAL_MINUTES} minutes — the Out is not settable, it is derived from the In.`,
        example: "ND In 10:45 AM",
        expected: "11:00 AM",
        got: () => show(followedTime("10:45", null, ND_MEAL_MINUTES)),
      },
      {
        rule: "An ND meal must fall inside the two hours after call, or it is a deductible meal.",
        example: "Call 8:00 AM, ND 10:30–10:45 AM",
        expected: "refused",
        got: () =>
          checkNdMeal("08:00", "10:30", "10:45").ok ? "allowed" : "refused",
      },
    ],
  },
  {
    section: "Dismissal and wrap",
    checks: [
      {
        rule: `Setting Dismiss On Set offers Wrapped ${WRAP_MINUTES} minutes on — only when Wrapped is empty.`,
        example: "Dismiss 11:00 PM, Wrapped empty",
        expected: "11:15 PM",
        got: () => show(offerAfterIfEmpty("23:00", null, WRAP_MINUTES)),
      },
      {
        rule: "A Wrapped time already set never moves, however the dismissal changes.",
        example: "Dismiss changed to 11:45 PM, Wrapped already 11:00 PM",
        expected: "11:00 PM",
        got: () => show(offerAfterIfEmpty("23:45", "23:00", WRAP_MINUTES)),
      },
      {
        rule: `Setting Wrapped first offers the dismissal ${WRAP_MINUTES} minutes before it — only when the dismissal is empty.`,
        example: "Wrapped 10:00 PM, Dismiss empty",
        expected: "9:45 PM",
        got: () => show(offerBeforeIfEmpty("22:00", null, WRAP_MINUTES)),
      },
      {
        rule: "A dismissal already set stays put when Wrapped is edited.",
        example: "Wrapped 10:00 PM, Dismiss already 9:00 PM",
        expected: "9:00 PM",
        got: () => show(offerBeforeIfEmpty("22:00", "21:00", WRAP_MINUTES)),
      },
      {
        rule: "A wrap earlier than the dismissal draws the swapped-order warning rather than a silent fix.",
        example: "Dismiss 10:00 PM, Wrapped 9:00 PM",
        expected: "warns",
        got: () => (wrapOrderWarning("22:00", "21:00") ? "warns" : "silent"),
      },
      {
        rule: "The mirror offer survives midnight: a wrap after twelve still finds its dismissal the evening before.",
        example: "Wrapped 12:10 AM, Dismiss empty",
        expected: "11:55 PM",
        got: () => show(precedingTime("00:10", null, WRAP_MINUTES)),
      },
    ],
  },
];

export default function TimeBenchPage() {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto py-10">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const rows = RULES.map((group) => ({
    ...group,
    checks: group.checks.map((check) => {
      let got: string;
      try {
        got = check.got();
      } catch (error) {
        got = `threw: ${error instanceof Error ? error.message : "error"}`;
      }
      return { ...check, gotValue: got, pass: got === check.expected };
    }),
  }));
  const total = rows.reduce((n, g) => n + g.checks.length, 0);
  const passing = rows.reduce(
    (n, g) => n + g.checks.filter((c) => c.pass).length,
    0
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        href="/admin"
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Admin
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Time Bench</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The Log Work time rules, in words, each run right now against the
          same functions the form calls. {passing} of {total} passing. The
          vitest suite pins the same functions and CI runs it on every push
          and every Monday.
        </p>
      </div>
      {rows.map((group) => (
        <div key={group.section} className="rounded-lg border border-border">
          <h2 className="px-4 py-3 font-semibold border-b border-border">
            {group.section}
          </h2>
          <div className="divide-y divide-border">
            {group.checks.map((check) => (
              <div key={check.rule} className="p-4 space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm">{check.rule}</p>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border ${
                      check.pass
                        ? "border-primary/60 text-primary"
                        : "border-red-500/60 text-red-400"
                    }`}
                  >
                    {check.pass ? "Pass" : "Fail"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {check.example} → {check.gotValue}
                  {check.pass ? "" : ` (expected ${check.expected})`}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
