import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import WorkRecord from "@/models/WorkRecord";
import User from "@/models/User";
import { getSession, isAdminEmail } from "@/lib/auth";
import { calculatePaymentDueDate } from "@/lib/time-utils";
import { calculateRate } from "@/lib/rate-engine";
import type { ExhibitGInput } from "@/types";

async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  if (session.role !== "admin" && !isAdminEmail(session.email)) {
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }
  return { session };
}

function resolveUserObjectId(userId: string): mongoose.Types.ObjectId | null {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;
  return new mongoose.Types.ObjectId(userId);
}

/**
 * GET /api/admin/users/[userId]/work-records?since=<ISO>&field=workDate|updatedAt|createdAt
 *
 * List all work records for the given user, optionally filtered to records
 * where the chosen date field is >= `since`. `field` defaults to `workDate`.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { userId } = await context.params;
    const userObjectId = resolveUserObjectId(userId);
    if (!userObjectId) {
      return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
    }

    await dbConnect();

    const userDoc = await User.findById(userObjectId)
      .select("email firstName lastName")
      .lean();
    if (!userDoc) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since");
    const fieldParam = searchParams.get("field") || "workDate";
    const allowedFields = new Set(["workDate", "updatedAt", "createdAt"]);
    const field = allowedFields.has(fieldParam) ? fieldParam : "workDate";

    const filter: Record<string, unknown> = { userId: userObjectId };

    if (since) {
      const sinceDate = new Date(since);
      if (Number.isNaN(sinceDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid 'since' — must be ISO-8601 datetime" },
          { status: 400 }
        );
      }
      filter[field] = { $gte: sinceDate };
    }

    const records = await WorkRecord.find(filter)
      .sort({ [field]: -1 })
      .lean();

    return NextResponse.json({
      user: {
        id: userObjectId.toString(),
        email: userDoc.email,
        firstName: userDoc.firstName,
        lastName: userDoc.lastName,
      },
      since: since || null,
      field,
      count: records.length,
      records: records.map((r) => ({ ...r, _id: r._id.toString() })),
    });
  } catch (error) {
    console.error("admin work-records GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch work records" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/users/[userId]/work-records
 *
 * Create a new work record under the given user's account. Body mirrors the
 * shape of the existing work-record create endpoint. If the body has enough
 * time/status fields, the rate breakdown is computed and stored.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { userId } = await context.params;
    const userObjectId = resolveUserObjectId(userId);
    if (!userObjectId) {
      return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
    }

    await dbConnect();

    const userExists = await User.exists({ _id: userObjectId });
    if (!userExists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const data = await request.json();

    if (!data.showName || !data.workDate) {
      return NextResponse.json(
        { error: "showName and workDate are required" },
        { status: 400 }
      );
    }

    const recordStatus = data.recordStatus || "complete";

    // For complete SAG-AFTRA records, require call + dismiss times
    if (
      recordStatus === "complete" &&
      data.workStatus !== "stunt_coordinator" &&
      data.workType !== "other"
    ) {
      if (!data.callTime || !data.dismissOnSet) {
        return NextResponse.json(
          { error: "callTime and dismissOnSet are required for complete records" },
          { status: 400 }
        );
      }
    }

    // Derive payment due date
    let paymentDueDate: Date | null = null;
    try {
      const ymd =
        typeof data.workDate === "string"
          ? data.workDate.split("T")[0]
          : new Date(data.workDate).toISOString().split("T")[0];
      paymentDueDate = calculatePaymentDueDate(ymd);
    } catch {
      // non-critical
    }

    // Optionally compute the rate breakdown when we have enough data
    let calculation = data.calculation ?? null;
    if (
      !calculation &&
      recordStatus === "complete" &&
      data.workStatus &&
      data.callTime &&
      data.dismissOnSet
    ) {
      try {
        const input: ExhibitGInput = {
          showName: data.showName,
          workDate: data.workDate,
          callTime: data.callTime,
          dismissOnSet: data.dismissOnSet,
          dismissMakeupWardrobe: data.dismissMakeupWardrobe ?? null,
          ndMealIn: data.ndMealIn ?? null,
          ndMealOut: data.ndMealOut ?? null,
          firstMealStart: data.firstMealStart ?? null,
          firstMealFinish: data.firstMealFinish ?? null,
          secondMealStart: data.secondMealStart ?? null,
          secondMealFinish: data.secondMealFinish ?? null,
          stuntAdjustment: Number(data.stuntAdjustment) || 0,
          forcedCall: !!data.forcedCall,
          isSixthDay: !!data.isSixthDay,
          isSeventhDay: !!data.isSeventhDay,
          isHoliday: !!data.isHoliday,
          workStatus: data.workStatus,
          characterName: data.characterName ?? "",
          notes: data.notes ?? "",
        };
        calculation = calculateRate(input);
      } catch {
        // leave calculation null if inputs are invalid
      }
    }

    const hasExhibitG =
      data.workType === "other" ||
      (Array.isArray(data.documents) &&
        data.documents.some(
          (d: { documentType?: string }) => d.documentType === "exhibit_g"
        ));

    const record = await WorkRecord.create({
      ...data,
      userId: userObjectId,
      recordStatus,
      calculation,
      paymentDueDate,
      missingExhibitG: !hasExhibitG && data.workType !== "other",
    });

    return NextResponse.json(
      { ...record.toObject(), _id: record._id.toString() },
      { status: 201 }
    );
  } catch (error) {
    console.error("admin work-records POST error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create work record";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
