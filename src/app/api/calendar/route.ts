import { NextResponse } from "next/server";
import { requireTester } from "@/lib/bank-access";
import { findUserById } from "@/lib/repos/users";
import {
  addCalendarLink,
  backfillWorkLog,
  calendarConfigured,
  ensureWorkLogCalendar,
  removeWorkLogCalendar,
} from "@/lib/google-calendar";

/**
 * The member's Google Calendar work log (a feature under test).
 * GET — where it stands. POST {action: "connect"} — make the calendar,
 * share it to the member (Google sends the invitation) and write every
 * day they have logged. POST {action: "sync"} — write every day again.
 * DELETE — take the member off it and forget it.
 */
export async function GET() {
  const gate = await requireTester();
  if (gate.error) return gate.error;
  const user = await findUserById(gate.userId);
  return NextResponse.json({
    configured: await calendarConfigured(),
    calendarId: user?.calendarId ?? null,
    sharedAt: user?.calendarSharedAt ?? null,
    link: user?.calendarId ? addCalendarLink(user.calendarId) : null,
    email: user?.email ?? null,
  });
}

export async function POST(request: Request) {
  const gate = await requireTester();
  if (gate.error) return gate.error;
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action === "connect") {
      const { calendarId } = await ensureWorkLogCalendar(gate.userId);
      const { mirrored } = await backfillWorkLog(gate.userId);
      return NextResponse.json({ calendarId, link: addCalendarLink(calendarId), mirrored });
    }
    if (body.action === "sync") {
      const { mirrored } = await backfillWorkLog(gate.userId);
      return NextResponse.json({ mirrored });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("calendar error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't reach Google Calendar" },
      { status: 502 }
    );
  }
}

export async function DELETE() {
  const gate = await requireTester();
  if (gate.error) return gate.error;
  try {
    await removeWorkLogCalendar(gate.userId);
    return NextResponse.json({ removed: true });
  } catch (e) {
    console.error("calendar disconnect error:", e);
    return NextResponse.json({ error: "Couldn't disconnect" }, { status: 500 });
  }
}
