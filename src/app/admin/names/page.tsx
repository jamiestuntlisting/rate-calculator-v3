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
}

export default function AdminNamesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [names, setNames] = useState<NameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<"show" | "character">("show");

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

  if (authLoading) return null;

  if (!user || !isAdminEmail(user.email)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const rows = names.filter((n) => n.kind === kind);

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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {rows.length} {kind === "show" ? "show title" : "character name"}
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

                  {!row.blocked && (
                    <Input
                      value={replacements[key] ?? ""}
                      onChange={(e) =>
                        setReplacements((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      placeholder="Use this spelling instead (optional)"
                      className="h-9 text-sm w-64"
                      list={`names-${row.kind}`}
                    />
                  )}

                  <Button
                    size="sm"
                    variant={row.blocked ? "outline" : "destructive"}
                    disabled={busy === key}
                    onClick={() => setBlocked(row, !row.blocked)}
                  >
                    {busy === key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : row.blocked ? (
                      <>
                        <Check className="h-4 w-4 mr-1" /> Unblock
                      </>
                    ) : (
                      <>
                        <Ban className="h-4 w-4 mr-1" /> Block
                      </>
                    )}
                  </Button>
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
