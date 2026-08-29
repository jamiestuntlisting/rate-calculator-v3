import { NextResponse } from "next/server";
import {
  deleteWorkRecord,
  findWorkRecord,
  updateWorkRecord,
} from "@/lib/repos/work-records";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";
import { ensureWeeklyForRecord, releaseRecordFromWeekly } from "@/lib/repos/weeklies";
import { recordName } from "@/lib/repos/name-suggestions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const record = await findWorkRecord(
      id,
      await getEffectiveUserId(auth.session)
    );

    if (!record) {
      return NextResponse.json(
        { error: "Work record not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(record);
  } catch (error) {
    console.error("Error fetching work record:", error);
    return NextResponse.json(
      { error: "Failed to fetch work record" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const data = await request.json();

    // Prevent userId from being overwritten
    delete data.userId;

    // Keep the suggestion lists current, and resolve blocked spellings.
    if (typeof data.showName === "string") {
      data.showName = await recordName("show", data.showName);
    }
    if (typeof data.characterName === "string") {
      data.characterName = await recordName("character", data.characterName);
    }

    const userId = await getEffectiveUserId(auth.session);
    const record = await updateWorkRecord(id, userId, data);

    if (!record) {
      return NextResponse.json(
        { error: "Work record not found" },
        { status: 404 }
      );
    }

    // Weekly-ness and membership move together: marking a day weekly
    // attaches it to (or creates) its show's weekly for that week, and
    // marking it back detaches it. Only edits that state a contract
    // length weigh in — a payment-only PUT leaves membership alone.
    if (typeof data.contractLength === "string") {
      if (
        record.contractLength === "weekly" ||
        record.contractLength === "three_day"
      ) {
        // Idempotent: attaches, re-kinds (weekly to 3-day and back), or
        // simply confirms the group the day already belongs to.
        const weekly = await ensureWeeklyForRecord(userId, id);
        if (weekly) record.weeklyId = weekly._id;
      } else if (record.weeklyId) {
        await releaseRecordFromWeekly(userId, id);
        record.weeklyId = null;
      }
    }

    return NextResponse.json(record);
  } catch (error) {
    console.error("Error updating work record:", error);
    return NextResponse.json(
      { error: "Failed to update work record" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const deleted = await deleteWorkRecord(
      id,
      await getEffectiveUserId(auth.session)
    );

    if (!deleted) {
      return NextResponse.json(
        { error: "Work record not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "Work record deleted" });
  } catch (error) {
    console.error("Error deleting work record:", error);
    return NextResponse.json(
      { error: "Failed to delete work record" },
      { status: 500 }
    );
  }
}
