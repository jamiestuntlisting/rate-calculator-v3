"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";
import { imdbTitleUrl } from "@/lib/imdb";
import { shortDay } from "@/lib/format-date";
import { ImdbLookupDialog } from "@/components/admin/imdb-lookup-dialog";

/**
 * Shows and their IMDb title ids. Every show with work logged under it
 * is a row; tap one to look it up on IMDb and keep the id, which lives
 * on the show's name row (name_suggestions.imdbId) and links the title
 * on every member's credits.
 */
interface Show {
  name: string;
  days: number;
  members: number;
  lastDate: string;
  imdbId: string | null;
}

export default function ImdbTitlesPage() {
  const { user } = useAuth();
  const [shows, setShows] = useState<Show[] | null>(null);
  const [picking, setPicking] = useState<Show | null>(null);

  useEffect(() => {
    fetch("/api/admin/imdb/titles")
      .then((r) => r.json())
      .then((d: { shows?: Show[] }) => setShows(d.shows ?? []))
      .catch(() => setShows([]));
  }, []);

  if (!user || !(user.role === "admin" || isAdminEmail(user.email))) {
    return <div className="max-w-4xl mx-auto px-4 py-10 text-sm text-muted-foreground">Admin access required.</div>;
  }

  const save = async (show: Show, id: string | null) => {
    const res = await fetch("/api/admin/imdb/titles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: show.name, imdbId: id ?? "" }),
    });
    if (!res.ok) {
      toast.error("Couldn't save the id");
      return;
    }
    const data = (await res.json()) as { imdbId: string | null };
    setShows((prev) => prev && prev.map((s) => (s.name === show.name ? { ...s, imdbId: data.imdbId } : s)));
    toast.success(data.imdbId ? `${show.name} is ${data.imdbId}` : "Id cleared");
    setPicking(null);
  };

  const withId = (shows ?? []).filter((s) => s.imdbId).length;

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">IMDb titles</h1>
        <p className="text-sm text-muted-foreground">
          Tap a show to look it up on IMDb and keep its title id.{" "}
          <Link href="/admin/imdb/people" className="underline underline-offset-2">People</Link> ·{" "}
          <Link href="/admin/imdb" className="underline underline-offset-2">Credits</Link>
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{shows ? `${withId} of ${shows.length} shows have an id` : "Shows"}</CardTitle>
        </CardHeader>
        <CardContent>
          {shows === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : shows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shows logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Show</TableHead>
                    <TableHead className="hidden sm:table-cell">Work</TableHead>
                    <TableHead className="text-right">IMDb id</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shows.map((s) => (
                    <TableRow key={s.name} className="cursor-pointer" onClick={() => setPicking(s)}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="hidden sm:table-cell whitespace-nowrap text-muted-foreground">
                        {s.days} day{s.days === 1 ? "" : "s"} · {s.members} member{s.members === 1 ? "" : "s"} · last {shortDay(s.lastDate)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {s.imdbId ? (
                          <a
                            href={imdbTitleUrl(s.imdbId)}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {s.imdbId} ↗
                          </a>
                        ) : (
                          <span className="text-amber-300">look up</span>
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
      {picking && (
        <ImdbLookupDialog
          type="title"
          subject={picking.name}
          currentId={picking.imdbId}
          onClose={() => setPicking(null)}
          onPick={(id) => save(picking, id)}
        />
      )}
    </div>
  );
}
