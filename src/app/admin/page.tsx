"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/context/auth-context";
import { isAdminEmail } from "@/lib/admin-emails";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Auth = "public" | "user" | "admin";

interface ParamDoc {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

interface EndpointDef {
  method: Method;
  path: string;
  description: string;
  auth: Auth;
  pathParams?: ParamDoc[];
  queryParams?: ParamDoc[];
  body?: string; // JSON sample
  bodyNotes?: ParamDoc[];
  response: string; // JSON sample
  exampleCurl?: string;
}

interface EndpointGroup {
  group: string;
  endpoints: EndpointDef[];
}

const EXHIBIT_G_INPUT_SAMPLE = `{
  "showName": "The Show",
  "workDate": "2026-03-15",
  "callTime": "07:00",
  "dismissOnSet": "19:30",
  "dismissMakeupWardrobe": "21:30",
  "ndMealIn": null,
  "ndMealOut": null,
  "firstMealStart": "13:00",
  "firstMealFinish": "13:30",
  "secondMealStart": null,
  "secondMealFinish": null,
  "stuntAdjustment": 0,
  "forcedCall": false,
  "isSixthDay": false,
  "isSeventhDay": false,
  "isHoliday": false,
  "workStatus": "theatrical_basic",
  "characterName": "",
  "notes": ""
}`;

const WORK_RECORD_CREATE_BODY = `{
  "showName": "The Show",
  "workDate": "2026-03-15",
  "callTime": "07:00",
  "dismissOnSet": "19:30",
  "dismissMakeupWardrobe": "21:30",
  "firstMealStart": "13:00",
  "firstMealFinish": "13:30",
  "stuntAdjustment": 0,
  "workStatus": "theatrical_basic",
  "workType": "sag_aftra",
  "recordStatus": "complete",
  "forcedCall": false,
  "isSixthDay": false,
  "isSeventhDay": false,
  "isHoliday": false,
  "characterName": "",
  "notes": "",
  "paymentStatus": "unpaid",
  "paidAmount": 0
}`;

const ENDPOINTS: EndpointGroup[] = [
  {
    group: "Rates & Contracts",
    endpoints: [
      {
        method: "GET",
        path: "/api/contracts",
        description: "Contract schedules, OT tiers, day multipliers, meal penalties, forced-call cap.",
        auth: "user",
        response: `{
  "agreement": "SAG-AFTRA Theatrical Basic Agreement 2025-2026",
  "effectiveDate": "2025-07-01",
  "contracts": [
    { "id": "theatrical_basic", "label": "Theatrical Basic",
      "daily": 1246, "weekly": 4646, "hourly": 155.75,
      "straightTimeHours": 8 }
  ],
  "overtime": { "straightTimeEnd": 8, "timeAndHalfEnd": 10,
    "multipliers": { "straight": 1, "timeAndHalf": 1.5, "doubleTime": 2 } },
  "dayMultipliers": { "sixthDay": 1.5, "seventhDay": 2, "holiday": 2 },
  "mealPenalties": { "firstHalfHour": 25, "secondHalfHour": 35,
    "eachAdditionalHalfHour": 50, "maxHoursBeforeFirstMeal": 6,
    "maxHoursBeforeSecondMeal": 6 },
  "forcedCall": { "maxPenalty": 900 }
}`,
      },
      {
        method: "POST",
        path: "/api/calculate",
        description: "Compute rate breakdown for a given Exhibit G input. Does not persist.",
        auth: "user",
        body: EXHIBIT_G_INPUT_SAMPLE,
        response: `{
  "calculationId": "uuid",
  "input": { /* echo of the input */ },
  "breakdown": {
    "baseRate": 1246, "hourlyRate": 155.75,
    "adjustedBaseRate": 1246, "adjustedHourlyRate": 155.75,
    "totalWorkHours": 14.5, "totalMealTime": 0.5, "netWorkHours": 14,
    "segments": [ { "label": "Straight Time (Hrs 1-8)",
      "hours": 8, "rate": 155.75, "multiplier": 1, "subtotal": 1246 } ],
    "penalties": { "mealPenalties": [], "forcedCallPenalty": 0,
      "totalPenalties": 0 },
    "dayMultiplier": { "applied": false, "type": null, "multiplier": 1 },
    "grandTotal": 2959.25
  }
}`,
      },
    ],
  },
  {
    group: "Authentication",
    endpoints: [
      {
        method: "POST",
        path: "/api/auth/login",
        description: "Log in with email + password. Sets httpOnly stl_session cookie on success.",
        auth: "public",
        body: `{
  "email": "user@example.com",
  "password": "••••••••"
}`,
        response: `{
  "user": {
    "id": "MongoDB _id",
    "stuntlistingUserId": "stl internal id",
    "email": "user@example.com",
    "firstName": "First", "lastName": "Last",
    "tier": "plus", "role": "user"
  }
}`,
      },
      {
        method: "GET",
        path: "/api/auth/login",
        description: "Build-info probe (returns deployment timestamp for verifying the live version).",
        auth: "public",
        response: `{ "buildTimestamp": "2026-04-20T17:00:00.000Z" }`,
      },
      {
        method: "POST",
        path: "/api/auth/logout",
        description: "Clear session cookie.",
        auth: "user",
        response: `{ "ok": true }`,
      },
      {
        method: "GET",
        path: "/api/auth/me",
        description: "Current user + live Plus-membership re-verification. 403 if downgraded.",
        auth: "user",
        response: `{ "user": { /* same as /login */ } }`,
      },
      {
        method: "POST",
        path: "/api/auth/migrate",
        description: "Migrate a legacy user record to the new schema.",
        auth: "user",
        response: `{ "migrated": true }`,
      },
    ],
  },
  {
    group: "Work Records",
    endpoints: [
      {
        method: "GET",
        path: "/api/work-records",
        description: "List the current user's work records (or the view-as target if admin has one active).",
        auth: "user",
        queryParams: [
          { name: "page", type: "number", description: "Page number (default 1)." },
          { name: "limit", type: "number", description: "Page size (default 20)." },
          { name: "sort", type: "string", description: "Sort field (default workDate)." },
          { name: "order", type: "'asc'|'desc'", description: "Sort order (default desc)." },
          { name: "status", type: "string", description: "Filter by paymentStatus." },
          { name: "recordStatus", type: "string", description: "Filter: complete | needs_times | draft | attachment_only." },
          { name: "show", type: "string", description: "Case-insensitive showName regex match." },
        ],
        response: `{
  "records": [ { "_id": "…", "showName": "…", "workDate": "…", ... } ],
  "total": 42, "page": 1, "pages": 3
}`,
      },
      {
        method: "POST",
        path: "/api/work-records",
        description: "Create a work record for the current user.",
        auth: "user",
        body: WORK_RECORD_CREATE_BODY,
        response: `{ "_id": "…", /* full WorkRecord */ }`,
      },
      {
        method: "GET",
        path: "/api/work-records/[id]",
        description: "Fetch one work record by id (must belong to the current user).",
        auth: "user",
        pathParams: [{ name: "id", type: "string", required: true, description: "Work record _id." }],
        response: `{ "_id": "…", /* full WorkRecord */ }`,
      },
      {
        method: "PUT",
        path: "/api/work-records/[id]",
        description: "Update a work record. Body may be a partial WorkRecord.",
        auth: "user",
        pathParams: [{ name: "id", type: "string", required: true, description: "Work record _id." }],
        body: `{ /* partial WorkRecord fields to update */ }`,
        response: `{ "_id": "…", /* updated WorkRecord */ }`,
      },
      {
        method: "DELETE",
        path: "/api/work-records/[id]",
        description: "Delete a work record.",
        auth: "user",
        pathParams: [{ name: "id", type: "string", required: true, description: "Work record _id." }],
        response: `{ "deleted": true }`,
      },
    ],
  },
  {
    group: "Residuals",
    endpoints: [
      {
        method: "GET",
        path: "/api/residuals",
        description: "List residual imports for the current user.",
        auth: "user",
        response: `{ "residuals": [ { "_id": "…", /* … */ } ] }`,
      },
      {
        method: "POST",
        path: "/api/residuals",
        description: "Upload/create a residual import (multipart form).",
        auth: "user",
        body: `FormData { file: File, ...metadata }`,
        response: `{ "_id": "…", /* import record */ }`,
      },
      {
        method: "GET",
        path: "/api/residuals/[id]",
        description: "Fetch a residual import.",
        auth: "user",
        pathParams: [{ name: "id", type: "string", required: true, description: "Residual import _id." }],
        response: `{ "_id": "…", /* import record */ }`,
      },
      {
        method: "DELETE",
        path: "/api/residuals/[id]",
        description: "Delete a residual import.",
        auth: "user",
        pathParams: [{ name: "id", type: "string", required: true, description: "Residual import _id." }],
        response: `{ "deleted": true }`,
      },
      {
        method: "GET",
        path: "/api/residuals/[id]/production",
        description: "Residual data grouped by production.",
        auth: "user",
        pathParams: [{ name: "id", type: "string", required: true, description: "Residual import _id." }],
        response: `{ "productions": [ { "title": "…", "total": 123.45, "rows": [] } ] }`,
      },
    ],
  },
  {
    group: "Uploads",
    endpoints: [
      {
        method: "POST",
        path: "/api/uploads",
        description: "Upload a document file (stored as binary in MongoDB).",
        auth: "user",
        body: `FormData { file: File, documentType?: string }`,
        response: `{ "filename": "uuid.ext", "originalName": "…",
  "documentType": "exhibit_g", "uploadedAt": "ISO" }`,
      },
      {
        method: "GET",
        path: "/api/uploads/[filename]",
        description: "Fetch an uploaded file by stored filename.",
        auth: "user",
        pathParams: [{ name: "filename", type: "string", required: true, description: "Stored filename returned by POST /api/uploads." }],
        response: `/* binary — content-type set from the stored mime type */`,
      },
    ],
  },
  {
    group: "Admin",
    endpoints: [
      {
        method: "GET",
        path: "/api/admin/users",
        description: "List all users.",
        auth: "admin",
        response: `{
  "users": [
    { "id": "MongoDB _id", "stuntlistingUserId": "…",
      "email": "…", "firstName": "…", "lastName": "…",
      "tier": "plus", "role": "user", "lastLogin": "ISO" }
  ]
}`,
      },
      {
        method: "GET",
        path: "/api/admin/view-as",
        description: "Get the admin's active 'view as' user, if any.",
        auth: "admin",
        response: `{ "viewAsUser": { "id": "…", "email": "…",
  "firstName": "…", "lastName": "…" } | null }`,
      },
      {
        method: "POST",
        path: "/api/admin/view-as",
        description: "Start viewing as another user. Sets stl_view_as cookie. All other endpoints scope to this user until cleared.",
        auth: "admin",
        body: `{ "userId": "MongoDB _id" }`,
        response: `{ "ok": true }`,
      },
      {
        method: "DELETE",
        path: "/api/admin/view-as",
        description: "Clear the 'view as' cookie.",
        auth: "admin",
        response: `{ "ok": true }`,
      },
      {
        method: "GET",
        path: "/api/admin/users/[userId]/work-records",
        description: "All work records for a specific user, optionally filtered to records with a date >= 'since'.",
        auth: "admin",
        pathParams: [{ name: "userId", type: "string", required: true, description: "Target user's MongoDB _id." }],
        queryParams: [
          { name: "since", type: "ISO-8601 datetime", description: "Lower bound (inclusive). Omit for all records." },
          { name: "field", type: "'workDate'|'updatedAt'|'createdAt'", description: "Which date field to filter on (default workDate)." },
        ],
        response: `{
  "user": { "id": "…", "email": "…", "firstName": "…", "lastName": "…" },
  "since": "2026-01-01T00:00:00Z",
  "field": "workDate",
  "count": 12,
  "records": [ { "_id": "…", /* full WorkRecord */ } ]
}`,
        exampleCurl: `curl -H "Cookie: stl_session=…" \\
  "https://…/api/admin/users/<USER_ID>/work-records?since=2026-01-01T00:00:00Z"`,
      },
      {
        method: "POST",
        path: "/api/admin/users/[userId]/work-records",
        description: "Create a work record under the specified user's account. Rate breakdown auto-computed when enough fields are present.",
        auth: "admin",
        pathParams: [{ name: "userId", type: "string", required: true, description: "Target user's MongoDB _id." }],
        body: WORK_RECORD_CREATE_BODY,
        bodyNotes: [
          { name: "showName", type: "string", required: true, description: "Show / production name." },
          { name: "workDate", type: "YYYY-MM-DD", required: true, description: "The work date." },
          { name: "workStatus", type: "theatrical_basic | television | stunt_coordinator", description: "Rate schedule; required for complete SAG-AFTRA records." },
          { name: "callTime / dismissOnSet", type: "HH:MM (24h)", description: "Required when recordStatus='complete' and workStatus is not stunt_coordinator." },
          { name: "recordStatus", type: "complete | needs_times | draft | attachment_only", description: "Defaults to 'complete'." },
          { name: "calculation", type: "object", description: "Optional. If omitted, computed from the input when possible." },
        ],
        response: `{ "_id": "…", /* full WorkRecord including computed calculation */ }`,
      },
    ],
  },
];

const methodColor: Record<Method, string> = {
  GET: "bg-emerald-600/20 text-emerald-400 border-emerald-600/40",
  POST: "bg-blue-600/20 text-blue-400 border-blue-600/40",
  PUT: "bg-amber-600/20 text-amber-400 border-amber-600/40",
  PATCH: "bg-amber-600/20 text-amber-400 border-amber-600/40",
  DELETE: "bg-red-600/20 text-red-400 border-red-600/40",
};

const authLabel: Record<Auth, { label: string; className: string }> = {
  public: { label: "public", className: "text-muted-foreground" },
  user: { label: "user", className: "text-foreground" },
  admin: { label: "admin", className: "text-amber-400" },
};

function ParamTable({ title, params }: { title: string; params: ParamDoc[] }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="border border-border/40 rounded overflow-hidden">
        {params.map((p, i) => (
          <div
            key={p.name}
            className={`grid grid-cols-[160px_180px_1fr] gap-2 text-xs px-3 py-2 ${
              i > 0 ? "border-t border-border/40" : ""
            }`}
          >
            <div className="font-mono">
              {p.name}
              {p.required && <span className="text-red-400 ml-1">*</span>}
            </div>
            <div className="font-mono text-muted-foreground">{p.type}</div>
            <div className="text-muted-foreground">{p.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <pre className="bg-[#0a0a0a] border border-border/40 rounded p-3 text-xs font-mono overflow-x-auto text-foreground whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

function EndpointCard({ ep }: { ep: EndpointDef }) {
  const [open, setOpen] = useState(false);
  const canOpen = ep.method === "GET" && !ep.path.includes("[");

  return (
    <div className="border border-border/40 rounded overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#1a1a1a] transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <Badge
          variant="outline"
          className={`w-16 justify-center text-xs font-mono ${methodColor[ep.method]}`}
        >
          {ep.method}
        </Badge>
        <code className="text-sm font-mono text-foreground shrink-0">
          {ep.path}
        </code>
        <span className="text-xs text-muted-foreground flex-1 truncate">
          {ep.description}
        </span>
        <span className={`text-xs ${authLabel[ep.auth].className}`}>
          {authLabel[ep.auth].label}
        </span>
      </button>

      {open && (
        <div className="p-4 space-y-4 border-t border-border/40 bg-[#0d0d0d]">
          {canOpen && (
            <a
              href={ep.path}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:underline"
            >
              Open {ep.path} in new tab →
            </a>
          )}

          {ep.pathParams && ep.pathParams.length > 0 && (
            <ParamTable title="Path parameters" params={ep.pathParams} />
          )}

          {ep.queryParams && ep.queryParams.length > 0 && (
            <ParamTable title="Query parameters" params={ep.queryParams} />
          )}

          {ep.body && <CodeBlock title="Request body" code={ep.body} />}

          {ep.bodyNotes && ep.bodyNotes.length > 0 && (
            <ParamTable title="Body field notes" params={ep.bodyNotes} />
          )}

          <CodeBlock title="Response (shape)" code={ep.response} />

          {ep.exampleCurl && <CodeBlock title="Example" code={ep.exampleCurl} />}
        </div>
      )}
    </div>
  );
}

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
          API endpoint reference — click a row to expand request / response
          details. Fields marked <span className="text-red-400">*</span> are
          required. All endpoints use JSON unless noted.
        </p>
      </div>

      {ENDPOINTS.map((group) => (
        <Card key={group.group}>
          <CardHeader>
            <CardTitle className="text-lg">{group.group}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.endpoints.map((ep) => (
              <EndpointCard key={`${ep.method}-${ep.path}`} ep={ep} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
