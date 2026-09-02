import { NextResponse } from "next/server";
import { requireTester } from "@/lib/bank-access";
import { exchangePublicToken, plaidConfig, PlaidError } from "@/lib/plaid";
import { createBankConnection, deleteBankConnection, findBankConnection } from "@/lib/repos/bank";

/** POST /api/bank/exchange — { publicToken, institution } from Link's onSuccess. */
export async function POST(request: Request) {
  const gate = await requireTester();
  if (gate.error) return gate.error;
  try {
    const config = await plaidConfig();
    if (!config) return NextResponse.json({ error: "Plaid is not configured" }, { status: 503 });
    const body = (await request.json()) as { publicToken?: string; institution?: string };
    if (!body.publicToken) return NextResponse.json({ error: "publicToken required" }, { status: 400 });
    const { accessToken, itemId } = await exchangePublicToken(config, body.publicToken);
    // One connection per member: a new one replaces the old.
    const existing = await findBankConnection(gate.userId);
    if (existing) await deleteBankConnection(gate.userId, existing._id);
    const connection = await createBankConnection({
      userId: gate.userId,
      itemId,
      accessToken,
      institution: body.institution?.trim() || null,
    });
    return NextResponse.json({ connected: true, institution: connection.institution });
  } catch (e) {
    console.error("bank exchange error:", e);
    const message = e instanceof PlaidError ? `${e.code}: ${e.message}` : "Couldn't connect the account";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
