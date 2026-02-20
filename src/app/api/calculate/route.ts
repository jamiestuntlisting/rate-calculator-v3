import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { calculateRate } from "@/lib/rate-engine";
import type { ExhibitGInput } from "@/types";

export async function POST(request: Request) {
  try {
    const input: ExhibitGInput = await request.json();

    // Basic validation
    if (!input.showName || !input.callTime || !input.reportOnSet || !input.dismissOnSet) {
      return NextResponse.json(
        { error: "Missing required fields: showName, callTime, reportOnSet, dismissOnSet" },
        { status: 400 }
      );
    }

    const breakdown = calculateRate(input);

    return NextResponse.json({
      calculationId: uuidv4(),
      input,
      breakdown,
    });
  } catch (error) {
    console.error("Calculation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Calculation failed" },
      { status: 500 }
    );
  }
}
