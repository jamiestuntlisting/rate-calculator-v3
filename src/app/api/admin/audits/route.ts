import { NextResponse } from "next/server";
import { getSession, isAdminEmail } from "@/lib/auth";
import { createAudit, listAudits } from "@/lib/repos/audits";

async function requireAdmin() {
  const session = await getSession();
  if (!session || (session.role !== "admin" && !isAdminEmail(session.email))) {
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }
  return { session };
}

/** GET /api/admin/audits — every audit, newest first, with its card counts. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    return NextResponse.json({ audits: await listAudits() });
  } catch (error) {
    console.error("audits GET error:", error);
    return NextResponse.json({ error: "Failed to list audits" }, { status: 500 });
  }
}

/** POST /api/admin/audits — { showName, performers?, notes? } opens an audit. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = (await request.json()) as { showName?: string; performers?: string; notes?: string };
    const showName = (body.showName ?? "").trim();
    if (!showName) return NextResponse.json({ error: "Name the show" }, { status: 400 });
    const audit = await createAudit({
      createdBy: auth.session.userId,
      showName,
      performers: (body.performers ?? "").trim(),
      notes: (body.notes ?? "").trim(),
    });
    return NextResponse.json({ audit }, { status: 201 });
  } catch (error) {
    console.error("audits POST error:", error);
    return NextResponse.json({ error: "Failed to open the audit" }, { status: 500 });
  }
}
