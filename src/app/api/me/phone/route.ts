import { NextResponse } from "next/server";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";
import { findUserById, setUserPhone } from "@/lib/repos/users";
import { phoneDigits, isPlausiblePhone } from "@/lib/phone";
import { getDb } from "@/lib/db";

/**
 * The member's mobile number, for texting Exhibit Gs in. GET also says
 * which number to text (SMS_INTAKE_NUMBER in app_config), so the
 * Preferences page reads everything from one place.
 */

async function intakeNumber(): Promise<string | null> {
  try {
    const db = await getDb();
    const row = await db
      .prepare("SELECT value FROM app_config WHERE key = 'SMS_INTAKE_NUMBER'")
      .first<{ value: string }>();
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  try {
    const userId = await getEffectiveUserId(auth.session);
    const user = await findUserById(userId);
    return NextResponse.json({
      phone: user?.phone ?? null,
      intakeNumber: await intakeNumber(),
    });
  } catch (error) {
    console.error("phone GET error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  try {
    const body = (await request.json()) as { phone?: string };
    const raw = String(body.phone ?? "").trim();
    const digits = phoneDigits(raw);
    if (raw && !isPlausiblePhone(raw)) {
      return NextResponse.json(
        { error: "That doesn't look like a full phone number." },
        { status: 400 }
      );
    }
    const userId = await getEffectiveUserId(auth.session);
    const user = await setUserPhone(userId, raw ? digits : null);
    return NextResponse.json({ phone: user?.phone ?? null });
  } catch (error) {
    console.error("phone PUT error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
