import { getTierFromStripe } from "@/lib/stripe";
import type { Tier } from "@/lib/tier";

export interface StuntListingProfileFields {
  is_subscription_active?: boolean | null;
  subscription_type?: string | null;
}

export interface MembershipResult {
  tier: Tier;
  source: "stripe" | "stuntlisting";
  detail: string;
}

/** Tier as reported by the StuntListing GraphQL profile. */
export function tierFromProfile(profile: StuntListingProfileFields): Tier {
  if (profile.is_subscription_active !== true) return "free";
  const type = (profile.subscription_type || "").toLowerCase();
  if (type.includes("plus")) return "plus";
  if (type.includes("standard")) return "standard";
  return "free";
}

/**
 * Determine a member's tier, preferring Stripe (where the subscription
 * actually lives) and keyed on their email address.
 *
 * Stripe only wins when it can find a customer for the address — if the
 * member pays under a different email, or Stripe is unconfigured or
 * unreachable, the StuntListing profile fields decide instead. That keeps a
 * Stripe lookup miss from locking a paying member out.
 */
export async function resolveMembershipTier(
  email: string,
  profile: StuntListingProfileFields
): Promise<MembershipResult> {
  const profileTier = tierFromProfile(profile);

  const stripe = await getTierFromStripe(email);
  if (stripe && stripe.customerId) {
    return {
      tier: stripe.tier,
      source: "stripe",
      detail: `customer ${stripe.customerId}${
        stripe.subscriptionId ? ` sub ${stripe.subscriptionId}` : ""
      }${stripe.status ? ` (${stripe.status})` : ""} — ${stripe.matchedOn ?? ""}`,
    };
  }

  return {
    tier: profileTier,
    source: "stuntlisting",
    detail: stripe
      ? "no Stripe customer for this email; used StuntListing profile"
      : "Stripe not configured or unavailable; used StuntListing profile",
  };
}
