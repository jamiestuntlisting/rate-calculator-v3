"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";

export interface AuthUser {
  id: string;
  stuntlistingUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  tier: string;
  role: string;
}

export interface ViewAsUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string; upgradeRequired?: boolean; tier?: string }>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  // Admin "view as" feature
  viewingAs: ViewAsUser | null;
  switchUser: (user: ViewAsUser) => Promise<void>;
  clearViewAs: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingAs, setViewingAs] = useState<ViewAsUser | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Check session on mount (and re-verify Plus membership via /api/auth/me)
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);

          // If admin, check if there's an active "view as" session
          if (data.user.role === "admin") {
            try {
              const vaRes = await fetch("/api/admin/view-as");
              if (vaRes.ok) {
                const vaData = await vaRes.json();
                if (vaData.viewAsUser) {
                  setViewingAs({
                    id: vaData.viewAsUser.id,
                    email: vaData.viewAsUser.email,
                    firstName: vaData.viewAsUser.firstName,
                    lastName: vaData.viewAsUser.lastName,
                  });
                }
              }
            } catch {
              // Non-critical — just won't restore view-as state
            }
          }
        } else if (res.status === 403) {
          // Membership expired — user is no longer Plus
          // Clear session and redirect to login (which will show upgrade prompt)
          setUser(null);
          try {
            await fetch("/api/auth/logout", { method: "POST" });
          } catch {
            // ignore
          }
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  // Redirect unauthenticated users to /login (client-side backup for proxy)
  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [loading, user, pathname, router]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        // Safely parse response — Vercel may return HTML on 500
        let data: Record<string, unknown>;
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await res.json();
        } else {
          const text = await res.text();
          return {
            success: false,
            error: `Server error (${res.status}). Non-JSON response: ${text.slice(0, 200)}`,
          };
        }

        if (res.status === 403 && data.error === "upgrade_required") {
          return {
            success: false,
            upgradeRequired: true,
            tier: data.tier as string,
            error: data.message as string,
          };
        }

        if (!res.ok) {
          return { success: false, error: (data.error as string) || `Login failed (${res.status})` };
        }

        setUser(data.user as AuthUser);
        router.replace("/");
        return { success: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: `Network error: ${msg}` };
      }
    },
    [router]
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Proceed with local logout even if API call fails
    }
    setUser(null);
    setViewingAs(null);
    router.replace("/login");
  }, [router]);

  const switchUser = useCallback(async (targetUser: ViewAsUser) => {
    try {
      const res = await fetch("/api/admin/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUser.id }),
      });
      if (res.ok) {
        setViewingAs(targetUser);
        // Full reload to ensure all data refetches with the new user filter
        window.location.reload();
      }
    } catch {
      // Silently fail
    }
  }, []);

  const clearViewAs = useCallback(async () => {
    try {
      await fetch("/api/admin/view-as", { method: "DELETE" });
    } catch {
      // Silently fail
    }
    setViewingAs(null);
    // Full reload to ensure all data refetches with the admin's own filter
    window.location.reload();
  }, []);

  const isAdmin = user?.role === "admin";

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, isAdmin, viewingAs, switchUser, clearViewAs }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
