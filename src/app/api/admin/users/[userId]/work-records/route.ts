import { NextRequest, NextResponse } from "next/server";
import {
  createWorkRecord,
  listWorkRecordsForAdmin,
} from "@/lib/repos/work-records";
import { findUserById } from "@/lib/repos/users";
import { getSession, isAdminEmail } from "@/lib/auth";
import { calculatePaymentDueDate } from "@/lib/time-utils";
import { calculateRate } from "@/lib/rate-engine";
import { weeklyEquivalentDayRate } from "@/lib/agreements";
import { ensureWeeklyForRecord } from "@/lib/repos/weeklies";
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

    const userDoc = await findUserById(userId);
    if (!userDoc) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since");
    const fieldParam = searchParams.get("field") || "workDate";
    const allowedFields = new Set(["workDate", "updatedAt", "createdAt"]);
    const field = (
      allowedFields.has(fieldParam) ? fieldParam : "workDate"
    ) as "workDate" | "updatedAt" | "createdAt";

    let sinceIso: string | null = null;
    if (since) {
      const sinceDate = new Date(since);
      if (Number.isNaN(sinceDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid 'since' — must be ISO-8601 datetime" },
          { status: 400 }
        );
      }
      sinceIso = sinceDate.toISOString();
    }

    const records = await listWorkRecordsForAdmin(userId, field, sinceIso);

    return NextResponse.json({
      user: {
        id: userDoc._id,
        email: userDoc.email,
        firstName: userDoc.firstName,
        lastName: userDoc.lastName,
      },
      since: since || null,
      field,
      count: records.length,
      records,
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

    const userExists = await findUserById(userId);
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
          // Without these a flat deal is priced back at scale with
          // overtime, and a weekly's day at the daily rate — both money
          // nobody is owed.
          flatDayRate: Number(data.flatDayRate) > 0 ? Number(data.flatDayRate) : null,
          dayRateOverride:
            data.contractLength === "weekly" || data.weeklyContract
              ? weeklyEquivalentDayRate(data.workStatus)
              : null,
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

    const record = await createWorkRecord(
      {
        ...data,
        recordStatus,
        calculation,
        paymentDueDate,
        missingExhibitG: !hasExhibitG && data.workType !== "other",
      },
      userId
    );

    // Same rule as the member-facing route: a weekly day belongs to a
    // weekly object from the moment it exists.
    if (record.contractLength === "weekly") {
      const weekly = await ensureWeeklyForRecord(userId, record._id);
      if (weekly) record.weeklyId = weekly._id;
    }

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("admin work-records POST error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create work record";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
