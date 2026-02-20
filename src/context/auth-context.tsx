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

  // Check session on mount
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
                if (vaData.viewAsUserId) {
                  // Fetch the viewed user's info
                  const usersRes = await fetch("/api/admin/users");
                  if (usersRes.ok) {
                    const usersData = await usersRes.json();
                    const viewedUser = usersData.users.find(
                      (u: { id: string }) => u.id === vaData.viewAsUserId
                    );
                    if (viewedUser) {
                      setViewingAs({
                        id: viewedUser.id,
                        email: viewedUser.email,
                        firstName: viewedUser.firstName,
                        lastName: viewedUser.lastName,
                      });
                    }
                  }
                }
              }
            } catch {
              // Non-critical — just won't restore view-as state
            }
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

        const data = await res.json();

        if (res.status === 403 && data.error === "upgrade_required") {
          return {
            success: false,
            upgradeRequired: true,
            tier: data.tier,
            error: data.message,
          };
        }

        if (!res.ok) {
          return { success: false, error: data.error || "Login failed" };
        }

        setUser(data.user);
        router.replace("/");
        return { success: true };
      } catch {
        return { success: false, error: "Network error. Please try again." };
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
        // Reload the current page data
        router.refresh();
      }
    } catch {
      // Silently fail
    }
  }, [router]);

  const clearViewAs = useCallback(async () => {
    try {
      await fetch("/api/admin/view-as", { method: "DELETE" });
    } catch {
      // Silently fail
    }
    setViewingAs(null);
    router.refresh();
  }, [router]);

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
