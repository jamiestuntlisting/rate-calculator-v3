/**
 * "Which membership is right for me" — the question tree.
 *
 * Kept as data rather than nested JSX so the branching can be tested and so
 * the copy can be edited without touching the component. Every step carries
 * a note, because the point of the survey is to teach the difference
 * between the plans on the way through, not just to land on one.
 */

import type { PlanId } from "@/lib/membership-plans";
import { PER_G_BREAK_EVEN, PLAN_PRICES } from "@/lib/membership-plans";

export type QuizStepId =
  | "favorite"
  | "accountant"
  | "noticed"
  | "handOver"
  | "volume"
  | "stillWant";

/** Where an answer leads: on to another question, or to a recommendation. */
export type QuizNext = { step: QuizStepId } | { plan: PlanId };

export interface QuizOption {
  value: string;
  label: string;
  next: QuizNext;
  /** An aside shown under the option. */
  detail?: string;
  /** Set instead of following `next` — the one joke in here. */
  href?: string;
}

export interface QuizStep {
  id: QuizStepId;
  question: string;
  /** The teaching line: what this choice actually changes. */
  note?: string;
  options: QuizOption[];
}

/** Somewhere to send the one person who answers "the accounting". */
const ACCOUNTING_JOBS = "https://www.indeed.com/q-accountant-jobs.html";

export const QUIZ_STEPS: QuizStep[] = [
  {
    id: "favorite",
    question: "What's your favorite part about working in stunts?",
    note: "No wrong answer. Probably.",
    options: [
      { value: "people", label: "The people", next: { step: "noticed" } },
      { value: "money", label: "The money", next: { step: "noticed" } },
      { value: "work", label: "The work", next: { step: "noticed" } },
      { value: "fun", label: "The fun", next: { step: "noticed" } },
      { value: "prestige", label: "The prestige", next: { step: "noticed" } },
      {
        value: "accounting",
        label: "The accounting & paperwork",
        next: { step: "accountant" },
      },
    ],
  },
  {
    id: "accountant",
    question: "You picked the accounting and the paperwork.",
    note:
      "Nobody picks the accounting. If chasing a meal penalty across three " +
      "timecards is genuinely the best part of your week, you are in the " +
      "wrong trade and the pay is better in the right one.",
    options: [
      {
        value: "jobs",
        label: "Show me those jobs",
        detail: "We will not be offended.",
        href: ACCOUNTING_JOBS,
        next: { step: "noticed" },
      },
      {
        value: "joking",
        label: "I was joking. Obviously.",
        next: { step: "noticed" },
      },
    ],
  },
  {
    id: "noticed",
    question: "I noticed you didn't pick accounting.",
    note: "Would you like help with the bookkeeping and paperwork?",
    options: [
      {
        value: "yes",
        label: "Yes, I would really like help",
        next: { step: "handOver" },
      },
      {
        value: "no",
        label: "I don't mind doing it myself",
        next: { step: "stillWant" },
      },
    ],
  },
  {
    id: "handOver",
    question: "How much of it do you want to hand over?",
    note:
      "The calculators are the same either way. The difference is who types " +
      "your Exhibit Gs in — you, or us.",
    options: [
      {
        value: "everything",
        label: "As much as possible",
        detail: "Send us the photo. We read it, enter it and calculate it.",
        next: { step: "volume" },
      },
      {
        value: "math",
        label: "I just have questions here and there",
        detail: "You enter your own Gs; we work out what you are owed.",
        next: { plan: "plus" },
      },
    ],
  },
  {
    id: "volume",
    question: "How many Exhibit Gs do you get in a typical month?",
    note:
      `$${PLAN_PRICES.perExhibitG} an Exhibit G, or ` +
      `$${PLAN_PRICES.transcriptionAddOn} a month for as many as you like — ` +
      `so ${PER_G_BREAK_EVEN} is where the monthly one starts paying for ` +
      `itself.`,
    options: [
      {
        value: "few",
        label: `One to ${PER_G_BREAK_EVEN - 1}`,
        detail: "Cheaper to pay per G.",
        next: { plan: "plus_per_g" },
      },
      {
        value: "many",
        label: `${PER_G_BREAK_EVEN} or more`,
        detail: "The monthly service costs less from here on.",
        next: { plan: "plus_transcription" },
      },
      {
        value: "varies",
        label: "It comes in waves",
        detail: "Nothing for weeks, then a whole show at once.",
        next: { plan: "plus_transcription" },
      },
    ],
  },
  {
    id: "stillWant",
    question: "Do you want the calculators and the tracker?",
    note:
      "Day and weekly rates, overtime, meal penalties, what you are owed and " +
      "what is late. You would be doing your own data entry.",
    options: [
      {
        value: "yes",
        label: "Yes — I'll do my own data entry",
        next: { plan: "plus" },
      },
      {
        value: "no",
        label: "Not right now",
        next: { plan: "free" },
      },
    ],
  },
];

export function stepById(id: QuizStepId): QuizStep {
  const step = QUIZ_STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`Unknown quiz step: ${id}`);
  return step;
}

/** Follow one answer. Returns the next question, or the plan it lands on. */
export function answerStep(
  stepId: QuizStepId,
  value: string
): { step: QuizStep } | { plan: PlanId } {
  const option = stepById(stepId).options.find((o) => o.value === value);
  if (!option) throw new Error(`Unknown answer "${value}" for step ${stepId}`);
  return "plan" in option.next
    ? { plan: option.next.plan }
    : { step: stepById(option.next.step) };
}

/** Walk a whole run of answers, for tests and for replaying a back button. */
export function runQuiz(
  answers: Array<{ step: QuizStepId; value: string }>
): { step: QuizStep } | { plan: PlanId } {
  let current: { step: QuizStep } | { plan: PlanId } = {
    step: stepById("favorite"),
  };
  for (const { step, value } of answers) {
    if ("plan" in current) break;
    current = answerStep(step, value);
  }
  return current;
}

/** Why the survey landed where it did, in the plan's own terms. */
export const PLAN_REASONS: Record<PlanId, string> = {
  free: "You are not sold yet, which is fair. Look around — the calculators and the tracker are behind Plus when you want them.",
  plus: "You want the math done but you are happy to type your own Exhibit Gs in. That is Plus, and nothing per-G on top.",
  plus_per_g: `You want us to read your Gs, but only a few land in a month. Pay the $${PLAN_PRICES.perExhibitG} on the ones you actually send and skip the months you send none.`,
  plus_transcription: `You get enough Exhibit Gs that paying per one adds up. At ${PER_G_BREAK_EVEN} a month the flat $${PLAN_PRICES.transcriptionAddOn} is already cheaper, and it stops you counting.`,
};
