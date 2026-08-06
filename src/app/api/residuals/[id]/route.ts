import { NextRequest, NextResponse } from "next/server";
import {
  deleteResidualImport,
  findResidualImport,
  listChecksForImport,
} from "@/lib/repos/residuals";
import { requireAuth, getEffectiveUserId } from "@/lib/api-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;

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

    const checks = await listChecksForImport(importRecord._id);

    // Group checks by production title for the summary view
    const productionMap = new Map<
      string,
      {
        title: string;
        totalGross: number;
        totalNet: number;
        checkCount: number;
        firstCheckDate: string;
        lastCheckDate: string;
        companies: Set<string>;
      }
    >();

    for (const check of checks) {
      const title = check.productionTitle;
      const existing = productionMap.get(title);

      if (existing) {
        existing.totalGross += check.prodTitleGrossAmt;
        existing.totalNet += check.netAmount;
        existing.checkCount += 1;
        if (check.company) existing.companies.add(check.company);

        // Track date range
        if (check.checkDate) {
          const checkDateParsed = new Date(check.checkDate);
          const firstParsed = new Date(existing.firstCheckDate);
          const lastParsed = new Date(existing.lastCheckDate);

          if (!isNaN(checkDateParsed.getTime())) {
            if (
              isNaN(firstParsed.getTime()) ||
              checkDateParsed < firstParsed
            ) {
              existing.firstCheckDate = check.checkDate;
            }
            if (
              isNaN(lastParsed.getTime()) ||
              checkDateParsed > lastParsed
            ) {
              existing.lastCheckDate = check.checkDate;
            }
          }
        }
      } else {
        const companies = new Set<string>();
        if (check.company) companies.add(check.company);
        productionMap.set(title, {
          title,
          totalGross: check.prodTitleGrossAmt,
          totalNet: check.netAmount,
          checkCount: 1,
          firstCheckDate: check.checkDate || "",
          lastCheckDate: check.checkDate || "",
          companies,
        });
      }
    }

    const productions = [...productionMap.values()]
      .map((p) => ({
        ...p,
        companies: [...p.companies],
      }))
      .sort((a, b) => b.totalGross - a.totalGross);

    return NextResponse.json({
      _id: importRecord._id,
      performerName: importRecord.performerName,
      filename: importRecord.filename,
      totalChecks: importRecord.totalChecks,
      totalGross: importRecord.totalGross,
      createdAt: importRecord.createdAt,
      productions,
    });
  } catch (error) {
    console.error("Error fetching residual import:", error);
    return NextResponse.json(
      { error: "Failed to fetch import" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { id } = await params;

    const deleted = await deleteResidualImport(
      id,
      await getEffectiveUserId(auth.session)
    );

    if (!deleted) {
      return NextResponse.json(
        { error: "Import not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting residual import:", error);
    return NextResponse.json(
      { error: "Failed to delete import" },
      { status: 500 }
    );
  }
}
