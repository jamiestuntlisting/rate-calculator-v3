"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";
import { shortDay } from "@/lib/format-date";
import {
  imdbAddStuntsUrl,
  imdbPersonSearchUrl,
  imdbPersonUrl,
  imdbTitleSearchUrl,
  imdbTitleUrl,
  normalizeImdbId,
  showCredits,
  type ShowCredit,
} from "@/lib/imdb";
import { toast } from "sonner";

/**
 * IMDb credits, by member: pick a member, and their tracker's shows
 * come back as the credits IMDb would list — one per show, with the
 * characters and actors doubled — beside the contribution link that
 * opens their IMDb form with that many stunt-credit slots. IMDb has no
 * API for writing credits (src/lib/imdb.ts says what it does have), so
 * this is the hand-off: the list to type, and the form to type it in.
 */

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  imdbId: string | null;
}

interface RecordLite {
  showName: string;
  workDate: string;
  characterName?: string | null;
  actorDoubled?: string | null;
  workType?: string | null;
}

const fullName = (u: AdminUser) =>
  `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;

export default function AdminImdbPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [records, setRecords] = useState<RecordLite[] | null>(null);
  /** Show name (lower-cased) → IMDb title id, from Admin → IMDb titles. */
  const [titleIds, setTitleIds] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/admin/imdb/titles")
      .then((r) => r.json())
      .then((d: { shows?: Array<{ name: string; imdbId: string | null }> }) => {
        const map: Record<string, string> = {};
        for (const sh of d.shows ?? []) if (sh.imdbId) map[sh.name.toLowerCase()] = sh.imdbId;
        setTitleIds(map);
      })
      .catch(() => {});
  }, []);
  const [imdbInput, setImdbInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/users");
        if (!res.ok) return;
        const data = (await res.json()) as { users: AdminUser[] };
        setUsers(
          [...data.users].sort((a, b) => fullName(a).localeCompare(fullName(b)))
        );
      } catch {
        toast.error("Couldn't load members");
      }
    })();
  }, []);

  const member = users.find((u) => u.id === selected) ?? null;

  useEffect(() => {
    if (!member) return;
    setImdbInput(member.imdbId ?? "");
    setRecords(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/users/${member.id}/work-records`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { records: RecordLite[] };
        setRecords(data.records);
      } catch {
        toast.error("Couldn't load their days");
        setRecords([]);
      }
    })();
  }, [member]);

  const credits: ShowCredit[] = useMemo(
    () => (records ? showCredits(records) : []),
    [records]
  );

  if (!user || !(user.role === "admin" || isAdminEmail(user.email))) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-muted-foreground">
        Admin access required.{" "}
        <Link href="/" className="underline underline-offset-2">
          Home
        </Link>
      </div>
    );
  }

  const saveImdbId = async () => {
    if (!member) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${member.id}/imdb`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imdbId: imdbInput }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { imdbId: string | null };
      setUsers((prev) =>
        prev.map((u) => (u.id === member.id ? { ...u, imdbId: data.imdbId } : u))
      );
      setImdbInput(data.imdbId ?? "");
      toast.success(data.imdbId ? `Saved ${data.imdbId}` : "Cleared");
    } catch {
      toast.error("Couldn't save the IMDb id");
    } finally {
      setSaving(false);
    }
  };

  const nm = member ? normalizeImdbId(member.imdbId) : null;

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-4">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">IMDb credits</h1>
        <p className="text-sm text-muted-foreground mt-1">
          IMDb has no way to write a credit from outside; changes go
          through its Contribution form, which anyone can submit and IMDb
          reviews. What it does offer is a link that opens a person&rsquo;s
          form with a number of stunt-credit slots ready. Pick a member:
          their tracker&rsquo;s shows come back as the credits to type, beside
          that link, or tap one credit to open the form with a single slot
          for just that one. Matching shows to IMDb title ids is a separate
          piece of work; for now each show has an IMDb title search.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1 min-w-0">
              <Label htmlFor="imdb-member" className="text-base">
                Member
              </Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger
                  id="imdb-member"
                  className="text-base h-12 data-[size=default]:h-12 w-full min-w-0"
                >
                  <SelectValue placeholder="Pick a member" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {fullName(u)}
                      {u.imdbId ? ` · ${u.imdbId}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-0">
              <Label htmlFor="imdb-id" className="text-base">
                IMDb person id
              </Label>
              <div className="flex gap-2">
                <Input
                  id="imdb-id"
                  value={imdbInput}
                  onChange={(e) => setImdbInput(e.target.value)}
                  placeholder="nm1234567, or paste their IMDb page"
                  disabled={!member}
                  className="h-12 text-base"
                />
                <Button onClick={saveImdbId} disabled={!member || saving} className="h-12">
                  Save
                </Button>
              </div>
              {member && !nm && (
                <p className="text-xs text-muted-foreground">
                  No id yet —{" "}
                  <a
                    href={imdbPersonSearchUrl(fullName(member))}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    find {fullName(member)} on IMDb
                  </a>{" "}
                  and paste the page.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {member && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {fullName(member)} — {credits.length} show{credits.length === 1 ? "" : "s"}
            </CardTitle>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {nm ? (
                <>
                  <a
                    href={imdbAddStuntsUrl(nm, Math.max(1, credits.length))}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline underline-offset-2"
                  >
                    Open IMDb&rsquo;s form with {Math.max(1, credits.length)} stunt-credit slot
                    {credits.length === 1 ? "" : "s"} ↗
                  </a>
                  <a
                    href={imdbPersonUrl(nm)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground underline underline-offset-2"
                  >
                    Their IMDb page ↗
                  </a>
                </>
              ) : (
                <span className="text-muted-foreground">
                  Save their IMDb id to get the contribution link.
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {records === null ? (
              <p className="text-sm text-muted-foreground">Loading their days…</p>
            ) : credits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No SAG shows on their tracker yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Show</TableHead>
                      <TableHead>Credit</TableHead>
                      <TableHead className="hidden sm:table-cell">Worked</TableHead>
                      <TableHead className="text-right">IMDb</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {credits.map((c) => (
                      <TableRow key={c.showName}>
                        <TableCell className="font-medium">{c.showName}</TableCell>
                        <TableCell>
                          <span className="block">{c.creditLine}</span>
                          {c.characters.length > 1 && (
                            <span className="block text-xs text-muted-foreground">
                              also {c.characters.slice(1).join(", ")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell whitespace-nowrap text-muted-foreground">
                          {c.firstDate === c.lastDate
                            ? shortDay(c.firstDate)
                            : `${shortDay(c.firstDate)} – ${shortDay(c.lastDate)}`}
                          {` · ${c.days} day${c.days === 1 ? "" : "s"}`}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {titleIds[c.showName.toLowerCase()] ? (
                            <a
                              href={imdbTitleUrl(titleIds[c.showName.toLowerCase()])}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-2"
                            >
                              {titleIds[c.showName.toLowerCase()]} ↗
                            </a>
                          ) : (
                            <a
                              href={imdbTitleSearchUrl(c.showName)}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-2 text-amber-300"
                            >
                              find title ↗
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
