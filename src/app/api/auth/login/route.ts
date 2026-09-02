import { NextResponse } from "next/server";
import { isTester } from "@/lib/test-users";
import { upsertUserByStuntlistingId, findUserByStuntlistingId, setUserPhone } from "@/lib/repos/users";
import { isPlausiblePhone, phoneDigits } from "@/lib/phone";
import { resolveMembershipTier } from "@/lib/membership";
import {
  createSession,
  isAdminEmail,
  type SessionPayload,
} from "@/lib/auth";

const SESSION_COOKIE = "stl_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const BUILD_TS = "2026-02-23T01";

/**
 * GET /api/auth/login — returns build version for deployment verification
 */
export async function GET() {
  return NextResponse.json({ build: BUILD_TS, status: "ok" });
}

/**
 * POST /api/auth/login
 * Authenticates via StuntListing GraphQL API.
 * Only allows Plus members (or admins) in.
 * Standard/Free members get a redirect to upgrade.
 */
export async function POST(request: Request) {
  let step = "parsing request";
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required", build: BUILD_TS },
        { status: 400 }
      );
    }

    // 1. Authenticate with StuntListing GraphQL API
    step = "authenticating with StuntListing";
    const loginRes = await fetch("https://api.stuntlisting.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation Login($email: String!, $password: String!) {
            login(email: $email, password: $password) {
              access_token
              refresh_token
            }
          }
        `,
        variables: { email, password },
      }),
    });

    const loginData = await loginRes.json();

    if (loginData.errors || !loginData.data?.login?.access_token) {
      const errorMsg =
        loginData.errors?.[0]?.message || "Invalid email or password";
      return NextResponse.json({ error: errorMsg, build: BUILD_TS }, { status: 401 });
    }

    const { access_token } = loginData.data.login;

    // 2. Fetch user profile from StuntListing API (using actual STL field names)
    step = "fetching StuntListing profile";
    const profileRes = await fetch("https://api.stuntlisting.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify({
        operationName: "getMyProfile",
        variables: {},
        query: `query getMyProfile {
          getMyProfile {
            id
            email
            first_name
            last_name
            role
            is_subscription_active
            subscription_type
          }
        }`,
      }),
    });

    const profileData = await profileRes.json();

    if (profileData.errors || !profileData.data?.getMyProfile) {
      return NextResponse.json(
        { error: "Failed to fetch user profile from StuntListing", build: BUILD_TS },
        { status: 500 }
      );
    }

    const profile = profileData.data.getMyProfile;
    const userEmail = (profile.email || email).toLowerCase().trim();

    // Determine membership tier — Stripe is authoritative, keyed on email,
    // with the StuntListing profile fields as the fallback.
    step = "checking membership";
    const existing = await findUserByStuntlistingId(String(profile.id));
    // Admin by the code's allowlist, or made one on Admin → Members.
    const isAdmin = isAdminEmail(userEmail) || existing?.role === "admin";
    const membership = await resolveMembershipTier(
      userEmail,
      profile,
      existing?.tierOverride ?? null
    );
    const membershipTier = membership.tier;
    const isSubscriptionActive = membershipTier !== "free";
    console.log(
      `tier for ${userEmail}: ${membershipTier} (${membership.source}) — ${membership.detail}`
    );

    // 3. Check membership tier — only Plus or admins can access
    if (membershipTier !== "plus" && !isAdmin) {
      return NextResponse.json(
        {
          error: "upgrade_required",
          tier: membershipTier,
          subscriptionActive: isSubscriptionActive,
          message:
            "StuntListing Bookkeeper requires an active Plus membership.",
        },
        { status: 403 }
      );
    }

    // 4. Upsert user in our D1 database (keyed by stuntlisting user id)
    step = "upserting user record";
    const stuntlistingUserId = String(profile.id);

    const user = await upsertUserByStuntlistingId({
      stuntlistingUserId,
      email: userEmail,
      firstName: profile.first_name || "",
      lastName: profile.last_name || "",
      tier: membershipTier,
      role: isAdmin ? "admin" : "user",
      stlAccessToken: access_token,
    });

    // 4b. Best-effort mobile number for the texted-in Exhibit G intake.
    // The StuntListing schema's field name for it isn't pinned down, so
    // candidates are probed one at a time in their own queries — a miss
    // errors only that probe, never the login — and only an EMPTY stored
    // phone is filled: a number typed into Preferences always stands.
    step = "probing for a mobile number";
    if (!user.phone) {
      for (const field of ["phone", "phone_number", "mobile"]) {
        try {
          const probeRes = await fetch("https://api.stuntlisting.com/graphql", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${access_token}`,
            },
            body: JSON.stringify({
              query: `query { getMyProfile { ${field} } }`,
            }),
          });
          const probeData = await probeRes.json();
          const value = probeData?.data?.getMyProfile?.[field];
          if (typeof value === "string" && isPlausiblePhone(value)) {
            await setUserPhone(user._id, phoneDigits(value));
            console.log(`stored mobile from StuntListing field "${field}" for ${userEmail}`);
            break;
          }
          if (!probeData?.errors) break; // field exists but is empty — stop.
        } catch {
          break; // network trouble — not worth more round trips.
        }
      }
    }

    // 5. Create session JWT and set cookie on the response directly
    step = "creating session";
    const sessionPayload: SessionPayload = {
      userId: user._id,
      stuntlistingUserId,
      email: userEmail,
      firstName: profile.first_name || "",
      lastName: profile.last_name || "",
      tier: membershipTier,
      role: isAdmin ? "admin" : "user",
    };

    const token = await createSession(sessionPayload);

    step = "setting session cookie";
    const response = NextResponse.json({
      success: true,
      user: {
        id: user._id,
        stuntlistingUserId,
        email: userEmail,
        firstName: profile.first_name || "",
        lastName: profile.last_name || "",
        tier: membershipTier,
        role: isAdmin ? "admin" : "user",
        tester: isTester({ email: userEmail, tester: existing?.tester ?? 0 }),
      },
    });

    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error(`Login error at step "${step}":`, error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Login failed at: ${step}. Details: ${message}`, build: BUILD_TS },
      { status: 500 }
    );
  }
}
