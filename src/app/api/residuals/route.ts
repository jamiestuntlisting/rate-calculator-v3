import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ResidualImport from "@/models/ResidualImport";
import { requireAuth, userFilter, getCreateUserId } from "@/lib/api-auth";

/** Parse a dollar string like "$1,234.56" to a number */
function parseDollar(val: string): number {
  if (!val) return 0;
  const cleaned = val.replace(/[$,]/g, "").trim();
  return parseFloat(cleaned) || 0;
}

/** Parse CSV text, handling quoted fields with commas */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;
    const row: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // skip escaped quote
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          row.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
    }
    row.push(current.trim());
    rows.push(row);
  }

  return rows;
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    await dbConnect();

    const imports = await ResidualImport.find({
      ...(await userFilter(auth.session)),
    })
      .select("performerName filename totalChecks totalGross createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ imports });
  } catch (error) {
    console.error("Error fetching residual imports:", error);
    return NextResponse.json(
      { error: "Failed to fetch residual imports" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    await dbConnect();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length < 2) {
      return NextResponse.json(
        { error: "CSV file appears to be empty" },
        { status: 400 }
      );
    }

    // Header row
    const header = rows[0];

    // Find column indices by header name (flexible matching)
    const colIndex = (name: string) =>
      header.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));

    const iSagId = colIndex("SAG-AFTRA ID");
    const iPayeeName = colIndex("Payee Name");
    const iPayeeType = colIndex("Payee Type");
    const iCompany = colIndex("Company");
    const iPayrollHouse = colIndex("Payroll House");
    const iProdTitle = colIndex("Production/Episode Title");
    const iCheckStatus = colIndex("Check Status");
    const iCheckStatusDate = colIndex("Check Status Date");
    const iCheckNum = colIndex("Check #");
    const iCheckDate = colIndex("Check Date");
    const iGrossAmount = colIndex("Gross Amount");
    const iNetAmount = colIndex("Net Amount");
    const iReceivedDate = colIndex("Received Date");
    const iDonated = colIndex("Donated");
    const iProdGross = colIndex("Prod Title Gross");

    if (iProdTitle < 0) {
      return NextResponse.json(
        { error: "CSV missing required column: Production/Episode Title" },
        { status: 400 }
      );
    }

    // Extract performer name from the first data row
    const firstRow = rows[1];
    const performerName =
      (iPayeeName >= 0 ? firstRow[iPayeeName] : "") || "Unknown Performer";

    // Parse all data rows into check records
    const checks = [];
    let totalGross = 0;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 5) continue; // skip malformed rows

      const gross = parseDollar(r[iGrossAmount] || "");
      const prodGross = parseDollar(r[iProdGross] || "");
      totalGross += prodGross;

      checks.push({
        sagAftraId: iSagId >= 0 ? r[iSagId] || "" : "",
        payeeName: iPayeeName >= 0 ? r[iPayeeName] || "" : "",
        payeeType: iPayeeType >= 0 ? r[iPayeeType] || "" : "",
        company: iCompany >= 0 ? r[iCompany] || "" : "",
        payrollHouse: iPayrollHouse >= 0 ? r[iPayrollHouse] || "" : "",
        productionTitle: r[iProdTitle] || "Unknown",
        checkStatus: iCheckStatus >= 0 ? r[iCheckStatus] || "" : "",
        checkStatusDate: iCheckStatusDate >= 0 ? r[iCheckStatusDate] || "" : "",
        checkNumber: iCheckNum >= 0 ? r[iCheckNum] || "" : "",
        checkDate: iCheckDate >= 0 ? r[iCheckDate] || "" : "",
        grossAmount: gross,
        netAmount: parseDollar(r[iNetAmount] || ""),
        receivedDate: iReceivedDate >= 0 ? r[iReceivedDate] || "" : "",
        donated: iDonated >= 0 ? r[iDonated] || "" : "",
        prodTitleGrossAmt: parseDollar(r[iProdGross] || ""),
      });
    }

    // Create the import record with userId
    const importRecord = await ResidualImport.create({
      userId: await getCreateUserId(auth.session),
      performerName,
      filename: file.name,
      totalChecks: checks.length,
      totalGross,
      checks,
    });

    return NextResponse.json(
      {
        _id: importRecord._id.toString(),
        performerName,
        totalChecks: checks.length,
        totalGross,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error importing residuals CSV:", error);
    const message =
      error instanceof Error ? error.message : "Failed to import CSV";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
