import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
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
    const isAdmin = isAdminEmail(userEmail);

    // Determine membership tier from StuntListing subscription fields
    const subscriptionType = (profile.subscription_type || "free").toLowerCase();
    const isSubscriptionActive = profile.is_subscription_active === true;

    let membershipTier: "free" | "standard" | "plus" = "free";
    if (isSubscriptionActive) {
      if (subscriptionType.includes("plus")) {
        membershipTier = "plus";
      } else if (subscriptionType.includes("standard")) {
        membershipTier = "standard";
      }
    }

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

    // 4. Upsert user in our MongoDB (keyed by stuntlisting user id)
    step = "connecting to database";
    await dbConnect();

    step = "upserting user record";
    const stuntlistingUserId = String(profile.id);

    const user = await User.findOneAndUpdate(
      { stuntlistingUserId },
      {
        $set: {
          email: userEmail,
          firstName: profile.first_name || "",
          lastName: profile.last_name || "",
          tier: membershipTier,
          role: isAdmin ? "admin" : "user",
          lastLogin: new Date(),
          stlAccessToken: access_token,
        },
      },
      { upsert: true, new: true }
    );

    // 5. Create session JWT and set cookie on the response directly
    step = "creating session";
    const sessionPayload: SessionPayload = {
      userId: user._id.toString(),
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
        id: user._id.toString(),
        stuntlistingUserId,
        email: userEmail,
        firstName: profile.first_name || "",
        lastName: profile.last_name || "",
        tier: membershipTier,
        role: isAdmin ? "admin" : "user",
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
