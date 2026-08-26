import { NextResponse } from "next/server";
import {
  createTask,
  listTasks,
  TASK_OWNERS,
  TASK_STATUSES,
  type TaskOwner,
  type TaskStatus,
} from "@/lib/repos/tasks";
import { requireAuth } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/auth";

/** The roadmap is admin-only: it names unshipped work and open credentials. */
async function requireAdmin() {
  const auth = await requireAuth();
  if (auth.error) return { error: auth.error };
  if (auth.session.role !== "admin" && !isAdminEmail(auth.session.email)) {
    return {
      error: NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      ),
    };
  }
  return { session: auth.session };
}

/** GET /api/admin/tasks — the whole list, done items last. */
export async function GET() {
  try {
    const admin = await requireAdmin();
    if (admin.error) return admin.error;

    return NextResponse.json({ tasks: await listTasks() });
  } catch (error) {
    console.error("tasks GET error:", error);
    return NextResponse.json(
      { error: "Failed to load tasks" },
      { status: 500 }
    );
  }
}

/** POST /api/admin/tasks — add a task to the end of the list. */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    if (admin.error) return admin.error;

    const { title, detail, status, owner } = (await request.json()) as {
      title?: string;
      detail?: string;
      status?: TaskStatus;
      owner?: TaskOwner;
    };

    if (!title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (status && !TASK_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    }
    if (owner && !TASK_OWNERS.includes(owner)) {
      return NextResponse.json({ error: "Unknown owner" }, { status: 400 });
    }

    await createTask({ title, detail, status, owner });

    return NextResponse.json({ tasks: await listTasks() });
  } catch (error) {
    console.error("tasks POST error:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
