import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import WorkRecord from "@/models/WorkRecord";
import ResidualImport from "@/models/ResidualImport";
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

    await dbConnect();

    // Find or create the target user (james.northrup@gmail.com, STL id 33)
    const targetUser = await User.findOneAndUpdate(
      { stuntlistingUserId: "33" },
      {
        $setOnInsert: {
          email: "james.northrup@gmail.com",
          firstName: "James",
          lastName: "Northrup",
          tier: "plus",
          role: "admin",
        },
      },
      { upsert: true, new: true }
    );

    const userId = targetUser._id;

    // Assign all orphaned WorkRecords (no userId) to this user
    const workResult = await WorkRecord.updateMany(
      { userId: { $exists: false } },
      { $set: { userId } }
    );

    // Also catch records where userId is null
    const workResultNull = await WorkRecord.updateMany(
      { userId: null },
      { $set: { userId } }
    );

    // Assign all orphaned ResidualImports to this user
    const residualResult = await ResidualImport.updateMany(
      { userId: { $exists: false } },
      { $set: { userId } }
    );

    const residualResultNull = await ResidualImport.updateMany(
      { userId: null },
      { $set: { userId } }
    );

    return NextResponse.json({
      success: true,
      targetUser: {
        id: userId.toString(),
        stuntlistingUserId: "33",
        email: "james.northrup@gmail.com",
      },
      migrated: {
        workRecords: workResult.modifiedCount + workResultNull.modifiedCount,
        residualImports: residualResult.modifiedCount + residualResultNull.modifiedCount,
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
