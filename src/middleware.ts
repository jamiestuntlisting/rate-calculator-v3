import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "stl_session";

// Routes that don't require authentication
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/me"];

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Fail closed in production (see src/lib/auth.ts). Thrown inside the
    // verify try/catch below, so requests just get treated as signed out.
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET is not set");
    }
    return new TextEncoder().encode(
      "stuntlisting-bookkeeper-dev-secret-change-in-production"
    );
  }
  return new TextEncoder().encode(secret);
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

  // Verify JWT
  try {
    await jwtVerify(token, getSecretKey());
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
