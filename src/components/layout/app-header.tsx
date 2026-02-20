"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "radix-ui";
import { Menu, LogOut, User, Shield } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";

const navLinks = [
  { href: "/", label: "Rate Calculator" },
  { href: "/other-work", label: "Other Work Days" },
  { href: "/tracker", label: "Payment Tracker" },
  { href: "/analytics", label: "Analytics" },
  { href: "/residuals", label: "Residuals" },
];

export function AppHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout, isAdmin } = useAuth();

  // Don't show full nav on login page
  const isLoginPage = pathname === "/login";

  return (
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
              {navLinks.map((link) => (
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
              <div className="hidden md:flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {isAdmin ? (
                    <Shield className="h-4 w-4 text-amber-500" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                  <span className="max-w-[150px] truncate">
                    {user.firstName || user.email}
                  </span>
                </div>
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
                <SheetContent side="right" className="w-64">
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
                      {user.firstName ? `${user.firstName} ${user.lastName}` : user.email}
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

                  <div className="mt-8 pt-4 border-t border-border/50">
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
  );
}
