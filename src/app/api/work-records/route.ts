import { NextRequest, NextResponse } from "next/server";
import {
  createWorkRecord,
  listWorkRecords,
} from "@/lib/repos/work-records";
import { calculatePaymentDueDate } from "@/lib/time-utils";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";
import { recordName } from "@/lib/repos/name-suggestions";
import { ensureWeeklyForRecord } from "@/lib/repos/weeklies";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const sort = searchParams.get("sort") || "workDate";
    const order = searchParams.get("order") || "desc";
    const status = searchParams.get("status");
    const show = searchParams.get("show");
    const recordStatus = searchParams.get("recordStatus");

    const { records, total } = await listWorkRecords({
      userId: await getEffectiveUserId(auth.session),
      paymentStatus: status && status !== "all" ? status : null,
      showNameLike: show || null,
      recordStatus: recordStatus && recordStatus !== "all" ? recordStatus : null,
      sort,
      order: order === "asc" ? "asc" : "desc",
      page,
      limit,
    });

    return NextResponse.json({
      records,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error fetching work records:", error);
    return NextResponse.json(
      { error: "Failed to fetch work records" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const data = await request.json();

    const recordStatus = data.recordStatus || "complete";

    // Validate based on record status
    if (!data.showName || !data.workDate) {
      return NextResponse.json(
        { error: "Show name and work date are required" },
        { status: 400 }
      );
    }

    // Complete SAG-AFTRA records require full Exhibit G fields
    // (stunt coordinator and other work types don't need time fields)
    if (
      recordStatus === "complete" &&
      data.workStatus !== "stunt_coordinator" &&
      data.workType !== "other"
    ) {
      if (!data.callTime || !data.dismissOnSet) {
        return NextResponse.json(
          {
            error:
              "Call time and dismiss on set are required for complete records",
          },
          { status: 400 }
        );
      }
    }

    // Compute payment due date from work date
    let paymentDueDate = null;
    if (data.workDate) {
      try {
        const dateStr =
          typeof data.workDate === "string"
            ? data.workDate
            : new Date(data.workDate).toISOString().split("T")[0];
        paymentDueDate = calculatePaymentDueDate(dateStr);
      } catch {
        // Non-critical, continue without due date
      }
    }

    // Check if exhibit G document is attached (SAG-AFTRA records only)
    const hasExhibitG =
      data.workType === "other" ||
      (Array.isArray(data.documents) &&
        data.documents.some(
          (d: { documentType?: string }) => d.documentType === "exhibit_g"
        ));

    // Remember the spellings for autocomplete, and use the canonical one if
    // an admin has blocked what was typed.
    const showName = await recordName("show", data.showName);
    const characterName = await recordName("character", data.characterName ?? "");

    const userId = await getEffectiveUserId(auth.session);
    const record = await createWorkRecord(
      {
        ...data,
        showName,
        characterName,
        recordStatus,
        paymentDueDate,
        missingExhibitG: !hasExhibitG && data.workType !== "other",
      },
      userId
    );

    // A day logged as weekly (or 3-day) belongs to a contract group from
    // the moment it exists — that is what makes it show up as saved.
    if (record.contractLength === "weekly" || record.contractLength === "three_day") {
      const weekly = await ensureWeeklyForRecord(userId, record._id);
      if (weekly) record.weeklyId = weekly._id;
    }

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("Error creating work record:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create work record";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
