import { NextResponse } from "next/server";
import {
  deleteTask,
  listTasks,
  updateTask,
  TASK_OWNERS,
  TASK_STATUSES,
  type TaskOwner,
  type TaskStatus,
} from "@/lib/repos/tasks";
import { requireAuth } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/auth";

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

/** PATCH /api/admin/tasks/:id — change whichever fields were sent. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (admin.error) return admin.error;

    const { id } = await params;
    const { title, detail, status, owner, position } =
      (await request.json()) as {
        title?: string;
        detail?: string;
        status?: TaskStatus;
        owner?: TaskOwner;
        position?: number;
      };

    if (status && !TASK_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    }
    if (owner && !TASK_OWNERS.includes(owner)) {
      return NextResponse.json({ error: "Unknown owner" }, { status: 400 });
    }
    if (title !== undefined && !title.trim()) {
      return NextResponse.json(
        { error: "title cannot be empty" },
        { status: 400 }
      );
    }

    await updateTask(id, { title, detail, status, owner, position });

    return NextResponse.json({ tasks: await listTasks() });
  } catch (error) {
    console.error("tasks PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

/** DELETE /api/admin/tasks/:id */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (admin.error) return admin.error;

    const { id } = await params;
    await deleteTask(id);

    return NextResponse.json({ tasks: await listTasks() });
  } catch (error) {
    console.error("tasks DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}
