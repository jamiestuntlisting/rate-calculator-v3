import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "stl_session";

// Routes that don't require authentication
// /how-it-works explains the app to someone who has not signed in, so it
// has to be reachable without a session.
const PUBLIC_PATHS = [
  "/login",
  "/how-it-works",
  "/api/auth/login",
  // Machine caller: the mailbox watcher. It authenticates with its own
  // shared secret inside the route, not a session cookie.
  "/api/inbound-email",
  "/api/auth/logout",
  "/api/auth/me",
];

function getEnvSecretKey(): Uint8Array | null {
  const secret = process.env.SESSION_SECRET;
  if (secret) return new TextEncoder().encode(secret);
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode(
      "stuntlisting-bookkeeper-dev-secret-change-in-production"
    );
  }
  // No env secret: the app may be running on the D1-stored secret
  // (src/lib/session-secret.ts). This edge middleware can't reach D1, so it
  // only gates on cookie presence and every API route / server data path
  // re-verifies the JWT with the real secret via getSession().
  return null;
}

// NOTE: This stays on the `middleware.ts` convention (edge runtime) rather
// than Next 16's `proxy.ts` (Node runtime) because @opennextjs/cloudflare
// does not support Node.js middleware yet — only Edge middleware.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow Next.js internals, static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check session cookie
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    // API routes return 401, pages redirect to login
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Verify JWT when the secret is available to the middleware
  const secretKey = getEnvSecretKey();
  if (!secretKey) {
    return NextResponse.next();
  }
  try {
    await jwtVerify(token, secretKey);
    return NextResponse.next();
  } catch {
    // Token is invalid or expired — clear cookie and redirect
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Session expired" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));

    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
}

export const config = {
  matcher: [
    // Match all paths except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
