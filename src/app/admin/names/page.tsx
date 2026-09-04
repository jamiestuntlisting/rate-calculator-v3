"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ban, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";

interface NameRow {
  kind: "show" | "character";
  name: string;
  blocked: number;
  replacement: string | null;
  status: "pending" | "approved" | "ignored";
}

type Bucket = "pending" | "approved" | "ignored" | "blocked";

export default function AdminNamesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [names, setNames] = useState<NameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<"show" | "character">("show");
  const [bucket, setBucket] = useState<Bucket>("pending");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/suggestions?all=1");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { names: NameRow[] };
      setNames(data.names);
    } catch {
      toast.error("Couldn't load names");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setBlocked = async (row: NameRow, blocked: boolean) => {
    const key = `${row.kind}:${row.name}`;
    setBusy(key);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: row.kind,
          name: row.name,
          blocked,
          replacement: blocked ? replacements[key] || null : null,
        }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { names: NameRow[] };
      setNames(data.names);
      toast.success(blocked ? "Blocked" : "Unblocked");
    } catch {
      toast.error("Couldn't update that name");
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (row: NameRow, status: NameRow["status"]) => {
    const key = `${row.kind}:${row.name}`;
    setBusy(key);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: row.kind, name: row.name, status }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { names: NameRow[] };
      setNames(data.names);
      toast.success(
        status === "approved"
          ? "Approved"
          : status === "ignored"
            ? "Ignored"
            : "Back to pending"
      );
    } catch {
      toast.error("Couldn't update that name");
    } finally {
      setBusy(null);
    }
  };

  if (authLoading) return null;

  if (!user || !(user.role === "admin" || isAdminEmail(user.email))) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const ofKind = names.filter((n) => n.kind === kind);
  const bucketOf = (n: NameRow): Bucket => (n.blocked ? "blocked" : n.status);
  const counts = ofKind.reduce<Record<Bucket, number>>(
    (acc, n) => {
      acc[bucketOf(n)] += 1;
      return acc;
    },
    { pending: 0, approved: 0, ignored: 0, blocked: 0 }
  );
  const buckets: Bucket[] =
    kind === "character"
      ? ["pending", "approved", "ignored", "blocked"]
      : ["pending", "approved", "blocked"];
  const rows = ofKind.filter((n) => bucketOf(n) === bucket);

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => router.push("/admin")}
          className="text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          ← Admin
        </button>
        <h1 className="text-2xl font-bold">Names</h1>
        <p className="text-sm text-muted-foreground mt-1">
          These are offered as performers type. Block a misspelling or a
          duplicate so it stops being suggested — give the spelling to use
          instead and anyone who types the blocked one gets corrected.
        </p>
      </div>

      <div className="flex rounded-md border border-border overflow-hidden w-fit">
        {(["show", "character"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`px-4 py-2 text-sm capitalize ${
              kind === k ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            {k === "show" ? "Show titles" : "Character names"}
          </button>
        ))}
      </div>

      <div className="flex rounded-md border border-border overflow-hidden w-fit">
        {buckets.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBucket(b)}
            aria-pressed={bucket === b}
            className={`px-3 py-1.5 text-xs capitalize ${
              bucket === b
                ? "bg-accent font-medium"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            {b} ({counts[b]})
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {rows.length} {bucket} {kind === "show" ? "show title" : "character name"}
            {rows.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet — names appear here as performers enter them.
            </p>
          ) : (
            rows.map((row) => {
              const key = `${row.kind}:${row.name}`;
              return (
                <div
                  key={key}
                  className="flex flex-wrap items-center gap-3 p-3 rounded border border-border/50"
                >
                  <div className="flex-1 min-w-[12rem]">
                    <div
                      className={`text-sm font-medium ${
                        row.blocked ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {row.name}
                    </div>
                    {row.blocked && row.replacement && (
                      <div className="text-xs text-muted-foreground">
                        corrected to “{row.replacement}”
                      </div>
                    )}
                  </div>

                  {bucket === "pending" && (
                    <>
                      <Button
                        size="sm"
                        disabled={busy === key}
                        onClick={() => setStatus(row, "approved")}
                      >
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Input
                        value={replacements[key] ?? ""}
                        onChange={(e) =>
                          setReplacements((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        placeholder="Update with this spelling"
                        className="h-9 text-sm w-56"
                        list={`names-${row.kind}`}
                      />
                      {row.kind === "character" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === key}
                          onClick={() => setStatus(row, "ignored")}
                        >
                          Ignore
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy === key}
                        onClick={() => setBlocked(row, true)}
                      >
                        {busy === key ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Ban className="h-4 w-4 mr-1" /> Block
                          </>
                        )}
                      </Button>
                    </>
                  )}
                  {bucket === "approved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === key}
                      onClick={() => setStatus(row, "pending")}
                    >
                      Back to pending
                    </Button>
                  )}
                  {bucket === "ignored" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === key}
                      onClick={() => setStatus(row, "pending")}
                    >
                      Restore
                    </Button>
                  )}
                  {bucket === "blocked" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === key}
                      onClick={() => setBlocked(row, false)}
                    >
                      <Check className="h-4 w-4 mr-1" /> Unblock
                    </Button>
                  )}
                </div>
              );
            })
          )}

          {/* Suggest existing spellings when choosing a replacement. */}
          <datalist id={`names-${kind}`}>
            {rows
              .filter((r) => !r.blocked)
              .map((r) => (
                <option key={r.name} value={r.name} />
              ))}
          </datalist>
        </CardContent>
      </Card>
    </div>
  );
}
