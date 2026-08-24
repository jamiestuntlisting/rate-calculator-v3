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
