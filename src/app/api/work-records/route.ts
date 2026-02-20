import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import WorkRecord from "@/models/WorkRecord";
import { calculatePaymentDueDate } from "@/lib/time-utils";

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const sort = searchParams.get("sort") || "workDate";
    const order = searchParams.get("order") || "desc";
    const status = searchParams.get("status");
    const show = searchParams.get("show");
    const recordStatus = searchParams.get("recordStatus");

    const filter: Record<string, unknown> = {};
    if (status && status !== "all") {
      filter.paymentStatus = status;
    }
    if (show) {
      filter.showName = { $regex: show, $options: "i" };
    }
    if (recordStatus && recordStatus !== "all") {
      filter.recordStatus = recordStatus;
    }

    const skip = (page - 1) * limit;
    const sortObj: Record<string, 1 | -1> = {
      [sort]: order === "asc" ? 1 : -1,
    };

    const [records, total] = await Promise.all([
      WorkRecord.find(filter).sort(sortObj).skip(skip).limit(limit).lean(),
      WorkRecord.countDocuments(filter),
    ]);

    return NextResponse.json({
      records: records.map((r) => ({
        ...r,
        _id: r._id.toString(),
      })),
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
    await dbConnect();

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
      if (!data.callTime || !data.reportOnSet || !data.dismissOnSet) {
        return NextResponse.json(
          {
            error:
              "Call time, report on set, and dismiss on set are required for complete records",
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

    const record = await WorkRecord.create({
      ...data,
      recordStatus,
      paymentDueDate,
      missingExhibitG: !hasExhibitG && data.workType !== "other",
    });

    return NextResponse.json(
      { ...record.toObject(), _id: record._id.toString() },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating work record:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create work record";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
