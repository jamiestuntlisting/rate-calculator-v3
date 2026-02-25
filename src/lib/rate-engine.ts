import {
  RATES,
  OVERTIME,
  MULTIPLIERS,
  MEAL_PENALTIES,
  FORCED_CALL,
} from "./rate-constants";
import type { RateSchedule } from "./rate-constants";
import {
  calculateDuration,
  calculateMealMinutes,
  roundUpToTenthHour,
  minutesToDecimalHours,
  getLatestTime,
  parseTimeToMinutes,
} from "./time-utils";
import type {
  ExhibitGInput,
  CalculationBreakdown,
  TimeSegment,
  MealPenalty,
} from "@/types";

/**
 * Main rate calculation function.
 * Pure function: takes Exhibit G input, returns full breakdown.
 */
export function calculateRate(input: ExhibitGInput, options?: { skipRounding?: boolean; additionalSeconds?: number }): CalculationBreakdown {
  const rates = RATES[input.workStatus as RateSchedule];
  const baseRate = rates.daily;
  const hourlyRate = rates.hourly;

  // Step 1: Apply stunt adjustment to base rate BEFORE OT calculation
  const adjustedBaseRate = baseRate + input.stuntAdjustment;
  const adjustedHourlyRate = adjustedBaseRate / 8;

  // Step 2: Validate NDB — must end within 2 hours of call time
  if (input.ndMealIn && input.ndMealOut) {
    const callMin = parseTimeToMinutes(input.callTime);
    let ndOutMin = parseTimeToMinutes(input.ndMealOut);
    if (ndOutMin < callMin) ndOutMin += 24 * 60;
    if (ndOutMin - callMin > 2 * 60) {
      throw new Error(
        "ND meal must end within 2 hours of call time"
      );
    }
  }

  // Step 3: Determine work start and end times
  const workStart = input.callTime;
  const workEnd = getLatestTime(
    workStart,
    input.dismissOnSet,
    input.dismissMakeupWardrobe
  );

  // Step 4: Calculate total elapsed time (add fractional seconds for real-time counter)
  let totalElapsedMinutes = calculateDuration(workStart, workEnd);
  if (options?.additionalSeconds) {
    totalElapsedMinutes += options.additionalSeconds / 60;
  }

  // Step 5: Subtract DEDUCTIBLE meal periods only (ND meals are non-deductible — they count as work time)
  const meals = [
    { start: input.firstMealStart, finish: input.firstMealFinish },
    { start: input.secondMealStart, finish: input.secondMealFinish },
  ];
  const mealMinutes = calculateMealMinutes(meals);
  const netWorkMinutes = Math.max(0, totalElapsedMinutes - mealMinutes);

  // Step 6: Round to 1/10th hour increments (skip for real-time counter mode)
  const netWorkMinutesRounded = options?.skipRounding ? netWorkMinutes : roundUpToTenthHour(netWorkMinutes);
  const netWorkHours = minutesToDecimalHours(netWorkMinutesRounded);
  const totalWorkHours = minutesToDecimalHours(totalElapsedMinutes);
  const totalMealTime = minutesToDecimalHours(mealMinutes);

  // Step 7: Determine day multiplier
  const dayMultiplierInfo = getDayMultiplier(input);

  // Step 8: Build time segments with OT tiers
  // When stunt adjustment exceeds base daily rate, 1.5x extends to hour 12 (double time at 13+)
  const effectiveTimeAndHalfEnd =
    input.stuntAdjustment > baseRate ? 12 : OVERTIME.timeAndHalfEnd;
  const segments = buildTimeSegments(
    netWorkHours,
    adjustedHourlyRate,
    dayMultiplierInfo.multiplier,
    effectiveTimeAndHalfEnd
  );

  // Step 9: Calculate meal penalties
  const mealPenalties = calculateMealPenalties(input);

  // Step 10: Calculate forced call penalty
  const forcedCallPenalty = input.forcedCall
    ? Math.min(adjustedBaseRate, FORCED_CALL.maxPenalty)
    : 0;

  // Step 11: Sum everything — enforce 8-hour daily minimum guarantee
  const segmentTotal = segments.reduce((sum, s) => sum + s.subtotal, 0);
  const dailyMinimum = round2(adjustedBaseRate * dayMultiplierInfo.multiplier);
  const adjustedSegmentTotal = Math.max(segmentTotal, dailyMinimum);
  const penaltyTotal =
    mealPenalties.reduce((sum, p) => sum + p.amount, 0) + forcedCallPenalty;
  const grandTotal = adjustedSegmentTotal + penaltyTotal;

  return {
    baseRate,
    hourlyRate,
    adjustedBaseRate,
    adjustedHourlyRate,
    totalWorkHours,
    totalMealTime,
    netWorkHours,
    segments,
    penalties: {
      mealPenalties,
      forcedCallPenalty,
      totalPenalties: penaltyTotal,
    },
    dayMultiplier: dayMultiplierInfo,
    grandTotal,
  };
}

