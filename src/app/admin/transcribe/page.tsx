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
import type { WorkRecord } from "@/types";

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
  const [records, setRecords] = useState<WorkRecord[]>([]);
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

  // Load a user's attachment-only records via the view-as mechanism
  const loadRecords = useCallback(async (userId: string) => {
    setLoadingRecords(true);
    setRecords([]);
    try {
      // Activate view-as so /api/work-records returns the target user's records
      const vaRes = await fetch("/api/admin/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!vaRes.ok) {
        toast.error("Failed to switch context");
        return;
      }

      const res = await fetch(
        "/api/work-records?recordStatus=attachment_only&limit=100&sort=workDate&order=desc"
      );
      if (!res.ok) {
        toast.error("Failed to load records");
        return;
      }
      const data = await res.json();
      setRecords(data.records || []);
    } catch {
      toast.error("Failed to load records");
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
    if (userId) {
      loadRecords(userId);
    } else {
      setRecords([]);
    }
  };

  const handleTranscribe = async (recordId: string) => {
    if (!selectedUserId) return;
    setNavigating(true);
    // view-as is already active from loadRecords; reload state so the banner shows,
    // then navigate to the existing work detail page where the admin can transcribe.
    // window.location.href triggers a full reload so AuthProvider re-reads view-as state.
    window.location.href = `/work/${recordId}`;
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
        <h1 className="text-2xl font-bold">Transcribe Exhibit G</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a performer, then select one of their attached-but-not-transcribed
          Exhibit G records. The next screen shows the attachment on top and the
          transcription form below — saved data writes to the performer&apos;s account.
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
        </CardContent>
      </Card>

      {selectedUserId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              2. Pick an untranscribed record
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
                No attachment-only records for this performer.
              </p>
            ) : (
              <div className="space-y-2">
                {records.map((r) => {
                  const exhibitG = r.documents?.find(
                    (d) => d.documentType === "exhibit_g"
                  );
                  return (
                    <div
                      key={r._id}
                      className="flex items-center gap-3 p-3 rounded border border-border/50 hover:bg-[#1a1a1a] transition-colors"
                    >
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {r.showName || "(no show name)"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateSafe(r.workDate)}
                          {exhibitG && (
                            <span className="ml-2">· {exhibitG.originalName}</span>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        attachment only
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
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
