import { NextResponse } from "next/server";
import { requireTester } from "@/lib/bank-access";
import { findBankConnection, listBankDeposits } from "@/lib/repos/bank";
import { plaidConfig } from "@/lib/plaid";

/** GET /api/bank/deposits — the connection (without its token) and every deposit with its match. */
export async function GET() {
  const gate = await requireTester();
  if (gate.error) return gate.error;
  try {
    const [connection, deposits, config] = await Promise.all([
      findBankConnection(gate.userId),
      listBankDeposits(gate.userId),
      plaidConfig(),
    ]);
    return NextResponse.json({
      configured: !!config,
      env: config?.env ?? null,
      connection: connection
        ? { id: connection._id, institution: connection.institution, lastSyncedAt: connection.lastSyncedAt, createdAt: connection.createdAt }
        : null,
      deposits,
    });
  } catch (e) {
    console.error("bank deposits error:", e);
    return NextResponse.json({ error: "Couldn't load deposits" }, { status: 500 });
  }
}
