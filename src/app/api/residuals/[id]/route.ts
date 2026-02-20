import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ResidualImport from "@/models/ResidualImport";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect();
    const { id } = await params;

    const importRecord = await ResidualImport.findById(id).lean();

    if (!importRecord) {
      return NextResponse.json(
        { error: "Import not found" },
        { status: 404 }
      );
    }

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

    for (const check of importRecord.checks) {
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
      _id: (importRecord._id as { toString(): string }).toString(),
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
    await dbConnect();
    const { id } = await params;

    const result = await ResidualImport.findByIdAndDelete(id);

    if (!result) {
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