/**
 * Determine the day multiplier based on 6th/7th day or holiday.
 */
function getDayMultiplier(input: ExhibitGInput): {
  applied: boolean;
  type: "6th_day" | "7th_day" | "holiday" | null;
  multiplier: number;
} {
  // Holiday takes precedence, then 7th day, then 6th day
  if (input.isHoliday) {
    return { applied: true, type: "holiday", multiplier: MULTIPLIERS.holiday };
  }
  if (input.isSeventhDay) {
    return {
      applied: true,
      type: "7th_day",
      multiplier: MULTIPLIERS.seventhDay,
    };
  }
  if (input.isSixthDay) {
    return {
      applied: true,
      type: "6th_day",
      multiplier: MULTIPLIERS.sixthDay,
    };
  }
  return { applied: false, type: null, multiplier: 1.0 };
}

/**
 * Build time segments with overtime tiers.
 *
 * Normal day: Hours 1-8 at 1.0x, 9-10 at 1.5x, 11+ at 2.0x
 * High stunt adj (> base rate): Hours 1-8 at 1.0x, 9-12 at 1.5x, 13+ at 2.0x
 * 6th day: minimum 1.5x for all hours (OT still applies if higher)
 * 7th day / holiday: minimum 2.0x for all hours
 */
function buildTimeSegments(
  netWorkHours: number,
  adjustedHourlyRate: number,
  dayMultiplier: number,
  timeAndHalfEnd: number
): TimeSegment[] {
  const segments: TimeSegment[] = [];
  let remainingHours = netWorkHours;

  // Segment 1: Straight time (hours 1-8)
  const straightHours = round1(Math.min(
    remainingHours,
    OVERTIME.straightTimeEnd
  ));
  if (straightHours > 0) {
    const effectiveMultiplier = Math.max(MULTIPLIERS.straight, dayMultiplier);
    segments.push({
      label:
        dayMultiplier > 1
          ? `Base Time (Hrs 1-${Math.min(netWorkHours, 8).toFixed(1).replace(".0", "")})`
          : `Straight Time (Hrs 1-${Math.min(netWorkHours, 8).toFixed(1).replace(".0", "")})`,
      hours: straightHours,
      rate: adjustedHourlyRate,
      multiplier: effectiveMultiplier,
      subtotal: round2(straightHours * adjustedHourlyRate * effectiveMultiplier),
    });
    remainingHours -= straightHours;
  }

  // Segment 2: Time-and-a-half (hours 9-10, or 9-12 when stunt adj > base rate)
  const timeAndHalfCapacity = timeAndHalfEnd - OVERTIME.straightTimeEnd;
  const timeAndHalfHours = round1(Math.min(remainingHours, timeAndHalfCapacity));
  if (timeAndHalfHours > 0) {
    const effectiveMultiplier = Math.max(
      MULTIPLIERS.timeAndHalf,
      dayMultiplier
    );
    segments.push({
      label: `Time-and-a-Half (Hrs ${OVERTIME.straightTimeEnd + 1}-${OVERTIME.straightTimeEnd + Math.ceil(timeAndHalfHours)})`,
      hours: timeAndHalfHours,
      rate: adjustedHourlyRate,
      multiplier: effectiveMultiplier,
      subtotal: round2(
        timeAndHalfHours * adjustedHourlyRate * effectiveMultiplier
      ),
    });
    remainingHours -= timeAndHalfHours;
  }

  // Segment 3: Double time (hours 11+ or 13+ when stunt adj > base rate)
  if (remainingHours > 0) {
    const roundedRemaining = round1(remainingHours);
    const effectiveMultiplier = Math.max(
      MULTIPLIERS.doubleTime,
      dayMultiplier
    );
    segments.push({
      label: `Double Time (Hrs ${timeAndHalfEnd + 1}+)`,
      hours: roundedRemaining,
      rate: adjustedHourlyRate,
      multiplier: effectiveMultiplier,
      subtotal: round2(
        roundedRemaining * adjustedHourlyRate * effectiveMultiplier
      ),
    });
  }

  return segments;
}

/**
 * Calculate meal penalties based on when meals were taken vs required deadlines.
 */
