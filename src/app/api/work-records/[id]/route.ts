import { NextResponse } from "next/server";
import {
  deleteWorkRecord,
  findWorkRecord,
  updateWorkRecord,
} from "@/lib/repos/work-records";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";
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

    const record = await updateWorkRecord(
      id,
      await getEffectiveUserId(auth.session),
      data
    );

    if (!record) {
      return NextResponse.json(
        { error: "Work record not found" },
        { status: 404 }
      );
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
