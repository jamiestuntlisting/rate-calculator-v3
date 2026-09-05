"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";
import { imdbPersonUrl, normalizeImdbId } from "@/lib/imdb";
import { ImdbLookupDialog } from "@/components/admin/imdb-lookup-dialog";

/**
 * Members and their IMDb person ids. Tap a row to look the member up on
 * IMDb and keep the id; the credits page needs it for the contribution
 * link. The id lives in users.prefs.imdbId.
 */
interface Member {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  imdbId: string | null;
}

export default function ImdbPeoplePage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [picking, setPicking] = useState<Member | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d: { users?: Member[] }) =>
        setMembers(
          (d.users ?? []).sort((a, b) =>
            `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
          )
        )
      )
      .catch(() => setMembers([]));
  }, []);

  if (!user || !(user.role === "admin" || isAdminEmail(user.email))) {
    return <div className="max-w-4xl mx-auto px-4 py-10 text-sm text-muted-foreground">Admin access required.</div>;
  }

  const save = async (member: Member, id: string | null) => {
    const res = await fetch(`/api/admin/users/${member.id}/imdb`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imdbId: id ?? "" }),
    });
    if (!res.ok) {
      toast.error("Couldn't save the id");
      return;
    }
    const data = (await res.json()) as { imdbId: string | null };
    setMembers((prev) => prev && prev.map((m) => (m.id === member.id ? { ...m, imdbId: data.imdbId } : m)));
    toast.success(data.imdbId ? `${member.firstName} ${member.lastName} is ${data.imdbId}` : "Id cleared");
    setPicking(null);
  };

  const name = (m: Member) => `${m.firstName} ${m.lastName}`.trim() || m.email;
  const withId = (members ?? []).filter((m) => normalizeImdbId(m.imdbId)).length;

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">IMDb people</h1>
        <p className="text-sm text-muted-foreground">
          Tap a member to look them up on IMDb and keep their id.{" "}
          <Link href="/admin/imdb/titles" className="underline underline-offset-2">Titles</Link> ·{" "}
          <Link href="/admin/imdb" className="underline underline-offset-2">Credits</Link>
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {members ? `${withId} of ${members.length} members have an id` : "Members"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {members === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead className="hidden sm:table-cell">Email</TableHead>
                    <TableHead className="text-right">IMDb id</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => {
                    const nm = normalizeImdbId(m.imdbId);
                    return (
                      <TableRow key={m.id} className="cursor-pointer" onClick={() => setPicking(m)}>
                        <TableCell className="font-medium">{name(m)}</TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">{m.email}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {nm ? (
                            <a
                              href={imdbPersonUrl(nm)}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {nm} ↗
                            </a>
                          ) : (
                            <span className="text-amber-300">look up</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      {picking && (
        <ImdbLookupDialog
          type="name"
          subject={name(picking)}
          currentId={normalizeImdbId(picking.imdbId)}
          onClose={() => setPicking(null)}
          onPick={(id) => save(picking, id)}
        />
      )}
    </div>
  );
}
