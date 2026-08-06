import { NextRequest, NextResponse } from "next/server";
import {
  findResidualImport,
  listChecksForProduction,
} from "@/lib/repos/residuals";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const title = searchParams.get("title");

    if (!title) {
      return NextResponse.json(
        { error: "Production title is required" },
        { status: 400 }
      );
    }

    const importRecord = await findResidualImport(
      id,
      await getEffectiveUserId(auth.session)
    );

    if (!importRecord) {
      return NextResponse.json(
        { error: "Import not found" },
        { status: 404 }
      );
    }

    // Checks for this production title, sorted by check date descending
    // (dates are raw CSV strings, so parse and sort here rather than in SQL)
    const checks = (
      await listChecksForProduction(importRecord._id, title)
    ).sort((a, b) => {
      const dateA = new Date(a.checkDate || "");
      const dateB = new Date(b.checkDate || "");
      if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
      if (isNaN(dateA.getTime())) return 1;
      if (isNaN(dateB.getTime())) return -1;
      return dateB.getTime() - dateA.getTime();
    });

    const totalGross = checks.reduce((s, c) => s + c.prodTitleGrossAmt, 0);
    const totalNet = checks.reduce((s, c) => s + c.netAmount, 0);

    return NextResponse.json({
      title,
      performerName: importRecord.performerName,
      totalGross,
      totalNet,
      checkCount: checks.length,
      checks,
    });
  } catch (error) {
    console.error("Error fetching production checks:", error);
    return NextResponse.json(
      { error: "Failed to fetch production details" },
      { status: 500 }
    );
  }
}
