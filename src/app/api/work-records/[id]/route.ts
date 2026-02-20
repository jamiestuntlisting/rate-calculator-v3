import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import WorkRecord from "@/models/WorkRecord";
import { requireAuth, userFilter } from "@/lib/api-auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    await dbConnect();
    const { id } = await params;
    const record = await WorkRecord.findOne({
      _id: id,
      ...(await userFilter(auth.session)),
    }).lean();

    if (!record) {
      return NextResponse.json(
        { error: "Work record not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...record,
      _id: record._id.toString(),
    });
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

    await dbConnect();
    const { id } = await params;
    const data = await request.json();

    // Prevent userId from being overwritten
    delete data.userId;

    const record = await WorkRecord.findOneAndUpdate(
      { _id: id, ...(await userFilter(auth.session)) },
      data,
      { new: true, runValidators: true }
    ).lean();

    if (!record) {
      return NextResponse.json(
        { error: "Work record not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...record,
      _id: record._id.toString(),
    });
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

    await dbConnect();
    const { id } = await params;
    const record = await WorkRecord.findOneAndDelete({
      _id: id,
      ...(await userFilter(auth.session)),
    });

    if (!record) {
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
