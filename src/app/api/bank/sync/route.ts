import { NextResponse } from "next/server";
import { requireTester } from "@/lib/bank-access";
import { PlaidError } from "@/lib/plaid";
import { syncUserDeposits } from "@/lib/bank-sync";

/** POST /api/bank/sync — pull new deposits for this member and match them (bank-sync.ts). */
export async function POST() {
  const gate = await requireTester();
  if (gate.error) return gate.error;
  try {
    const summary = await syncUserDeposits(gate.userId);
    if (!summary) {
      return NextResponse.json({ error: "Plaid is not configured, or no bank is connected" }, { status: 503 });
    }
    return NextResponse.json(summary);
  } catch (e) {
    console.error("bank sync error:", e);
    const message = e instanceof PlaidError ? `${e.code}: ${e.message}` : "Couldn't sync";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
