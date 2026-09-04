"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/auth-context";
import { formatCurrency } from "@/lib/time-utils";
import { shortDay } from "@/lib/format-date";
import { DEFAULT_FLOOR } from "@/lib/bank-match";
import { toast } from "sonner";

/**
 * Bank deposits (a feature under test): connect a bank account through
 * Plaid, view only, and see every deposit lined up against the pay the
 * calculator expected — which day or week it was for, and how many days
 * from the due date it landed. Deposits that match nothing but come
 * from a payroll house are called residuals. Nothing here can move
 * money; Plaid's access is read-only and the connection can be removed.
 */

interface Deposit {
  _id: string;
  transactionId: string;
  amount: number;
  date: string;
  name: string | null;
  pending: number;
  matchKind: string;
  matchId: string | null;
  matchLabel: string | null;
  expectedAmount: number | null;
  expectedDate: string | null;
  daysOff: number | null;
}

interface Payload {
  configured: boolean;
  floor: number;
  env: string | null;
  envWarning: string | null;
  connection: { id: string; institution: string | null; lastSyncedAt: string | null } | null;
  deposits: Deposit[];
}

declare global {
  interface Window {
    Plaid?: {
      create: (opts: {
        token: string;
        onSuccess: (publicToken: string, metadata: { institution?: { name?: string } | null }) => void;
        onExit: (err: unknown) => void;
      }) => { open: () => void };
    };
  }
}

const daysWord = (n: number | null) => {
  if (n == null) return "";
  if (n === 0) return "on the due date";
  return n > 0 ? `${n} day${n === 1 ? "" : "s"} after due` : `${-n} day${n === -1 ? "" : "s"} early`;
};

