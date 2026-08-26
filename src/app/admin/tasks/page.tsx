"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";
import type { Task, TaskOwner, TaskStatus } from "@/lib/repos/tasks";

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

/** Muted for settled states, brighter for the ones asking for attention. */
const STATUS_STYLES: Record<TaskStatus, string> = {
  open: "border-sky-500/40 text-sky-300",
  in_progress: "border-amber-500/40 text-amber-300",
  blocked: "border-rose-500/40 text-rose-300",
  done: "border-border/60 text-muted-foreground",
};

const OWNER_LABELS: Record<TaskOwner, string> = {
  claude: "Claude",
  james: "James",
};

const STATUSES = Object.keys(STATUS_LABELS) as TaskStatus[];
const OWNERS = Object.keys(OWNER_LABELS) as TaskOwner[];

export default function AdminTasksPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [newOwner, setNewOwner] = useState<TaskOwner>("claude");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tasks");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { tasks: Task[] };
      setTasks(data.tasks);
    } catch {
      toast.error("Couldn't load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: string, changes: Partial<Task>) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { tasks: Task[] };
      setTasks(data.tasks);
    } catch {
      toast.error("Couldn't update that task");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (task: Task) => {
    if (!confirm(`Delete "${task.title}"?`)) return;
    setBusy(task._id);
    try {
      const res = await fetch(`/api/admin/tasks/${task._id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { tasks: Task[] };
      setTasks(data.tasks);
      toast.success("Deleted");
    } catch {
      toast.error("Couldn't delete that task");
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          detail: newDetail,
          owner: newOwner,
        }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { tasks: Task[] };
      setTasks(data.tasks);
      setNewTitle("");
      setNewDetail("");
      toast.success("Added");
    } catch {
      toast.error("Couldn't add that task");
    } finally {
      setAdding(false);
    }
  };

  if (authLoading) return null;

  if (!user || !isAdminEmail(user.email)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const outstanding = tasks.filter((t) => t.status !== "done");
  const mine = outstanding.filter((t) => t.owner === "james");

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => router.push("/admin")}
          className="text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          ← Admin
        </button>
        <h1 className="text-2xl font-bold">Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          What still needs doing. Anything marked James needs a key, an install
          or an answer that only he can supply — everything else a Claude
          session can pick up on its own.
        </p>
      </div>

      {!loading && (
        <div className="flex gap-3 text-sm">
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">
              {outstanding.length}
            </span>{" "}
            outstanding
          </span>
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{mine.length}</span>{" "}
            waiting on James
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {tasks.length} task{tasks.length === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tasks.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing tracked yet.
              </p>
            )}

            {tasks.map((task) => (
              <div
                key={task._id}
                className={`p-3 rounded border border-border/50 space-y-2 ${
                  task.status === "done" ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm font-medium ${
                        task.status === "done" ? "line-through" : ""
                      }`}
                    >
                      {task.title}
                    </div>
                    {task.detail && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {task.detail}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={busy === task._id}
                    onClick={() => remove(task)}
                    aria-label={`Delete ${task.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Wraps to its own rows at 390px rather than squeezing. */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={busy === task._id}
                      aria-pressed={task.status === status}
                      onClick={() => patch(task._id, { status })}
                      className={`text-[11px] uppercase tracking-wide rounded px-2 py-1 border transition-colors disabled:opacity-50 ${
                        task.status === status
                          ? STATUS_STYLES[status]
                          : "border-border/40 text-muted-foreground hover:bg-accent/50"
                      }`}
                    >
                      {STATUS_LABELS[status]}
                    </button>
                  ))}

                  <span className="mx-1 h-4 w-px bg-border/60" aria-hidden />

                  {OWNERS.map((owner) => (
                    <button
                      key={owner}
                      type="button"
                      disabled={busy === task._id}
                      aria-pressed={task.owner === owner}
                      onClick={() => patch(task._id, { owner })}
                      className={`text-[11px] uppercase tracking-wide rounded px-2 py-1 border transition-colors disabled:opacity-50 ${
                        task.owner === owner
                          ? "border-foreground/40 text-foreground"
                          : "border-border/40 text-muted-foreground hover:bg-accent/50"
                      }`}
                    >
                      {OWNER_LABELS[owner]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add a task</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="What needs doing"
          />
          <Textarea
            value={newDetail}
            onChange={(e) => setNewDetail(e.target.value)}
            placeholder="Any detail worth keeping — why it matters, what it is blocked on"
            rows={3}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Owner</span>
            {OWNERS.map((owner) => (
              <button
                key={owner}
                type="button"
                aria-pressed={newOwner === owner}
                onClick={() => setNewOwner(owner)}
                className={`text-xs rounded px-3 py-1.5 border transition-colors ${
                  newOwner === owner
                    ? "border-foreground/40 text-foreground"
                    : "border-border/40 text-muted-foreground hover:bg-accent/50"
                }`}
              >
                {OWNER_LABELS[owner]}
              </button>
            ))}
          </div>
          <Button
            onClick={add}
            disabled={adding || !newTitle.trim()}
            className="w-full sm:w-auto"
          >
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add task
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
