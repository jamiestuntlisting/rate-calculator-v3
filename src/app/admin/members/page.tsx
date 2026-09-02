"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";
import { toast } from "sonner";

/**
 * Who is using the service and how much: every member with their last
 * activity, the days they have logged (and how many are unfinished),
 * the Exhibit Gs and other files they have sent in — and the switch
 * that makes a member a test user, who sees the features under test on
 * their own account (src/lib/test-users.ts). Admins are a different
 * thing: they see these tools.
 */

interface Member {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  tier: string;
  role: string;
  tester: boolean;
  seeded: boolean;
  lastLogin: string | null;
  createdAt: string;
  lastActivity: string | null;
  workDays: number;
  incompleteDays: number;
  exhibitGs: number;
  otherFiles: number;
  transcribed: number;
  recentDays: number;
}

const when = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  return days <= 0 ? `today` : days === 1 ? `yesterday` : days < 30 ? `${days}d ago` : date;
};

const name = (m: Member) => `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || m.email;

export default function AdminMembersPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/members");
        if (!res.ok) throw new Error(String(res.status));
        setMembers(((await res.json()) as { members: Member[] }).members);
      } catch {
        toast.error("Couldn't load members");
        setMembers([]);
      }
    })();
  }, []);

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

  const setTester = async (m: Member, tester: boolean) => {
    setMembers((prev) => prev?.map((x) => (x._id === m._id ? { ...x, tester } : x)) ?? null);
    try {
      const res = await fetch(`/api/admin/users/${m._id}/tester`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tester }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(tester ? `${name(m)} is a test user` : `${name(m)} is no longer a test user`);
    } catch {
      setMembers((prev) => prev?.map((x) => (x._id === m._id ? { ...x, tester: !tester } : x)) ?? null);
      toast.error("Couldn't save");
    }
  };

  const active30 = members?.filter((m) => m.recentDays > 0).length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Who is using the service and how much. A <strong>test user</strong>{" "}
          sees the features under test on their own account — today, Claude
          reading their Exhibit Gs as they land. That is different from an
          admin, who sees these tools.
          {members && (
            <>
              {" "}
              {members.length} members; {active30} logged a day in the last 30 days.
            </>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Everyone, most recent activity first</CardTitle>
        </CardHeader>
        <CardContent>
          {!members ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Last active</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead className="text-right">Unfinished</TableHead>
                    <TableHead className="text-right">Exhibit Gs</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Transcribed</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Other files</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Last 30d</TableHead>
                    <TableHead className="hidden lg:table-cell">Tier</TableHead>
                    <TableHead>Test user</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m._id}>
                      <TableCell>
                        <span className="block font-medium">{name(m)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {m.email}
                          {m.role === "admin" ? " · admin" : ""}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{when(m.lastActivity)}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.workDays}</TableCell>
                      <TableCell className={`text-right tabular-nums ${m.incompleteDays ? "text-amber-300" : "text-muted-foreground"}`}>
                        {m.incompleteDays}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{m.exhibitGs}</TableCell>
                      <TableCell className="text-right tabular-nums hidden md:table-cell">{m.transcribed}</TableCell>
                      <TableCell className="text-right tabular-nums hidden md:table-cell">{m.otherFiles}</TableCell>
                      <TableCell className="text-right tabular-nums hidden lg:table-cell">{m.recentDays}</TableCell>
                      <TableCell className="hidden lg:table-cell">{m.tier}</TableCell>
                      <TableCell>
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={m.tester}
                            disabled={m.seeded}
                            onCheckedChange={(v) => setTester(m, !!v)}
                            aria-label={`${name(m)} is a test user`}
                          />
                          {m.seeded && (
                            <span className="text-xs text-muted-foreground" title="On the code's seed list">
                              seeded
                            </span>
                          )}
                        </label>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
