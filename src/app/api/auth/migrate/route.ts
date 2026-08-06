import { NextResponse } from "next/server";
import { findOrCreateUserByStuntlistingId } from "@/lib/repos/users";
import { assignOrphanWorkRecords } from "@/lib/repos/work-records";
import { assignOrphanResidualImports } from "@/lib/repos/residuals";
import { getSession } from "@/lib/auth";

/**
 * POST /api/auth/migrate
 * One-time migration: associate all orphaned records (no userId) with
 * the specified StuntListing user. Only admins can run this.
 */
export async function POST() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Find or create the target user (james.northrup@gmail.com, STL id 33)
    const targetUser = await findOrCreateUserByStuntlistingId("33", {
      email: "james.northrup@gmail.com",
      firstName: "James",
      lastName: "Northrup",
      tier: "plus",
      role: "admin",
    });

    const userId = targetUser._id;

    const workRecords = await assignOrphanWorkRecords(userId);
    const residualImports = await assignOrphanResidualImports(userId);

    return NextResponse.json({
      success: true,
      targetUser: {
        id: userId,
        stuntlistingUserId: "33",
        email: "james.northrup@gmail.com",
      },
      migrated: {
        workRecords,
        residualImports,
      },
    });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Migration failed" },
      { status: 500 }
    );
  }
}
