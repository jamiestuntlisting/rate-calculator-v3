"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "radix-ui";
import { Menu, LogOut, User, Shield, Eye, X, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth, type ViewAsUser } from "@/context/auth-context";

const navLinks = [
  { href: "/", label: "Rate Calculator", adminOnly: false },
  { href: "/other-work", label: "Other Work Days", adminOnly: false },
  { href: "/tracker", label: "Payment Tracker", adminOnly: false },
  { href: "/analytics", label: "Analytics", adminOnly: false },
  { href: "/residuals", label: "Residuals", adminOnly: false },
  { href: "/test-bench", label: "Test Bench", adminOnly: true },
];

interface UserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tier: string;
  role: string;
}

export function AppHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const { user, logout, isAdmin, viewingAs, switchUser, clearViewAs } = useAuth();

  // Don't show full nav on login page
  const isLoginPage = pathname === "/login";

  // Fetch user list when admin opens the user menu
  useEffect(() => {
    if (userMenuOpen && isAdmin && users.length === 0) {
      setLoadingUsers(true);
      fetch("/api/admin/users")
        .then((r) => r.json())
        .then((data) => {
          if (data.users) setUsers(data.users);
        })
        .catch(() => {})
        .finally(() => setLoadingUsers(false));
    }
  }, [userMenuOpen, isAdmin, users.length]);

  const handleSwitchUser = async (target: UserListItem) => {
    await switchUser({
      id: target.id,
      email: target.email,
      firstName: target.firstName,
      lastName: target.lastName,
    } as ViewAsUser);
    setUserMenuOpen(false);
  };

  const handleClearViewAs = async () => {
    await clearViewAs();
    setUserMenuOpen(false);
  };

  const displayName = (u: { firstName?: string; lastName?: string; email: string }) =>
    u.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : u.email;

  return (
    <>
      {/* Admin "Viewing As" banner */}
      {viewingAs && (
        <div className="bg-amber-600 text-black text-sm font-medium">
          <div className="container mx-auto px-4 flex items-center justify-between h-9">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span>
                Viewing as: <strong>{displayName(viewingAs)}</strong>
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearViewAs}
              className="h-7 px-2 text-black hover:bg-amber-500 hover:text-black"
            >
              <X className="h-4 w-4 mr-1" />
              Back to my data
            </Button>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-[#111111]">
        <div className="container flex h-14 items-center justify-between mx-auto px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center font-bold text-lg tracking-tight">
              <span className="text-white uppercase">Stunt</span>
              <span className="text-stunt-red uppercase">Listing</span>
              <span className="text-muted-foreground font-normal text-sm ml-2">Bookkeeper</span>
            </Link>

            {/* Desktop nav — only show when logged in */}
            {user && !isLoginPage && (
              <nav className="hidden md:flex items-center gap-4">
                {navLinks.filter((l) => !l.adminOnly || isAdmin).map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "text-sm font-medium transition-colors hover:text-primary",
                      (link.href === "/" ? pathname === "/" : pathname.startsWith(link.href))
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* User menu — only when logged in */}
            {user && !isLoginPage && (
              <>
                {/* Desktop user menu */}
                <div className="hidden md:flex items-center gap-2 relative">
                  {/* Admin user switcher button */}
                  {isAdmin ? (
                    <button
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
                    >
                      <Shield className="h-4 w-4 text-amber-500" />
                      <span className="max-w-[150px] truncate">
                        {user.firstName || user.email}
                      </span>
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span className="max-w-[150px] truncate">
                        {user.firstName || user.email}
                      </span>
                    </div>
                  )}

                  {/* Admin dropdown */}
                  {userMenuOpen && isAdmin && (
                    <>
                      {/* Backdrop to close */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setUserMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-[#1a1a1a] border border-border/50 rounded-lg shadow-xl overflow-hidden">
                        <div className="px-3 py-2 border-b border-border/30">
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                            View as member
                          </p>
                        </div>

                        {/* Back to my data option */}
                        {viewingAs && (
                          <button
                            onClick={handleClearViewAs}
                            className="w-full px-3 py-2 text-left text-sm bg-amber-600/10 border-b border-border/30 hover:bg-amber-600/20 transition-colors flex items-center gap-2 text-amber-400"
                          >
                            <X className="h-3 w-3" />
                            Back to my data
                          </button>
                        )}

                        <div className="max-h-64 overflow-y-auto">
                          {loadingUsers ? (
                            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                              Loading members...
                            </div>
                          ) : (
                            users.map((u) => {
                              const isCurrentUser = u.id === user.id;
                              const isViewedUser = viewingAs?.id === u.id;
                              return (
                                <button
                                  key={u.id}
                                  onClick={() => {
                                    if (isCurrentUser) {
                                      handleClearViewAs();
                                    } else {
                                      handleSwitchUser(u);
                                    }
                                  }}
                                  className={cn(
                                    "w-full px-3 py-2 text-left text-sm hover:bg-[#222] transition-colors flex items-center justify-between",
                                    isViewedUser && "bg-amber-600/10"
                                  )}
                                >
                                  <div>
                                    <div className="text-foreground">
                                      {displayName(u)}
                                      {isCurrentUser && (
                                        <span className="text-muted-foreground ml-1">(you)</span>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">{u.email}</div>
                                  </div>
                                  {isViewedUser && (
                                    <Eye className="h-3 w-3 text-amber-500 shrink-0" />
                                  )}
                                  {u.role === "admin" && !isViewedUser && (
                                    <Shield className="h-3 w-3 text-amber-500/50 shrink-0" />
                                  )}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={logout}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <LogOut className="h-4 w-4 mr-1" />
                    Sign Out
                  </Button>
                </div>

                {/* Mobile nav */}
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild className="md:hidden">
                    <Button variant="ghost" size="icon" className="text-foreground">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-72">
                    <VisuallyHidden.Root>
                      <SheetTitle>Navigation</SheetTitle>
                    </VisuallyHidden.Root>

                    {/* Mobile user info */}
                    <div className="flex items-center gap-2 mt-4 mb-6 px-1 text-sm">
                      {isAdmin ? (
                        <Shield className="h-4 w-4 text-amber-500" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-foreground truncate">
                        {displayName(user)}
                      </span>
                    </div>

                    <nav className="flex flex-col gap-4">
                      {navLinks.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "text-lg font-medium transition-colors hover:text-primary",
                            pathname === link.href
                              ? "text-primary"
                              : "text-muted-foreground"
                          )}
                        >
                          {link.label}
                        </Link>
                      ))}
                    </nav>

                    {/* Mobile admin: user switcher */}
                    {isAdmin && (
                      <div className="mt-6 pt-4 border-t border-border/50">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2 px-1">
                          View as member
                        </p>
                        {viewingAs && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              clearViewAs();
                              setMobileOpen(false);
                            }}
                            className="w-full justify-start text-amber-400 hover:text-amber-300 mb-2"
                          >
                            <X className="h-3 w-3 mr-2" />
                            Back to my data
                          </Button>
                        )}
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {users.map((u) => {
                            const isCurrentUser = u.id === user.id;
                            const isViewedUser = viewingAs?.id === u.id;
                            return (
                              <button
                                key={u.id}
                                onClick={() => {
                                  if (isCurrentUser) {
                                    clearViewAs();
                                  } else {
                                    switchUser({
                                      id: u.id,
                                      email: u.email,
                                      firstName: u.firstName,
                                      lastName: u.lastName,
                                    });
                                  }
                                  setMobileOpen(false);
                                }}
                                className={cn(
                                  "w-full px-2 py-1.5 text-left text-sm rounded hover:bg-[#222] transition-colors",
                                  isViewedUser && "bg-amber-600/10"
                                )}
                              >
                                <span className="text-foreground text-xs">
                                  {displayName(u)}
                                  {isCurrentUser && " (you)"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="mt-6 pt-4 border-t border-border/50">
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setMobileOpen(false);
                          logout();
                        }}
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                      </Button>
                    </div>
                  </SheetContent>
                </Sheet>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
