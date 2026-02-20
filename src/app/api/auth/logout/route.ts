import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth";

/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */
export async function POST() {
  await deleteSession();
  return NextResponse.json({ success: true });
}
