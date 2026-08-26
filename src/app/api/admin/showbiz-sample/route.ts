import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/auth";
import {
  readShowbizSample,
  readShowbizSampleName,
  SHOWBIZ_SAMPLE,
  writeShowbizSample,
} from "@/lib/showbiz-sample";

/**
 * GET /api/admin/showbiz-sample
 *
 * The reference export the weekly bench runs by default. Admin only, and
 * deliberately not a file under public/: it carries real performer names,
 * productions and pay, so it should be no easier to reach than the bench
 * that reads it.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    if (auth.session.role !== "admin" && !isAdminEmail(auth.session.email)) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const csv = await readShowbizSample();
    if (csv === null) {
      return NextResponse.json(
        { error: "No reference export has been loaded" },
        { status: 404 }
      );
    }

    // Name whatever is actually stored, so saving a different export does
    // not leave the bench labelled with the old one.
    const filename = (await readShowbizSampleName()) ?? SHOWBIZ_SAMPLE.filename;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `inline; filename="${filename}"`,
        "X-Export-Filename": filename,
        // Bundled with the build, so it only changes when the build does.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("showbiz sample error:", error);
    return NextResponse.json(
      { error: "Failed to load the sample export" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/showbiz-sample
 *
 * Make the export currently open on the bench the new default. The CSV
 * comes up from the browser and goes straight into D1 — it never lands in
 * the repository, which is public.
 */
export async function PUT(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    if (auth.session.role !== "admin" && !isAdminEmail(auth.session.email)) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const { csv, filename } = (await request.json()) as {
      csv?: string;
      filename?: string;
    };
    if (!csv?.trim()) {
      return NextResponse.json({ error: "No CSV provided" }, { status: 400 });
    }

    await writeShowbizSample(csv, filename?.trim() || "export.csv");
    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error("showbiz sample save error:", error);
    return NextResponse.json(
      { error: "Failed to save the reference export" },
      { status: 500 }
    );
  }
}
