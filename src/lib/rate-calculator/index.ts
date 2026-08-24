// Engine
export { calculateRate } from "./rate-engine";

// Constants
export {
  RATES,
  OVERTIME,
  MULTIPLIERS,
  MEAL_PENALTIES,
  FORCED_CALL,
  TIME_INCREMENT_MINUTES,
  EFFECTIVE_DATE,
} from "./rate-constants";
export type { RateSchedule } from "./rate-constants";

// Calculation types
export type {
  ExhibitGInput,
  TimeSegment,
  MealPenalty,
  CalculationBreakdown,
} from "./types";

// Time / formatting utilities
export {
  parseTimeToMinutes,
  roundUpToTenthHour,
  minutesToDecimalHours,
  calculateDuration,
  calculateMealMinutes,
  getEarliestTime,
  getLatestTime,
  formatDuration,
  formatCurrency,
  isValidTime,
  snapToSixMinutes,
  calculatePaymentDueDate,
} from "./time-utils";
