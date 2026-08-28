"use client";

import { useState } from "react";
import Link from "next/link";
import { calculateRate } from "@/lib/rate-engine";
import { formatCurrency } from "@/lib/time-utils";
import { compareStub, disputeMessage, type PayStubLine } from "@/lib/pay-stub";
import { Editable } from "@/components/shared/editable-page";

/**
 * How the Bookkeeper works, walked rather than read.
 *
 * The old version of this page was a diagram with all four steps on screen
 * at once, which leaves the reader to work out which bit applies to them.
 * This asks instead: one step, the choices that actually branch, and the
 * next step follows from what they picked. The two places it forks — who
 * transcribes the G, and whether the stub was right — are the two places a
 * performer's experience genuinely differs.
 *
 * Everything shown is real. The calculation is the engine run on the
 * example day; the email is `disputeMessage`, the same function the app
 * uses when a stub comes up short. Nothing here is a mock-up, because a
 * landing page that promises something the product does not do is worse
 * than no landing page.
 */

/** A twelve-hour day with a late first meal — an ordinary Tuesday. */
const EXAMPLE_DAY = {
  showName: "Action Movie 3",
  workDate: "2026-08-25",
  callTime: "07:00",
  dismissOnSet: "19:00",
  dismissMakeupWardrobe: null,
  ndMealIn: null,
  ndMealOut: null,
  firstMealStart: "13:30",
  firstMealFinish: "14:00",
  secondMealStart: null,
  secondMealFinish: null,
  stuntAdjustment: 250,
  forcedCall: false,
  isSixthDay: false,
  isSeventhDay: false,
  isHoliday: false,
  workStatus: "theatrical_basic" as const,
  characterName: "Stunt Double — Lead",
  notes: "",
};

const BREAKDOWN = calculateRate(EXAMPLE_DAY);

/** What payroll actually paid: the adjustment, and the overtime, missed. */
const PAID_LINES: PayStubLine[] = [
  { label: "Straight time", hours: 8, amount: 1283 },
  { label: "Stunt adjustment", hours: null, amount: 250 },
];

const OWED_LINES: PayStubLine[] = BREAKDOWN.segments.map((segment) => ({
  label: segment.label,
  hours: segment.hours,
  amount: segment.subtotal,
}));

const COMPARISON = compareStub(BREAKDOWN.grandTotal, PAID_LINES);

const EMAIL = disputeMessage({
  performerName: "Sam Rivera",
  showName: EXAMPLE_DAY.showName,
  period: "the work day of 25 August 2026",
  comparison: COMPARISON,
  owedLines: OWED_LINES,
  paidLines: PAID_LINES,
});

type NodeId =
  | "upload"
  | "tracker"
  | "calculated"
  | "paystub"
  | "correct"
  | "short"
  | "corrected";

interface Choice {
  label: string;
  to: NodeId;
  /** Why someone would pick this one. */
  hint?: string;
}

interface FlowNode {
  step: string;
  title: string;
  body: string;
  detail?: "calculation" | "email" | "stub";
  choices: Choice[];
  tone?: "good" | "bad";
}

