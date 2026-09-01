"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FileText,
  ArrowRight,
  Code2,
  Ban,
  ListTodo,
  FlaskConical,
  CalendarClock,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";

/** The pages visitors and members see, editable in place by an admin. */
const PUBLIC_PAGES = [
  {
    href: "/how-it-works",
    title: "How it works",
    detail: "The landing page — the walked flow, the example numbers.",
  },
  {
    href: "/membership",
    title: "Membership",
    detail: "Plans, prices and taglines.",
  },
  {
    href: "/membership/quiz",
    title: "Membership quiz",
    detail: "The which-plan-fits questionnaire.",
  },
];

const ADMIN_PAGES = [
  {
    href: "/admin/transcribe",
    title: "Transcribe Exhibit G",
    detail: "Fill in a performer's uploaded Exhibit G for them.",
    icon: FileText,
  },
  {
    href: "/admin/names",
    title: "Names",
    detail: "Block misspelled show titles and character names.",
    icon: Ban,
  },
  {
    href: "/admin/rates",
    title: "Rate schedules",
    detail: "The rates in force by date — what any work day is priced on.",
    icon: CalendarClock,
  },
  {
    href: "/admin/weekly-bench",
    title: "Weekly bench",
    detail: "Check our weekly calculation against a ShowBiz export.",
    icon: FlaskConical,
  },
  {
    href: "/admin/time-bench",
    title: "Daily tests",
    detail: "The Log Work time rules in words, each checked live.",
    icon: FlaskConical,
  },
  {
    href: "/admin/tasks",
    title: "Tasks",
    detail: "What still needs doing, and who it is waiting on.",
    icon: ListTodo,
  },
  {
    href: "/admin/api",
    title: "API",
    detail: "Endpoint reference with request and response shapes.",
    icon: Code2,
  },
];

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) return null;

  if (!user || !isAdminEmail(user.email)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tools for running the Bookkeeper.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground -mt-2 mb-1">
            The public-facing pages. Open one and use the Edit page button
            in the corner to change its text or numbers in place — saved
            copy goes live for everyone straight away.
          </p>
          {PUBLIC_PAGES.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="flex items-center gap-3 p-3 rounded border border-border/50 hover:bg-[#1a1a1a] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{page.title}</div>
                <div className="text-xs text-muted-foreground">
                  {page.detail}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tools</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {ADMIN_PAGES.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="flex items-center gap-3 p-3 rounded border border-border/50 hover:bg-[#1a1a1a] transition-colors"
            >
              <page.icon className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{page.title}</div>
                <div className="text-xs text-muted-foreground">
                  {page.detail}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
