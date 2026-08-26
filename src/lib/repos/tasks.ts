import { getDb, newId, nowIso } from "@/lib/db";

/** Where a task has got to. `blocked` means it is waiting on someone. */
export type TaskStatus = "open" | "in_progress" | "blocked" | "done";

/**
 * Who has to move it. `claude` is work a session can finish on its own;
 * `james` needs a key, an install or an answer only he has, so it stays
 * visibly separate from the work that is actually available.
 */
export type TaskOwner = "claude" | "james";

export const TASK_STATUSES: TaskStatus[] = [
  "open",
  "in_progress",
  "blocked",
  "done",
];

export const TASK_OWNERS: TaskOwner[] = ["claude", "james"];

export interface Task {
  _id: string;
  title: string;
  detail: string;
  status: TaskStatus;
  owner: TaskOwner;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** Done drops to the bottom; everything else keeps its deliberate order. */
export async function listTasks(): Promise<Task[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT * FROM tasks
        ORDER BY CASE status WHEN 'done' THEN 1 ELSE 0 END, position, createdAt`
    )
    .all<Task>();
  return results;
}

export async function createTask(input: {
  title: string;
  detail?: string;
  status?: TaskStatus;
  owner?: TaskOwner;
}): Promise<Task> {
  const db = await getDb();
  const now = nowIso();
  const id = newId();

  // Land new tasks at the end of the list rather than the top, so adding one
  // never reshuffles the order James is reading.
  const last = await db
    .prepare("SELECT MAX(position) AS maxPosition FROM tasks")
    .first<{ maxPosition: number | null }>();
  const position = (last?.maxPosition ?? 0) + 10;

  await db
    .prepare(
      `INSERT INTO tasks (_id, title, detail, status, owner, position, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`
    )
    .bind(
      id,
      input.title.trim(),
      input.detail?.trim() ?? "",
      input.status ?? "open",
      input.owner ?? "claude",
      position,
      now
    )
    .run();

  return {
    _id: id,
    title: input.title.trim(),
    detail: input.detail?.trim() ?? "",
    status: input.status ?? "open",
    owner: input.owner ?? "claude",
    position,
    createdAt: now,
    updatedAt: now,
  };
}

/** Patch whichever fields were supplied, leaving the rest alone. */
export async function updateTask(
  id: string,
  changes: Partial<Pick<Task, "title" | "detail" | "status" | "owner" | "position">>
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];

  const assign = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = ?${values.length}`);
  };

  if (changes.title !== undefined) assign("title", changes.title.trim());
  if (changes.detail !== undefined) assign("detail", changes.detail.trim());
  if (changes.status !== undefined) assign("status", changes.status);
  if (changes.owner !== undefined) assign("owner", changes.owner);
  if (changes.position !== undefined) assign("position", changes.position);
  if (!sets.length) return;

  assign("updatedAt", nowIso());
  values.push(id);

  const db = await getDb();
  await db
    .prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE _id = ?${values.length}`)
    .bind(...values)
    .run();
}

export async function deleteTask(id: string): Promise<void> {
  const db = await getDb();
  await db.prepare("DELETE FROM tasks WHERE _id = ?1").bind(id).run();
}
