import type { RateSchedule } from "./rate-constants";

export interface ExhibitGInput {
  showName: string;
  workDate: string; // ISO date string "YYYY-MM-DD"
  callTime: string; // "HH:MM" 24hr
  dismissOnSet: string;
  dismissMakeupWardrobe: string | null;
  ndMealIn: string | null;
  ndMealOut: string | null;
  firstMealStart: string | null;
  firstMealFinish: string | null;
  secondMealStart: string | null;
  secondMealFinish: string | null;
  stuntAdjustment: number;
  forcedCall: boolean;
  isSixthDay: boolean;
  isSeventhDay: boolean;
  isHoliday: boolean;
  workStatus: RateSchedule;
  /**
   * A negotiated number that buys the day outright — a flat deal. Given
   * one, the day comes back as a single segment however long it ran and
   * earns no overtime; meal penalties are not wages and still land on top.
   */
  flatDayRate?: number | null;
  /**
   * Replaces the schedule's daily rate while leaving it a scale day:
   * overtime tiers, the stunt adjustment and penalties all work off it as
   * normal. This is how a day inside a weekly contract is approximated —
   * the weekly scale spread over its days. A flat deal wins over this,
   * because a flat deal is the whole deal.
   */
  dayRateOverride?: number | null;
  characterName: string;
  notes: string;
}

export interface TimeSegment {
  label: string;
  hours: number;
  rate: number;
  multiplier: number;
  subtotal: number;
}

export interface MealPenalty {
  meal: string;
  minutesLate: number;
  amount: number;
}

export interface CalculationBreakdown {
  baseRate: number;
  hourlyRate: number;
  adjustedBaseRate: number;
  adjustedHourlyRate: number;
  totalWorkHours: number;
  totalMealTime: number;
  netWorkHours: number;
  segments: TimeSegment[];
  penalties: {
    mealPenalties: MealPenalty[];
    forcedCallPenalty: number;
    totalPenalties: number;
  };
  dayMultiplier: {
    applied: boolean;
    type: "6th_day" | "7th_day" | "holiday" | null;
    multiplier: number;
  };
  grandTotal: number;
}
