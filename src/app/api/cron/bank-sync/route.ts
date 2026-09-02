import { NextResponse } from "next/server";
import { getSession, isAdminEmail } from "@/lib/auth";
import { syncAllBanks } from "@/lib/bank-sync";

/**
 * POST /api/cron/bank-sync — every connected member's bank, pulled and
 * matched. Called once a day by the Worker's cron (scripts/cron-worker.js), which
 * hands the OpenNext handler this request in-process with a token it
 * minted at startup — nothing to configure, nothing reachable from
 * outside. An admin can also run it by hand from a signed-in session.
 */
export async function POST(request: Request) {
  const token = request.headers.get("x-cron-token");
  const minted = (globalThis as { __cronToken?: string }).__cronToken;
  let allowed = !!token && !!minted && token === minted;
  if (!allowed) {
    const session = await getSession();
    allowed = !!session && (session.role === "admin" || isAdminEmail(session.email));
  }
  if (!allowed) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  try {
    const result = await syncAllBanks();
    console.log("bank-sync cron:", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (e) {
    console.error("bank-sync cron error:", e);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
