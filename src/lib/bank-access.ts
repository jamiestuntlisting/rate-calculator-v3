import { NextResponse } from "next/server";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";
import { findUserById } from "@/lib/repos/users";
import { isTester } from "@/lib/test-users";

/** The bank routes are for test users, on their own account. */
export async function requireTester(): Promise<
  { error: NextResponse; userId?: undefined } | { error?: undefined; userId: string }
> {
  const auth = await requireAuth();
  if (auth.error) return { error: auth.error };
  const userId = await getEffectiveUserId(auth.session);
  const user = await findUserById(userId);
  if (!user || !isTester(user)) {
    return { error: NextResponse.json({ error: "Not a test account" }, { status: 403 }) };
  }
  return { userId };
}