function calculateMealPenalties(input: ExhibitGInput): MealPenalty[] {
  const penalties: MealPenalty[] = [];
  const callMinutes = parseTimeToMinutes(input.callTime);

  // Check ND meal — if provided, it resets the meal clock
  let mealClockStart = callMinutes;
  if (input.ndMealIn && input.ndMealOut) {
    // ND meal resets the clock from the ND meal out time
    let ndOutMinutes = parseTimeToMinutes(input.ndMealOut);
    if (ndOutMinutes < callMinutes) ndOutMinutes += 24 * 60;
    mealClockStart = ndOutMinutes;
  }

  // 1st meal penalty check
  const maxFirstMealMinutes =
    mealClockStart + MEAL_PENALTIES.maxHoursBeforeFirstMeal * 60;

  if (input.firstMealStart) {
    let firstMealStartMin = parseTimeToMinutes(input.firstMealStart);
    if (firstMealStartMin < callMinutes) firstMealStartMin += 24 * 60;

    if (firstMealStartMin > maxFirstMealMinutes) {
      const minutesLate = firstMealStartMin - maxFirstMealMinutes;
      const penaltyItems = calculatePenaltyAmounts("1st Meal", minutesLate);
      penalties.push(...penaltyItems);
    }
  } else {
    // No first meal recorded — check if work exceeded 6 hours
    const workEnd = getLatestTime(
      input.callTime,
      input.dismissOnSet,
      input.dismissMakeupWardrobe
    );
    const totalMinutes = calculateDuration(input.callTime, workEnd);
    if (totalMinutes > MEAL_PENALTIES.maxHoursBeforeFirstMeal * 60) {
      // Entire work period past 6 hours is late
      const minutesLate =
        totalMinutes - MEAL_PENALTIES.maxHoursBeforeFirstMeal * 60;
      const penaltyItems = calculatePenaltyAmounts("1st Meal", minutesLate);
      penalties.push(...penaltyItems);
    }
  }

  // 2nd meal penalty check
  if (input.firstMealFinish) {
    let firstMealFinishMin = parseTimeToMinutes(input.firstMealFinish);
    if (firstMealFinishMin < callMinutes) firstMealFinishMin += 24 * 60;

    const maxSecondMealMinutes =
      firstMealFinishMin + MEAL_PENALTIES.maxHoursBeforeSecondMeal * 60;

    if (input.secondMealStart) {
      let secondMealStartMin = parseTimeToMinutes(input.secondMealStart);
      if (secondMealStartMin < callMinutes) secondMealStartMin += 24 * 60;

      if (secondMealStartMin > maxSecondMealMinutes) {
        const minutesLate = secondMealStartMin - maxSecondMealMinutes;
        const penaltyItems = calculatePenaltyAmounts("2nd Meal", minutesLate);
        penalties.push(...penaltyItems);
      }
    } else {
      // No second meal — check if work continued 6+ hours past first meal finish
      // Meal penalties stop at dismiss on set
      let penaltyEndMin = parseTimeToMinutes(input.dismissOnSet);
      if (penaltyEndMin < callMinutes) penaltyEndMin += 24 * 60;
      if (penaltyEndMin < firstMealFinishMin) penaltyEndMin += 24 * 60;

      if (penaltyEndMin > maxSecondMealMinutes) {
        const minutesLate = penaltyEndMin - maxSecondMealMinutes;
        const penaltyItems = calculatePenaltyAmounts("2nd Meal", minutesLate);
        penalties.push(...penaltyItems);
      }
    }
  }

  // 3rd meal penalty check (after 2nd meal finish, if work continues 6+ hours)
  if (input.secondMealFinish) {
    let secondMealFinishMin = parseTimeToMinutes(input.secondMealFinish);
    if (secondMealFinishMin < callMinutes) secondMealFinishMin += 24 * 60;

    const maxThirdMealMinutes =
      secondMealFinishMin + MEAL_PENALTIES.maxHoursBeforeSecondMeal * 60;

    // Meal penalties stop at dismiss on set
    let penaltyEndMin = parseTimeToMinutes(input.dismissOnSet);
    if (penaltyEndMin < callMinutes) penaltyEndMin += 24 * 60;
    // Handle overnight: if penalty end is before 2nd meal finish, it must be next day
    if (penaltyEndMin < secondMealFinishMin) penaltyEndMin += 24 * 60;

    if (penaltyEndMin > maxThirdMealMinutes) {
      const minutesLate = penaltyEndMin - maxThirdMealMinutes;
      const penaltyItems = calculatePenaltyAmounts("3rd Meal", minutesLate);
      penalties.push(...penaltyItems);
    }
  }

  return penalties;
}

/**
 * Calculate escalating penalty amounts for a given number of minutes late.
 * 1st 30 min = $25, 2nd 30 min = $35, each additional 30 min = $50
 */
function calculatePenaltyAmounts(
  mealLabel: string,
  minutesLate: number
): MealPenalty[] {
  const penalties: MealPenalty[] = [];
  let remaining = minutesLate;
  let periodCount = 0;

  while (remaining > 0) {
    periodCount++;
    const periodMinutes = Math.min(remaining, 30);
    let amount: number;

    if (periodCount === 1) {
      amount = MEAL_PENALTIES.firstHalfHour;
    } else if (periodCount === 2) {
      amount = MEAL_PENALTIES.secondHalfHour;
    } else {
      amount = MEAL_PENALTIES.eachAdditionalHalfHour;
    }

    penalties.push({
      meal: mealLabel,
      minutesLate: periodMinutes,
      amount,
    });

    remaining -= 30;
  }

  return penalties;
}

/**
 * Round to 1 decimal place (nearest tenth of an hour).
 */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Round to 2 decimal places.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
