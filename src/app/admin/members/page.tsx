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
import { PLANS, type PlanId } from "@/lib/membership-plans";
import { toast } from "sonner";

/**
 * Who is using the service and how much, by membership level: every
 * member under their plan — Max, Bookkeeper Plus, Plus, Free — with
 * their last activity, the days they have logged (and how many are
 * unfinished), the Exhibit Gs and other files they have sent in, and
 * three switches: their membership (set by hand, which wins over
 * Stripe and the StuntListing profile), whether they are an admin
 * (who sees these tools; takes effect at their next sign-in), and
 * whether they are a test user (who sees the features under test on
 * their own account).
 */

interface Member {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  tier: string;
  role: string;
  seededAdmin: boolean;
  planId: PlanId;
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

/** Top plan first, the way a membership page reads. */
const PLAN_ORDER: PlanId[] = ["plus_transcription", "plus_per_g", "plus", "free"];
const planName = (id: PlanId) => PLANS.find((p) => p.id === id)?.name ?? id;

const when = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  return days <= 0 ? `today` : days === 1 ? `yesterday` : days < 30 ? `${days}d ago` : date;
};

const name = (m: Member) => `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || m.email;

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";

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

  const patch = async (
    m: Member,
    path: string,
    body: Record<string, unknown>,
    apply: (x: Member) => Member,
    undo: (x: Member) => Member,
    done: string
  ) => {
    setMembers((prev) => prev?.map((x) => (x._id === m._id ? apply(x) : x)) ?? null);
    try {
      const res = await fetch(`/api/admin/users/${m._id}/${path}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || "");
      toast.success(done);
    } catch (e) {
      setMembers((prev) => prev?.map((x) => (x._id === m._id ? undo(x) : x)) ?? null);
      toast.error(e instanceof Error && e.message ? e.message : "Couldn't save");
    }
  };

  const setTester = (m: Member, tester: boolean) =>
    patch(m, "tester", { tester }, (x) => ({ ...x, tester }), (x) => ({ ...x, tester: !tester }),
      tester ? `${name(m)} is a test user` : `${name(m)} is no longer a test user`);
  const setRole = (m: Member, role: "admin" | "user") => {
    const before = m.role;
    return patch(m, "role", { role }, (x) => ({ ...x, role }), (x) => ({ ...x, role: before }),
      role === "admin" ? `${name(m)} is an admin from their next sign-in` : `${name(m)} is a regular member from their next sign-in`);
  };
  const setPlan = (m: Member, planId: PlanId) => {
    const before = m.planId;
    return patch(m, "membership", { planId }, (x) => ({ ...x, planId }), (x) => ({ ...x, planId: before }),
      `${name(m)} is on ${planName(planId)}`);
  };

  const active30 = members?.filter((m) => m.recentDays > 0).length ?? 0;
  const groups = PLAN_ORDER.map((planId) => ({
    planId,
    members: (members ?? []).filter((m) => m.planId === planId),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Who is using the service and how much, by membership level. The
          membership set here wins over Stripe and the StuntListing profile.
          An <strong>admin</strong> sees these tools (from their next
          sign-in); a <strong>test user</strong> sees the features under test
          on their own account — today, Claude reading their Exhibit Gs and
          the bank and calendar links.
          {members && (
            <>
              {" "}
              {members.length} members; {active30} logged a day in the last 30 days.
            </>
          )}
        </p>
      </div>

      {!members && <p className="text-sm text-muted-foreground">Loading…</p>}

      {members &&
        groups.map((g) => (
          <Card key={g.planId}>
            <CardHeader>
              <CardTitle className="text-lg">
                {planName(g.planId)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  · {g.members.length} member{g.members.length === 1 ? "" : "s"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {g.members.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody on this plan.</p>
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
                        <TableHead>Membership</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Test user</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.members.map((m) => (
                        <TableRow key={m._id}>
                          <TableCell>
                            <span className="block font-medium">{name(m)}</span>
                            <span className="block text-xs text-muted-foreground">{m.email}</span>
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
                          <TableCell>
                            <select
                              aria-label={`${name(m)}'s membership`}
                              value={m.planId}
                              onChange={(e) => setPlan(m, e.target.value as PlanId)}
                              className={selectClass}
                            >
                              {PLAN_ORDER.map((id) => (
                                <option key={id} value={id}>
                                  {planName(id)}
                                </option>
                              ))}
                            </select>
                          </TableCell>
                          <TableCell>
                            <select
                              aria-label={`${name(m)}'s role`}
                              value={m.role === "admin" ? "admin" : "user"}
                              disabled={m.seededAdmin}
                              title={m.seededAdmin ? "On the code's admin list" : undefined}
                              onChange={(e) => setRole(m, e.target.value as "admin" | "user")}
                              className={selectClass}
                            >
                              <option value="user">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                          </TableCell>
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
        ))}
    </div>
  );
}
