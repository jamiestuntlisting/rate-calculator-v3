import { TIME_INCREMENT_MINUTES } from "./rate-constants";
import { parseISO, nextSaturday, addDays, isSaturday } from "date-fns";

/**
 * Parse "HH:MM" string to minutes since midnight.
 */
export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Round minutes UP to the nearest 6-minute (1/10th hour) increment.
 */
export function roundUpToTenthHour(minutes: number): number {
  return Math.ceil(minutes / TIME_INCREMENT_MINUTES) * TIME_INCREMENT_MINUTES;
}

/**
 * Convert minutes to decimal hours, rounded to 1 decimal place.
 */
export function minutesToDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

/**
 * Calculate duration between two "HH:MM" times in minutes.
 * Handles overnight wrap (e.g., call at 18:00, dismiss at 02:00 = 480 min).
 */
export function calculateDuration(startTime: string, endTime: string): number {
  const startMin = parseTimeToMinutes(startTime);
  let endMin = parseTimeToMinutes(endTime);

  // Handle overnight shift
  if (endMin <= startMin) {
    endMin += 24 * 60;
  }

  return endMin - startMin;
}

/**
 * Calculate total meal break time from meal periods in minutes.
 */
export function calculateMealMinutes(
  meals: Array<{ start: string | null; finish: string | null }>
): number {
  let total = 0;
  for (const meal of meals) {
    if (meal.start && meal.finish) {
      total += calculateDuration(meal.start, meal.finish);
    }
  }
  return total;
}

/**
 * Get the earliest non-null time from a list of "HH:MM" strings.
 */
export function getEarliestTime(...times: (string | null)[]): string {
  const validTimes = times.filter((t): t is string => t !== null && t !== "");
  if (validTimes.length === 0) throw new Error("No valid times provided");

  return validTimes.reduce((earliest, time) => {
    return parseTimeToMinutes(time) < parseTimeToMinutes(earliest)
      ? time
      : earliest;
  });
}

/**
 * Get the latest non-null time from a list of "HH:MM" strings.
 * Handles overnight by comparing relative to the first time in the list.
 */
export function getLatestTime(referenceStart: string, ...times: (string | null)[]): string {
  const validTimes = times.filter((t): t is string => t !== null && t !== "");
  if (validTimes.length === 0) throw new Error("No valid times provided");

  const refMin = parseTimeToMinutes(referenceStart);

  return validTimes.reduce((latest, time) => {
    let latestMin = parseTimeToMinutes(latest);
    let timeMin = parseTimeToMinutes(time);

    // Handle overnight
    if (latestMin < refMin) latestMin += 24 * 60;
    if (timeMin < refMin) timeMin += 24 * 60;

    return timeMin > latestMin ? time : latest;
  });
}

/**
 * Format minutes as "Xh Ym" for display.
 */
export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Format a dollar amount as "$X,XXX.XX".
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/**
 * Validate "HH:MM" format.
 */
export function isValidTime(time: string): boolean {
  const match = time.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return match !== null;
}

/**
 * Snap a time string to the nearest 6-minute increment.
 */
export function snapToSixMinutes(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const snapped = Math.round(m / 6) * 6;
  const adjustedH = snapped === 60 ? (h + 1) % 24 : h;
  const adjustedM = snapped === 60 ? 0 : snapped;
  return `${String(adjustedH).padStart(2, "0")}:${String(adjustedM).padStart(2, "0")}`;
}

/**
 * Calculate the SAG-AFTRA payment due date.
 * Rule: Wednesday after the 2nd Saturday following the work date.
 *
 * Example: Work date Monday Jan 6 → 1st Sat Jan 11 → 2nd Sat Jan 18 → Wed Jan 22
 */
export function calculatePaymentDueDate(workDateStr: string): Date {
  const workDate = parseISO(workDateStr);

  // Find the first Saturday after the work date
  // If workDate IS a Saturday, nextSaturday returns the NEXT one (7 days later)
  const firstSat = isSaturday(workDate)
    ? addDays(workDate, 7)
    : nextSaturday(workDate);

  // 2nd Saturday = 7 days after 1st Saturday
  const secondSat = addDays(firstSat, 7);

  // Wednesday after 2nd Saturday = 4 days later
  const dueDate = addDays(secondSat, 4);

  return dueDate;
}