const NODES: Record<NodeId, FlowNode> = {
  upload: {
    step: "Start here",
    title: "Photograph your Exhibit G",
    body:
      "At wrap you get an Exhibit G with the day on it — call, meals, wrap, " +
      "your adjustment. Take a picture of it. That is the whole first step, " +
      "and it is the one that has to happen on set while the paper exists.",
    choices: [
      {
        label: "Let us transcribe it",
        to: "tracker",
        hint: "We read the times off and fill the day in.",
      },
      {
        label: "I'll type the times in myself",
        to: "tracker",
        hint: "Free, and about a minute.",
      },
    ],
  },

  tracker: {
    step: "Either way",
    title: "The day lands in your tracker",
    body:
      "It does not matter which you picked — you end up with the same work " +
      "day. Anything else that backs it up goes on the same day: the call " +
      "sheet, your contract, wardrobe photos. Worked two contracts that " +
      "day? Both go on, and both get counted.",
    choices: [{ label: "What is it worth?", to: "calculated" }],
  },

  calculated: {
    step: "Straight away",
    title: "We work out what you are owed",
    body:
      "Day rate, the overtime tiers, meal penalties, sixth and seventh day, " +
      "a whole day rate again for every extra contract. Here is that day, " +
      "run through the calculator for real:",
    detail: "calculation",
    choices: [{ label: "My pay stub arrived", to: "paystub" }],
  },

  paystub: {
    step: "Two weeks later",
    title: "Your pay stub arrives",
    body:
      "Type it in the way it is laid out — what each payment was for, the " +
      "hours it covered, the money. Line by line, not one total, because a " +
      "shortfall you can point at is a shortfall you can get paid.",
    detail: "stub",
    choices: [
      { label: "It matches what I'm owed", to: "correct" },
      { label: "It's short", to: "short" },
    ],
  },

  correct: {
    step: "Best case",
    title: "Then you are done",
    body:
      "The day is marked paid and it stops appearing in what you are still " +
      "owed. That is the whole point — most days are fine, and you should " +
      "not have to think about those at all. The ones that are not fine are " +
      "the ones worth your evening.",
    tone: "good",
    choices: [
      {
        label: "Show me the other way it goes",
        to: "short",
        hint: "What happens when the stub is wrong.",
      },
    ],
  },

  short: {
    step: "When it is wrong",
    title: "We write the email for you",
    body:
      "This is the part people do not do, because writing to payroll about " +
      "your own money is unpleasant and you are tired. So it is already " +
      "written — polite, specific, and pointing at the line rather than the " +
      "total. This is the actual email for the day above:",
    detail: "email",
    tone: "bad",
    choices: [{ label: "Payroll sends a correction", to: "corrected" }],
  },

  corrected: {
    step: "And afterwards",
    title: "Add the corrected payment",
    body:
      "The second cheque goes on the same day, next to the first. The day " +
      "settles, the shortfall closes, and what you were actually paid for " +
      "the job — including the bit you had to ask for — is on the record.",
    tone: "good",
    choices: [{ label: "Walk it again", to: "upload" }],
  },
};

const TONE_RING: Record<string, string> = {
  good: "border-primary/50",
  bad: "border-amber-600/50",
};

