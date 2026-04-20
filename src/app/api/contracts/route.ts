import { NextResponse } from "next/server";
import {
  RATES,
  OVERTIME,
  MULTIPLIERS,
  MEAL_PENALTIES,
  FORCED_CALL,
} from "@/lib/rate-constants";

const CONTRACT_LABELS: Record<keyof typeof RATES, string> = {
  theatrical_basic: "Theatrical Basic",
  television: "Television",
  stunt_coordinator: "Stunt Coordinator",
};

export async function GET() {
  const contracts = (Object.keys(RATES) as Array<keyof typeof RATES>).map(
    (key) => ({
      id: key,
      label: CONTRACT_LABELS[key],
      daily: RATES[key].daily,
      weekly: RATES[key].weekly,
      hourly: RATES[key].hourly,
      straightTimeHours: RATES[key].straightTimeHours,
    })
  );

  return NextResponse.json({
    agreement: "SAG-AFTRA Theatrical Basic Agreement 2025-2026",
    effectiveDate: "2025-07-01",
    contracts,
    overtime: {
      straightTimeEnd: OVERTIME.straightTimeEnd,
      timeAndHalfEnd: OVERTIME.timeAndHalfEnd,
      multipliers: {
        straight: MULTIPLIERS.straight,
        timeAndHalf: MULTIPLIERS.timeAndHalf,
        doubleTime: MULTIPLIERS.doubleTime,
      },
    },
    dayMultipliers: {
      sixthDay: MULTIPLIERS.sixthDay,
      seventhDay: MULTIPLIERS.seventhDay,
      holiday: MULTIPLIERS.holiday,
    },
    mealPenalties: MEAL_PENALTIES,
    forcedCall: FORCED_CALL,
  });
}
