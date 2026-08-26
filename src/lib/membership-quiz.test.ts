import { describe, it, expect } from "vitest";
import {
  answerStep,
  PLAN_REASONS,
  QUIZ_STEPS,
  runQuiz,
  stepById,
} from "./membership-quiz";
import { PER_G_BREAK_EVEN, PLANS } from "./membership-plans";

/** Follow a step's answer, asserting it did not land on a plan yet. */
function expectStep(result: ReturnType<typeof answerStep>) {
  if ("plan" in result) throw new Error(`Expected a question, got ${result.plan}`);
  return result.step;
}

describe("membership quiz", () => {
  it("asks about the accounting first, with it as one of six answers", () => {
    const first = stepById("favorite");
    expect(first.question).toMatch(/favorite part/i);
    expect(first.options.map((o) => o.value)).toEqual([
      "people",
      "money",
      "work",
      "fun",
      "prestige",
      "accounting",
    ]);
  });

  it("calls out anyone who did not pick accounting", () => {
    for (const value of ["people", "money", "work", "fun", "prestige"]) {
      const next = expectStep(answerStep("favorite", value));
      expect(next.id).toBe("noticed");
      expect(next.question).toMatch(/didn't pick accounting/i);
    }
  });

  it("sends the one person who did pick it to a job board", () => {
    const next = expectStep(answerStep("favorite", "accounting"));
    expect(next.id).toBe("accountant");

    const jobs = next.options.find((o) => o.value === "jobs");
    expect(jobs?.href).toMatch(/^https:\/\//);

    // The joke is not a dead end: they can carry on to the real survey.
    expect(next.options.some((o) => !o.href)).toBe(true);
  });

  it("rejoins the survey whichever way the joke is answered", () => {
    for (const value of ["jobs", "joking"]) {
      expect(expectStep(answerStep("accountant", value)).id).toBe("noticed");
    }
  });

  it("puts a performer who does their own entry on Plus", () => {
    expect(
      runQuiz([
        { step: "favorite", value: "work" },
        { step: "noticed", value: "yes" },
        { step: "handOver", value: "math" },
      ])
    ).toEqual({ plan: "plus" });
  });

  it("pays per G below the break-even and monthly at or above it", () => {
    const handOver = [
      { step: "favorite" as const, value: "money" },
      { step: "noticed" as const, value: "yes" },
      { step: "handOver" as const, value: "everything" },
    ];
    expect(runQuiz([...handOver, { step: "volume", value: "few" }])).toEqual({
      plan: "plus_per_g",
    });
    expect(runQuiz([...handOver, { step: "volume", value: "many" }])).toEqual({
      plan: "plus_transcription",
    });
    // Unpredictable volume is the case per-G billing is worst at.
    expect(runQuiz([...handOver, { step: "volume", value: "varies" }])).toEqual({
      plan: "plus_transcription",
    });
  });

  it("names the break-even in the question that turns on it", () => {
    const volume = stepById("volume");
    expect(volume.note).toContain(String(PER_G_BREAK_EVEN));
    expect(volume.options.map((o) => o.label)).toEqual([
      `One to ${PER_G_BREAK_EVEN - 1}`,
      `${PER_G_BREAK_EVEN} or more`,
      "It comes in waves",
    ]);
  });

  it("offers free only to someone who turned down both", () => {
    expect(
      runQuiz([
        { step: "favorite", value: "fun" },
        { step: "noticed", value: "no" },
        { step: "stillWant", value: "no" },
      ])
    ).toEqual({ plan: "free" });

    expect(
      runQuiz([
        { step: "favorite", value: "fun" },
        { step: "noticed", value: "no" },
        { step: "stillWant", value: "yes" },
      ])
    ).toEqual({ plan: "plus" });
  });

  it("can reach every plan, so no plan is unrecommendable", () => {
    const reached = new Set<string>();
    const walk = (stepId: Parameters<typeof stepById>[0]) => {
      for (const option of stepById(stepId).options) {
        if ("plan" in option.next) reached.add(option.next.plan);
        else if (option.next.step !== stepId) walk(option.next.step);
      }
    };
    walk("favorite");
    expect([...reached].sort()).toEqual(PLANS.map((p) => p.id).sort());
  });

  it("explains every plan it can land on", () => {
    for (const plan of PLANS) {
      expect(PLAN_REASONS[plan.id]?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it("teaches something at every step", () => {
    for (const step of QUIZ_STEPS) {
      expect(step.note, `${step.id} has no note`).toBeTruthy();
      expect(step.options.length).toBeGreaterThan(1);
    }
  });
});
