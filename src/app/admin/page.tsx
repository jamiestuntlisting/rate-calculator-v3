"use client";

import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ArrowRight } from "lucide-react";

interface EndpointDef {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  auth: "public" | "user" | "admin";
}

interface EndpointGroup {
  group: string;
  endpoints: EndpointDef[];
}

const ENDPOINTS: EndpointGroup[] = [
  {
    group: "Rates & Contracts",
    endpoints: [
      {
        method: "GET",
        path: "/api/contracts",
        description: "All contract schedules (daily, weekly, hourly), OT tiers, day multipliers, meal penalties, forced-call cap.",
        auth: "user",
      },
      {
        method: "POST",
        path: "/api/calculate",
        description: "Calculate a rate breakdown from an Exhibit G input.",
        auth: "user",
      },
    ],
  },
  {
    group: "Authentication",
    endpoints: [
      { method: "POST", path: "/api/auth/login", description: "Log in with email + password.", auth: "public" },
      { method: "POST", path: "/api/auth/logout", description: "Clear session cookie.", auth: "user" },
      { method: "GET", path: "/api/auth/me", description: "Current user + Plus-membership re-verification.", auth: "user" },
      { method: "POST", path: "/api/auth/migrate", description: "Migrate a legacy user record.", auth: "user" },
    ],
  },
  {
    group: "Work Records",
    endpoints: [
      { method: "GET", path: "/api/work-records", description: "List this user's work records (supports filters).", auth: "user" },
      { method: "POST", path: "/api/work-records", description: "Create a work record.", auth: "user" },
      { method: "GET", path: "/api/work-records/[id]", description: "Fetch a single work record.", auth: "user" },
      { method: "PUT", path: "/api/work-records/[id]", description: "Update a work record.", auth: "user" },
      { method: "DELETE", path: "/api/work-records/[id]", description: "Delete a work record.", auth: "user" },
    ],
  },
  {
    group: "Residuals",
    endpoints: [
      { method: "GET", path: "/api/residuals", description: "List residual imports.", auth: "user" },
      { method: "POST", path: "/api/residuals", description: "Upload / create a residual import.", auth: "user" },
      { method: "GET", path: "/api/residuals/[id]", description: "Fetch a residual import.", auth: "user" },
      { method: "DELETE", path: "/api/residuals/[id]", description: "Delete a residual import.", auth: "user" },
      { method: "GET", path: "/api/residuals/[id]/production", description: "Residual data grouped by production.", auth: "user" },
    ],
  },
  {
    group: "Uploads",
    endpoints: [
      { method: "POST", path: "/api/uploads", description: "Upload a document file.", auth: "user" },
      { method: "GET", path: "/api/uploads/[filename]", description: "Fetch an uploaded file by filename.", auth: "user" },
    ],
  },
  {
    group: "Admin",
    endpoints: [
      { method: "GET", path: "/api/admin/users", description: "List all users.", auth: "admin" },
      { method: "GET", path: "/api/admin/view-as", description: "Get current 'view as' session.", auth: "admin" },
      { method: "POST", path: "/api/admin/view-as", description: "Start viewing as another user.", auth: "admin" },
      { method: "DELETE", path: "/api/admin/view-as", description: "Clear 'view as' session.", auth: "admin" },
    ],
  },
];

const methodColor: Record<EndpointDef["method"], string> = {
  GET: "bg-emerald-600/20 text-emerald-400 border-emerald-600/40",
  POST: "bg-blue-600/20 text-blue-400 border-blue-600/40",
  PUT: "bg-amber-600/20 text-amber-400 border-amber-600/40",
  PATCH: "bg-amber-600/20 text-amber-400 border-amber-600/40",
  DELETE: "bg-red-600/20 text-red-400 border-red-600/40",
};

const authLabel: Record<EndpointDef["auth"], { label: string; className: string }> = {
  public: { label: "public", className: "text-muted-foreground" },
  user: { label: "user", className: "text-foreground" },
  admin: { label: "admin", className: "text-amber-400" },
};

export default function AdminPage() {
  const { user, loading } = useAuth();

  if (loading) return null;

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
          Admin tools and API endpoint reference.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tools</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link
            href="/admin/transcribe"
            className="flex items-center gap-3 p-3 rounded border border-border/50 hover:bg-[#1a1a1a] transition-colors"
          >
            <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Transcribe Exhibit G</div>
              <div className="text-xs text-muted-foreground">
                Log Exhibit G info for a performer from an attached-only record.
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </Link>
        </CardContent>
      </Card>

      <div>
        <p className="text-sm text-muted-foreground">
          API endpoint reference — click a GET endpoint to open it in a new tab.
        </p>
      </div>

      {ENDPOINTS.map((group) => (
        <Card key={group.group}>
          <CardHeader>
            <CardTitle className="text-lg">{group.group}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.endpoints.map((ep) => {
              const canOpen = ep.method === "GET" && !ep.path.includes("[");
              const row = (
                <div className="flex items-center gap-3 py-2 px-3 rounded hover:bg-[#1a1a1a] transition-colors">
                  <Badge
                    variant="outline"
                    className={`w-16 justify-center text-xs font-mono ${methodColor[ep.method]}`}
                  >
                    {ep.method}
                  </Badge>
                  <code className="text-sm font-mono text-foreground min-w-0 flex-shrink-0">
                    {ep.path}
                  </code>
                  <span className="text-xs text-muted-foreground flex-1 truncate">
                    {ep.description}
                  </span>
                  <span className={`text-xs ${authLabel[ep.auth].className}`}>
                    {authLabel[ep.auth].label}
                  </span>
                </div>
              );
              return canOpen ? (
                <a
                  key={ep.path}
                  href={ep.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  {row}
                </a>
              ) : (
                <div key={`${ep.method}-${ep.path}`}>{row}</div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
