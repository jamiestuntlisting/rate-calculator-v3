"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";

/**
 * The admin area's frame: a sidebar on a desktop and a scrolling strip
 * of chips on a phone, every tool grouped and the current one marked,
 * with a breadcrumb over the page so it is always clear where you are.
 * The pages themselves keep their own admin gates.
 */

const GROUPS: Array<{ title: string; items: Array<{ href: string; label: string }> }> = [
  {
    title: "Running it",
    items: [
      { href: "/admin/transcribe", label: "Transcribe queue" },
      { href: "/admin/tasks", label: "Tasks" },
      { href: "/admin/members", label: "Members" },
      { href: "/admin/names", label: "Names" },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/admin/rates", label: "Rate schedules" },
      { href: "/admin/reverse", label: "Reverse calculator" },
    ],
  },
  {
    title: "Benches",
    items: [
      { href: "/admin/weekly-bench", label: "Weekly bench" },
      { href: "/admin/time-bench", label: "Time bench" },
      { href: "/test-bench", label: "Test bench" },
    ],
  },
  {
    title: "Under test",
    items: [
      { href: "/admin/readings", label: "Claude reads the G" },
      { href: "/admin/imdb", label: "IMDb credits" },
      { href: "/admin/imdb/people", label: "IMDb people" },
      { href: "/admin/imdb/titles", label: "IMDb titles" },
      { href: "/admin/audits", label: "Audit a show" },
    ],
  },
  {
    title: "Plumbing",
    items: [{ href: "/admin/api", label: "API" }],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { user } = useAuth();
  const isAdmin = !!user && (user.role === "admin" || isAdminEmail(user.email));
  const current = ALL.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  const isIndex = pathname === "/admin";

  if (!isAdmin) return <>{children}</>;

  return (
    <div className="mx-auto max-w-7xl px-4">
      {/* Where you are, above the page: Admin › the tool. */}
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>
        {current && (
          <>
            <span className="mx-1.5">›</span>
            <span className="text-foreground">{current.label}</span>
          </>
        )}
      </nav>

      {/* Phone: one strip of chips, scrolling sideways. */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {ALL.map((i) => {
          const active = current?.href === i.href;
          return (
            <Link
              key={i.href}
              href={i.href}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground"
              }`}
            >
              {i.label}
            </Link>
          );
        })}
      </div>

      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
        {/* Desktop: the sidebar, grouped, the current tool marked. */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-5 text-sm">
            <Link
              href="/admin"
              className={`block rounded px-2 py-1 font-semibold ${
                isIndex ? "bg-accent" : "hover:bg-accent/50"
              }`}
            >
              Admin home
            </Link>
            {GROUPS.map((g) => (
              <div key={g.title}>
                <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {g.title}
                </p>
                <ul className="space-y-0.5">
                  {g.items.map((i) => {
                    const active = current?.href === i.href;
                    return (
                      <li key={i.href}>
                        <Link
                          href={i.href}
                          aria-current={active ? "page" : undefined}
                          className={`block rounded px-2 py-1 ${
                            active
                              ? "bg-accent font-medium text-foreground"
                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          }`}
                        >
                          {i.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
