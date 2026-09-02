import { NextResponse } from "next/server";
import { requireTester } from "@/lib/bank-access";
import { createLinkToken, plaidConfig, PlaidError } from "@/lib/plaid";

/** POST /api/bank/link-token — a Plaid Link token for the page to open Link with. */
export async function POST() {
  const gate = await requireTester();
  if (gate.error) return gate.error;
  try {
    const config = await plaidConfig();
    if (!config) {
      return NextResponse.json(
        { error: "Plaid is not configured — PLAID_CLIENT_ID and PLAID_SECRET are needed." },
        { status: 503 }
      );
    }
    const linkToken = await createLinkToken(config, gate.userId);
    return NextResponse.json({ linkToken, env: config.env });
  } catch (e) {
    console.error("bank link-token error:", e);
    const message = e instanceof PlaidError ? `${e.code}: ${e.message}` : "Couldn't start Plaid Link";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
