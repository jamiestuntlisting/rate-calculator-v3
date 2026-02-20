import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "stl_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

function getSecretKey() {
  const secret = process.env.SESSION_SECRET || "stuntlisting-bookkeeper-dev-secret-change-in-production";
  return new TextEncoder().encode(secret);
}

// Admin emails — these users get admin role
export const ADMIN_EMAILS = [
  "james.northrup@gmail.com",
  "jamie@stuntlisting.com",
  "warrenhullstunts@gmail.com",
  "warren@stuntlisting.com",
  "greg@stuntlisting.com",
  "info@stuntlisting.com",
  "thestuntassistant@gmail.com",
  "derric@stuntlisting.com",
];

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export interface SessionPayload {
  userId: string; // MongoDB User _id
  stuntlistingUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  tier: string;
  role: string;
  stlAccessToken?: string; // StuntListing API token for re-verification
}

/** Create a signed JWT session token */
export async function createSession(payload: SessionPayload): Promise<string> {
  const jwt = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecretKey());

  return jwt;
}

/** Verify and decode a session token */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Set session cookie */
export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

/** Get session from cookie */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Delete session cookie */
export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/** Helper to get the current user's MongoDB _id from session, or null */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.userId ?? null;
}

/** Helper to check if current session user is admin */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const session = await getSession();
  return session?.role === "admin";
}
