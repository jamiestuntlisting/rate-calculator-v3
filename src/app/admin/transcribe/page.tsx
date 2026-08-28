"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowRight, FileText, Loader2 } from "lucide-react";
/** An Exhibit G from the performer's Upload a G library. */
interface GUploadItem {
  _id: string;
  displayTitle: string;
  path: string;
  contentType: string;
  createdAt: string;
  transcription: unknown | null;
  transcriptionRequested?: number;
}

interface UserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tier: string;
  role: string;
}

function formatDateSafe(dateStr: string): string {
  const ymd = dateStr.split("T")[0];
  const [year, month, day] = ymd.split("-").map(Number);
  return `${month}/${day}/${year}`;
}

export default function AdminTranscribePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [records, setRecords] = useState<GUploadItem[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [navigating, setNavigating] = useState(false);

  // Fetch user list on mount
  useEffect(() => {
    if (!user || !isAdminEmail(user.email)) return;
    setLoadingUsers(true);
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => {
        if (data.users) {
          const sorted = [...(data.users as UserListItem[])].sort((a, b) => {
            const an = `${a.firstName || ""} ${a.lastName || ""}`.trim() || a.email;
            const bn = `${b.firstName || ""} ${b.lastName || ""}`.trim() || b.email;
            return an.localeCompare(bn);
          });
          setUsers(sorted);
        }
      })
      .catch(() => toast.error("Failed to load performers"))
      .finally(() => setLoadingUsers(false));
  }, [user]);

  // Load the performer's uploaded Exhibit Gs that have no transcription yet.
  // view-as makes /api/g-uploads resolve to their account.
  const loadRecords = useCallback(async (userId: string) => {
    setLoadingRecords(true);
    setRecords([]);
    try {
      const vaRes = await fetch("/api/admin/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!vaRes.ok) {
        toast.error("Failed to switch context");
        return;
      }

      const res = await fetch("/api/g-uploads");
      if (!res.ok) {
        toast.error("Failed to load uploads");
        return;
      }
      const data = (await res.json()) as { uploads: GUploadItem[] };
      // Asked-for ones first — that is the queue the member is waiting on.
      setRecords(
        (data.uploads || [])
          .filter((u: GUploadItem) => !u.transcription)
          .sort(
            (a: GUploadItem, b: GUploadItem) =>
              (b.transcriptionRequested ?? 0) - (a.transcriptionRequested ?? 0)
          )
      );
    } catch {
      toast.error("Failed to load uploads");
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  interface QueueItem {
    _id: string;
    userId: string;
    performer: string;
    displayTitle: string;
    requested: boolean;
  }
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [loadingQueue, setLoadingQueue] = useState(false);

  /**
   * The queue across every member: open it and transcribe one thing after
   * another. Each open switches view-as to that member first, exactly as
   * picking them by hand would, so the editor writes to the right account.
   */
  const loadQueue = async () => {
    setLoadingQueue(true);
    try {
      const res = await fetch("/api/admin/transcribe-queue");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setQueue(data.queue ?? []);
    } catch {
      toast.error("Failed to load the queue");
    } finally {
      setLoadingQueue(false);
    }
  };

  const openQueueItem = async (item: QueueItem) => {
    setNavigating(true);
    const vaRes = await fetch("/api/admin/view-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: item.userId }),
    });
    if (!vaRes.ok) {
      toast.error("Failed to switch context");
      setNavigating(false);
      return;
    }
    window.location.href = `/upload-g/${item._id}`;
  };

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
    if (userId) {
      loadRecords(userId);
    } else {
      setRecords([]);
    }
  };

  const handleTranscribe = async (uploadId: string) => {
    if (!selectedUserId) return;
    setNavigating(true);
    // view-as is already active, so the transcription view opens against the
    // performer's account. A full load lets AuthProvider re-read that state.
    window.location.href = `/upload-g/${uploadId}`;
  };

  if (authLoading) return null;

  if (!user || !isAdminEmail(user.email)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const displayName = (u: UserListItem) =>
    (u.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : "") || u.email;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => router.push("/admin")}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Admin
          </button>
        </div>
        <h1 className="text-2xl font-bold">Transcribe</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a performer, then choose one of the Exhibit Gs they have
          uploaded but not transcribed. The next screen opens their G with the
          transcription fields — what you save writes to their account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Select performer</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingUsers ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading performers...
            </div>
          ) : (
            <Select value={selectedUserId} onValueChange={handleSelectUser}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Choose a performer..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {displayName(u)}
                    <span className="text-muted-foreground ml-2 text-xs">
                      {u.email}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
            <button
              type="button"
              onClick={() => (queue === null ? loadQueue() : setQueue(null))}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              {loadingQueue
                ? "Loading the queue…"
                : queue === null
                  ? "Transcribe queue"
                  : "Hide the queue"}
            </button>
            {queue !== null && (
              <div className="space-y-1">
                {queue.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing waiting — every upload is transcribed.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {queue.length} waiting, requested ones first. Open the
                      top item, transcribe it, come back and the next is on
                      top.
                    </p>
                    {queue.map((item, index) => (
                      <button
                        key={item._id}
                        type="button"
                        disabled={navigating}
                        onClick={() => openQueueItem(item)}
                        className="w-full text-left flex items-center gap-3 p-2 rounded border border-border/50 hover:bg-accent/40 disabled:opacity-50"
                      >
                        <span className="text-xs text-muted-foreground tabular-nums w-6 shrink-0">
                          {index + 1}.
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm truncate">
                            {item.displayTitle}
                          </span>
                          <span className="block text-xs text-muted-foreground truncate">
                            {item.performer}
                          </span>
                        </span>
                        {item.requested && (
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border border-primary/50 text-primary">
                            Requested
                          </span>
                        )}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedUserId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              2. Pick an untranscribed Exhibit G
              {selectedUser && (
                <span className="text-muted-foreground font-normal text-sm ml-2">
                  for {displayName(selectedUser)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingRecords ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading records...
              </div>
            ) : records.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing left to transcribe — this performer has no untranscribed
                Exhibit G uploads.
              </p>
            ) : (
              <div className="space-y-2">
                {records.map((r) => (
                  <div
                    key={r._id}
                    className="flex items-center gap-3 p-3 rounded border border-border/50 hover:bg-[#1a1a1a] transition-colors"
                  >
                    {r.contentType?.startsWith("image/") ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={r.path}
                        alt=""
                        className="h-12 w-12 rounded object-cover shrink-0 bg-muted"
                      />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {r.displayTitle}
                        {Boolean(r.transcriptionRequested) && (
                          <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border border-primary/50 text-primary">
                            Requested
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Uploaded {formatDateSafe(r.createdAt)}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      not transcribed
                    </Badge>
                    <Button
                      size="sm"
                      onClick={() => handleTranscribe(r._id)}
                      disabled={navigating}
                    >
                      Transcribe
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
