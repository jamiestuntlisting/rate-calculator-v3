import { NextResponse } from "next/server";
import { getSession, isAdminEmail, createSession, setSessionCookie } from "@/lib/auth";

/**
 * GET /api/auth/me
 * Returns the current session user, or 401 if not authenticated.
 * Also re-verifies the user's Plus membership with StuntListing on every call.
 * If the user is no longer Plus (and not an admin), returns 403 upgrade_required.
 */
export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const isAdmin = isAdminEmail(session.email);

  // Re-verify subscription status with StuntListing API
  if (session.stlAccessToken) {
    try {
      const profileRes = await fetch("https://api.stuntlisting.com/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.stlAccessToken}`,
        },
        body: JSON.stringify({
          operationName: "getMyProfile",
          variables: {},
          query: `query getMyProfile {
            getMyProfile {
              id
              is_subscription_active
              subscription_type
            }
          }`,
        }),
      });

      const profileData = await profileRes.json();
      const profile = profileData.data?.getMyProfile;

      if (profile) {
        const subscriptionType = (profile.subscription_type || "free").toLowerCase();
        const isSubscriptionActive = profile.is_subscription_active === true;

        let currentTier: "free" | "standard" | "plus" = "free";
        if (isSubscriptionActive) {
          if (subscriptionType.includes("plus")) {
            currentTier = "plus";
          } else if (subscriptionType.includes("standard")) {
            currentTier = "standard";
          }
        }

        // If tier changed, update the session
        if (currentTier !== session.tier) {
          session.tier = currentTier;
          // Re-sign the session cookie with the updated tier
          const token = await createSession(session);
          await setSessionCookie(token);
        }

        // If user is no longer Plus and not an admin, block access
        if (currentTier !== "plus" && !isAdmin) {
          return NextResponse.json(
            {
              error: "upgrade_required",
              tier: currentTier,
              message: "Your Plus membership is no longer active.",
            },
            { status: 403 }
          );
        }
      }
    } catch {
      // If STL API is unreachable, fall back to stored tier
      // Don't block access — just use what we have
    }
  }

  return NextResponse.json({
    user: {
      id: session.userId,
      stuntlistingUserId: session.stuntlistingUserId,
      email: session.email,
      firstName: session.firstName,
      lastName: session.lastName,
      tier: session.tier,
      role: session.role,
    },
  });
}
