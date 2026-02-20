import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import {
  createSession,
  setSessionCookie,
  isAdminEmail,
  type SessionPayload,
} from "@/lib/auth";

/**
 * POST /api/auth/login
 * Authenticates via StuntListing GraphQL API.
 * Only allows Plus members (or admins) in.
 * Standard/Free members get a redirect to upgrade.
 */
export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // 1. Authenticate with StuntListing GraphQL API
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
      return NextResponse.json({ error: errorMsg }, { status: 401 });
    }

    const { access_token } = loginData.data.login;

    // 2. Fetch user profile from StuntListing API (using actual STL field names)
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
        { error: "Failed to fetch user profile from StuntListing" },
        { status: 500 }
      );
    }

    const profile = profileData.data.getMyProfile;
    const userEmail = (profile.email || email).toLowerCase().trim();
    const isAdmin = isAdminEmail(userEmail);

    // Determine membership tier from StuntListing subscription fields
    // subscription_type values: "plus", "standard", "free", etc.
    const subscriptionType = (profile.subscription_type || "free").toLowerCase();
    const isSubscriptionActive = profile.is_subscription_active === true;

    // Map to our tier system: active plus → plus, active standard → standard, else free
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
    await dbConnect();

    const stuntlistingUserId = profile.id;

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
        },
      },
      { upsert: true, new: true }
    );

    // 5. Create session JWT and set cookie
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
    await setSessionCookie(token);

    return NextResponse.json({
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
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during login" },
      { status: 500 }
    );
  }
}
