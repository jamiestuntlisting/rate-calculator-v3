/**
 * The contract rules behind a week's number, and which of them fired.
 *
 * A weekly total is the end of a lot of arithmetic, and a performer looking
 * at it has no way to tell which rules were in play. This says so: what the
 * Codified Basic Agreement provides, what this particular week triggered,
 * and — where a rule turns on something the app cannot see — what to check.
 *
 * Three states, and the difference matters:
 *   applies   — derived from the days, and the money already reflects it
 *   check     — the rule may apply, but it turns on a term of the deal
 *   breached  — the days show the production went under an entitlement
 *
 * Nothing here changes a calculation. It explains one.
 */

import type { WeeklyDerivation } from "./from-work-records";
import { TURNAROUND_RULES, type Turnaround } from "./turnaround";

/**
 * The weekly guarantee, which is the hours the weekly rate buys before
 * weekly overtime starts. Confirmed against all 133 cards in the ShowBiz
 * sample: 112 studio cards carry 44 and 21 distant cards carry 48, with no
 * exceptions either way.
 */
export const WEEKLY_GUARANTEES = [
  {
    id: "studio" as const,
    hours: 44,
    label: "Studio",
    detail:
      "The weekly rate buys 44 hours in a studio workweek. Past that, " +
      "weekly overtime is time-and-a-half, counted in tenths of an hour.",
  },
  {
    id: "distant" as const,
    hours: 48,
    label: "Overnight location",
    detail:
      "On an overnight location the guarantee is 48 hours rather than 44. " +
      "The extra four are paid as location allowance, not as overtime.",
  },
];

export type GuaranteeId = (typeof WEEKLY_GUARANTEES)[number]["id"];

export interface WeekRule {
  id: string;
  title: string;
  /** What the agreement provides. */
  detail: string;
  status: "applies" | "check" | "breached";
  /** What this week showed, where the days can show it. */
  evidence?: string;
}

export interface WeekRuleInput {
  derivation: WeeklyDerivation;
  turnarounds: Turnaround[];
  turnaroundHours: number;
  guarantee: GuaranteeId;
}

const hrs = (n: number) => `${Number(n.toFixed(1))}h`;

/** "Tue, Aug 25" — workDate arrives as a full ISO string from the API. */
const shortDate = (workDate: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(workDate || "");
  if (!m) return workDate;
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  ).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export function weekRules({
  derivation,
  turnarounds,
  turnaroundHours,
  guarantee,
}: WeekRuleInput): WeekRule[] {
  const rules: WeekRule[] = [];
  const guaranteed =
    WEEKLY_GUARANTEES.find((g) => g.id === guarantee) ?? WEEKLY_GUARANTEES[0];

  // --- The guarantee -------------------------------------------------
  const worked = derivation.workHours;
  const over = worked - guaranteed.hours;
  const counted = derivation.days - derivation.daysWithoutCalculation;
  rules.push({
    id: "guarantee",
    title: `${guaranteed.hours}-hour guarantee (${guaranteed.label.toLowerCase()})`,
    detail: guaranteed.detail,
    status: over > 0.05 ? "applies" : "check",
    evidence:
      counted === 0
        ? // Saying "0h worked, inside the guarantee" would read as a finding.
          `No hours counted yet — none of these days has been worked out.`
        : over > 0.05
          ? `${hrs(worked)} worked — ${hrs(over)} past the guarantee.`
          : `${hrs(worked)} worked, inside the ${guaranteed.hours}-hour guarantee.` +
            (derivation.daysWithoutCalculation > 0
              ? ` Counting ${counted} of ${derivation.days} days.`
              : ""),
  });

  // --- Daily overtime, which runs alongside the weekly guarantee ------
  const dailyOt = derivation.dailyOvertimeHours;
  const double = derivation.doubleTimeHours;
  if (dailyOt > 0.05 || double > 0.05) {
    const parts = [
      dailyOt > 0.05 ? `${hrs(dailyOt)} at time-and-a-half` : null,
      double > 0.05 ? `${hrs(double)} at double time` : null,
    ].filter(Boolean);
    rules.push({
      id: "daily_overtime",
      title: "Daily overtime",
      detail:
        "The ninth and tenth hours of a day are time-and-a-half and " +
        "anything past the tenth is double time. This is worked out day by " +
        "day and does not wait for the week to reach its guarantee.",
      status: "applies",
      evidence: `${parts.join(", ")} across the week.`,
    });
  }

  // --- Rest between days ---------------------------------------------
  const rule =
    TURNAROUND_RULES.find((r) => r.hours === turnaroundHours) ??
    TURNAROUND_RULES[0];
  const shortRests = turnarounds.filter((t) => t.short);
  if (turnarounds.length > 0) {
    rules.push({
      id: "turnaround",
      title: `Rest between days — ${turnaroundHours} hours`,
      detail: rule.condition,
      status: shortRests.length > 0 ? "breached" : "applies",
      evidence:
        shortRests.length > 0
          ? `${plural(shortRests.length, "day", "days")} came back short: ` +
            shortRests
              .map((t) => `${shortDate(t.to.workDate)} after ${hrs(t.hours)}`)
              .join(", ") +
            ". A short rest is a forced call and is owed."
          : `Every gap cleared ${turnaroundHours} hours — the shortest was ` +
            `${hrs(Math.min(...turnarounds.map((t) => t.hours)))}.`,
    });
  }

  // --- Sixth and seventh days ----------------------------------------
  if (derivation.sixthDay || derivation.seventhDay) {
    rules.push({
      id: "consecutive_days",
      title: derivation.seventhDay ? "Seventh day" : "Sixth day",
      detail:
        "A studio workweek is any five days out of seven consecutive; the " +
        "sixth and seventh are days off. Worked, the sixth pays " +
        "time-and-a-half and the seventh double.",
      status: "applies",
      evidence: `${plural(derivation.days, "day", "days")} in this week.`,
    });
  }

  // --- Holidays -------------------------------------------------------
  if (derivation.holidayDays > 0) {
    rules.push({
      id: "holiday",
      title: "Worked holiday",
      detail: "A holiday worked adds a day at scale on top of the guarantee.",
      status: "applies",
      evidence: `${plural(derivation.holidayDays, "holiday", "holidays")} worked.`,
    });
  }

  // --- Days that cannot be counted ------------------------------------
  if (derivation.daysWithoutCalculation > 0) {
    rules.push({
      id: "incomplete",
      title: "Days not yet worked out",
      detail:
        "A day with no times on it cannot contribute hours, so the week " +
        "reads low. Fill the day in and the total will move.",
      status: "check",
      evidence: `${plural(
        derivation.daysWithoutCalculation,
        "day has",
        "days have"
      )} no times entered.`,
    });
  }

  return rules;
}