export default function BankPage() {
  const { user, viewingAs } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  /** Why the deposits did not load, when they did not — never a silent "Loading…". */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [linkReady, setLinkReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/bank/deposits");
      if (res.ok) {
        setData((await res.json()) as Payload);
        setLoadError(null);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setData(null);
      setLoadError(
        res.status === 403
          ? "Bank deposits is for test accounts, on their own account. If you are viewing another member's account, switch back to yours."
          : `Couldn't load deposits (${res.status}${body.error ? `: ${body.error}` : ""}).`
      );
    } catch (e) {
      setData(null);
      setLoadError(`Couldn't reach the server: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tester = !!user?.tester || !!viewingAs;
  if (!user || !tester) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-muted-foreground">
        This is a feature under test, for test accounts.{" "}
        <Link href="/" className="underline underline-offset-2">
          Home
        </Link>
      </div>
    );
  }

  const connect = async () => {
    setBusy("connect");
    try {
      const res = await fetch("/api/bank/link-token", { method: "POST" });
      const body = (await res.json()) as { linkToken?: string; error?: string };
      if (!res.ok || !body.linkToken) throw new Error(body.error || "Couldn't start Plaid");
      if (!window.Plaid) throw new Error("Plaid Link hasn't loaded yet — try again in a moment");
      const handler = window.Plaid.create({
        token: body.linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            const ex = await fetch("/api/bank/exchange", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ publicToken, institution: metadata.institution?.name ?? null }),
            });
            if (!ex.ok) throw new Error(((await ex.json()) as { error?: string }).error || "");
            toast.success("Bank connected — pulling deposits");
            await load();
            await sync();
          } catch (e) {
            toast.error(e instanceof Error && e.message ? e.message : "Couldn't connect the account");
          } finally {
            setBusy(null);
          }
        },
        onExit: () => setBusy(null),
      });
      handler.open();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start Plaid");
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy("sync");
    try {
      const res = await fetch("/api/bank/sync", { method: "POST" });
      const body = (await res.json()) as { error?: string; added?: number; matched?: number; residuals?: number };
      if (!res.ok) throw new Error(body.error || "Couldn't sync");
      toast.success(`${body.added} new; ${body.matched} matched to pay, ${body.residuals} residuals`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't sync");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect the bank and forget its deposits here?")) return;
    setBusy("disconnect");
    try {
      await fetch("/api/bank/connection", { method: "DELETE" });
      toast.success("Disconnected");
      await load();
    } finally {
      setBusy(null);
    }
  };

  const floorValue = data?.floor ?? DEFAULT_FLOOR;
  const shown = (data?.deposits ?? []).filter((d) => d.amount >= floorValue);

  return (
    <div className="max-w-4xl mx-auto px-4 space-y-4">
      <Script
        src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
        strategy="afterInteractive"
        onLoad={() => setLinkReady(true)}
      />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bank deposits</h1>
        <p className="text-sm text-muted-foreground mt-1">
          A feature under test. Connect a bank account, view only. Once a
          day the app looks for new deposits and lines each one up with the
          pay the calculator expected — the day or week it was for, and how
          close to the due date it landed. A deposit from a payroll house
          that matches no day is a residual. Deposits are net of
          withholding, so the match is made on the calendar first and the
          money second.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          {data && !data.configured && (
            <p className="text-sm text-amber-400">
              Plaid isn&rsquo;t configured yet — PLAID_CLIENT_ID and PLAID_SECRET
              are needed on the Worker (or in app_config), with PLAID_ENV set
              to sandbox until it&rsquo;s real.
            </p>
          )}
          {data?.envWarning && (
            <p className="text-sm text-amber-400">{data.envWarning}</p>
          )}
          {data?.configured && data.env === "sandbox" && (
            <p className="text-xs text-muted-foreground">
              Sandbox mode: Plaid&rsquo;s test bank only (any bank in the
              picker, user_good / pass_good). Set PLAID_ENV to production
              with the production secret when Plaid grants it.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            {data?.connection ? (
              <>
                <div className="text-sm">
                  <p className="font-medium">
                    {data.connection.institution || "Bank"} connected
                    {data.env && data.env !== "production" ? ` (${data.env})` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.connection.lastSyncedAt
                      ? `Last pulled ${new Date(data.connection.lastSyncedAt).toLocaleString("en-US")}`
                      : "Not pulled yet"}
                  </p>
                </div>
                <Button onClick={sync} disabled={busy !== null}>
                  {busy === "sync" ? "Pulling…" : "Pull deposits"}
                </Button>
                <Button variant="outline" onClick={disconnect} disabled={busy !== null}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button onClick={connect} disabled={busy !== null || !data?.configured || !linkReady}>
                {busy === "connect" ? "Opening Plaid…" : "Connect a bank account"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Deposits {data ? `— ${shown.length} at or above ${formatCurrency(floorValue)}` : ""}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Smaller deposits are not paychecks and are left out; the floor is
            set under{" "}
            <Link href="/preferences" className="underline underline-offset-2">
              Preferences
            </Link>
            .
          </p>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <p className="text-sm text-amber-400">{loadError}</p>
          ) : !data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {data.connection ? "Nothing above the floor yet — pull deposits." : "Connect a bank to see deposits."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Deposit</TableHead>
                    <TableHead className="hidden sm:table-cell">From</TableHead>
                    <TableHead>Lines up with</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Expected</TableHead>
                    <TableHead className="hidden md:table-cell">Timing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((d) => (
                    <TableRow key={d._id}>
                      <TableCell className="whitespace-nowrap">
                        {shortDay(d.date)}
                        {d.pending ? <span className="ml-1 text-xs text-muted-foreground">pending</span> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatCurrency(d.amount)}</TableCell>
                      <TableCell className="hidden sm:table-cell max-w-[12rem] truncate text-muted-foreground">
                        {d.name || "—"}
                      </TableCell>
                      <TableCell>
                        {d.matchKind === "day" && d.matchId ? (
                          <Link href={`/work/${d.matchId}`} className="underline underline-offset-2">
                            {d.matchLabel}
                          </Link>
                        ) : d.matchKind === "weekly" ? (
                          <Link href="/weekly" className="underline underline-offset-2">
                            {d.matchLabel}
                          </Link>
                        ) : d.matchKind === "residual" ? (
                          <span className="text-sky-300">Residual</span>
                        ) : (
                          <span className="text-muted-foreground">Not matched</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums hidden md:table-cell">
                        {d.expectedAmount != null ? (
                          <>
                            {formatCurrency(d.expectedAmount)}
                            <span className="block text-xs text-muted-foreground">
                              {Math.round((d.amount / d.expectedAmount) * 100)}% of gross
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className={`hidden md:table-cell text-xs ${
                        d.daysOff == null ? "text-muted-foreground" : Math.abs(d.daysOff) <= 3 ? "text-green-300" : "text-amber-300"
                      }`}>
                        {d.expectedDate ? `${daysWord(d.daysOff)} (${shortDay(d.expectedDate)})` : ""}
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
