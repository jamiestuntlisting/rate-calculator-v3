import { NextResponse } from "next/server";
import { requireTester } from "@/lib/bank-access";
import { plaidConfig, removeItem } from "@/lib/plaid";
import { deleteBankConnection, findBankConnection } from "@/lib/repos/bank";

/** DELETE /api/bank/connection — disconnect the bank and forget its deposits. */
export async function DELETE() {
  const gate = await requireTester();
  if (gate.error) return gate.error;
  try {
    const connection = await findBankConnection(gate.userId);
    if (!connection) return NextResponse.json({ removed: false });
    const config = await plaidConfig();
    if (config) {
      try {
        await removeItem(config, connection.accessToken);
      } catch (e) {
        console.error("plaid item/remove failed (continuing):", e);
      }
    }
    await deleteBankConnection(gate.userId, connection._id);
    return NextResponse.json({ removed: true });
  } catch (e) {
    console.error("bank disconnect error:", e);
    return NextResponse.json({ error: "Couldn't disconnect" }, { status: 500 });
  }
}