export function HowItWorksFlow() {
  const [trail, setTrail] = useState<NodeId[]>(["upload"]);
  const current = trail[trail.length - 1];
  const node = NODES[current];

  const go = (to: NodeId) =>
    setTrail((prev) => (to === "upload" ? ["upload"] : [...prev, to]));

  const backTo = (index: number) =>
    setTrail((prev) => prev.slice(0, index + 1));

  return (
    <div className="space-y-4">
      {/* Where they have been, so the shape of the path is visible. */}
      {trail.length > 1 && (
        <ol className="space-y-1">
          {trail.slice(0, -1).map((id, index) => (
            <li key={`${id}-${index}`}>
              <button
                type="button"
                onClick={() => backTo(index)}
                className="w-full text-left flex items-baseline gap-3 rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/40 transition-colors"
              >
                <span aria-hidden className="shrink-0 text-xs">
                  ✓
                </span>
                <span className="truncate">{NODES[id].title}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      <div
        className={`rounded-lg border-2 p-5 space-y-4 ${
          TONE_RING[node.tone ?? ""] ?? "border-border"
        }`}
      >
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            <Editable k={`${current}.step`} d={node.step} />
          </p>
          <h2 className="text-xl font-semibold tracking-tight">
            <Editable k={`${current}.title`} d={node.title} />
          </h2>
        </div>

        <p className="text-base leading-relaxed text-foreground/90">
          <Editable k={`${current}.body`} d={node.body} />
        </p>

        {node.detail === "calculation" && <ExampleCalculation />}
        {node.detail === "stub" && <ExampleStub />}
        {node.detail === "email" && <ExampleEmail />}

        <div className="space-y-2 pt-1">
          {node.choices.map((choice) => (
            <button
              key={choice.label}
              type="button"
              onClick={() => go(choice.to)}
              className="w-full text-left rounded-md border border-border px-4 py-3 hover:border-foreground/40 hover:bg-accent/40 transition-colors"
            >
              <span className="block font-medium">
                <Editable
                  k={`${current}.choice.${choice.to}.label`}
                  d={choice.label}
                />
              </span>
              {choice.hint && (
                <span className="block text-xs text-muted-foreground mt-0.5">
                  <Editable
                    k={`${current}.choice.${choice.to}.hint`}
                    d={choice.hint}
                  />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {trail.length > 2 && (
        <p className="text-center text-sm">
          <Link href="/login" className="underline underline-offset-4">
            Sign in and do this with your own days
          </Link>
        </p>
      )}
    </div>
  );
}

function Panel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-muted/40 border border-border/60 p-3 space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * How late the meal was, read off the calculation rather than written into
 * the copy — the example day can be edited, and a hand-written "an hour and
 * a half late" beside a half-hour penalty is exactly the kind of thing that
 * makes a reader stop trusting the numbers.
 */
function latenessOf(breakdown: typeof BREAKDOWN): string {
  const first = breakdown.penalties.mealPenalties[0];
  if (!first) return "meal penalty";
  const minutes = Math.round(first.minutesLate);
  const late =
    minutes >= 60
      ? `${Number((minutes / 60).toFixed(1))} hours`
      : `${minutes} minutes`;
  return `first meal ${late} late`;
}

function ExampleCalculation() {
  return (
    <Panel label="7am to 7pm · $250 adjustment · meal at 1:30">
      <div className="space-y-1">
        {BREAKDOWN.segments.map((segment, i) => (
          <div
            key={`${segment.label}-${i}`}
            className="flex justify-between gap-3 text-sm"
          >
            <span className="text-muted-foreground">
              {segment.label} · {Number(segment.hours.toFixed(1))}h
            </span>
            <span className="tabular-nums shrink-0">
              {formatCurrency(segment.subtotal)}
            </span>
          </div>
        ))}
        {BREAKDOWN.penalties.totalPenalties > 0 && (
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              Meal penalty · {latenessOf(BREAKDOWN)}
            </span>
            <span className="tabular-nums shrink-0">
              {formatCurrency(BREAKDOWN.penalties.totalPenalties)}
            </span>
          </div>
        )}
        <div className="flex justify-between gap-3 font-medium pt-2 border-t border-border">
          <span>Owed</span>
          <span className="tabular-nums shrink-0">
            {formatCurrency(BREAKDOWN.grandTotal)}
          </span>
        </div>
      </div>
    </Panel>
  );
}

function ExampleStub() {
  return (
    <Panel label="What the stub said">
      <div className="space-y-1">
        {PAID_LINES.map((line) => (
          <div key={line.label} className="flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {line.label}
              {line.hours !== null && ` · ${line.hours}h`}
            </span>
            <span className="tabular-nums shrink-0">
              {formatCurrency(line.amount)}
            </span>
          </div>
        ))}
        <div className="flex justify-between gap-3 text-sm pt-2 border-t border-border">
          <span className="text-muted-foreground">Paid</span>
          <span className="tabular-nums shrink-0">
            {formatCurrency(COMPARISON.paid)}
          </span>
        </div>
        <div className="flex justify-between gap-3 font-medium text-amber-400">
          <span>Short by</span>
          <span className="tabular-nums shrink-0">
            {formatCurrency(COMPARISON.difference)}
          </span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        The overtime and the meal penalty never made it onto the stub. Against
        one total that is invisible; against the lines it is obvious.
      </p>
    </Panel>
  );
}

function ExampleEmail() {
  return (
    <Panel label="Drafted for you, ready to send">
      <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed text-foreground/90 overflow-x-auto">
        {EMAIL}
      </pre>
    </Panel>
  );
}
