import { getDb } from "@/lib/db";
import type { Tier } from "@/lib/tier";

/**
 * Membership lookup against Stripe, keyed on email address.
 *
 * StuntListing's GraphQL profile carries `is_subscription_active` /
 * `subscription_type`, but Stripe is where the subscription actually lives,
 * so it is the authoritative source. Email is the join key between the two.
 *
 * Configuration (env var, else an `app_config` row with the same key):
 *   STRIPE_SECRET_KEY        required to enable Stripe checks
 *   STRIPE_PLUS_IDS          optional CSV of price/product ids that mean Plus
 *   STRIPE_STANDARD_IDS      optional CSV of price/product ids that mean Standard
 *
 * With no id lists configured, the tier is inferred from the price nickname
 * or product name (matching "plus" / "standard", case-insensitive).
 */

const STRIPE_API = "https://api.stripe.com/v1";

// Subscription states that still entitle a member. `past_due` is included
// deliberately: Stripe keeps retrying payment, and locking someone out
// mid-dunning would be worse than a few days of grace.
const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

export interface StripeTierResult {
  tier: Tier;
  customerId: string | null;
  subscriptionId: string | null;
  status: string | null;
  /** What the decision was based on, for logging/diagnostics. */
  matchedOn: string | null;
}

const configCache = new Map<string, string | null>();

async function getConfig(key: string): Promise<string | null> {
  const fromEnv = (process.env as Record<string, string | undefined>)[key];
  if (fromEnv) return fromEnv;

  if (configCache.has(key)) return configCache.get(key) ?? null;

  let value: string | null = null;
  try {
    const db = await getDb();
    const row = await db
      .prepare("SELECT value FROM app_config WHERE key = ?1")
      .bind(key)
      .first<{ value: string }>();
    value = row?.value ?? null;
  } catch {
    value = null;
  }
  configCache.set(key, value);
  return value;
}

export async function isStripeConfigured(): Promise<boolean> {
  return Boolean(await getConfig("STRIPE_SECRET_KEY"));
}

async function stripeGet<T>(
  path: string,
  params: Record<string, string>,
  key: string
): Promise<T> {
  const url = new URL(`${STRIPE_API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Stripe ${path} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

interface StripeList<T> {
  data: T[];
}

interface StripeCustomer {
  id: string;
  email: string | null;
}

interface StripeSubscription {
  id: string;
  status: string;
  items: {
    data: Array<{
      price: {
        id: string;
        nickname: string | null;
        product: string;
      };
    }>;
  };
}

const productNameCache = new Map<string, string>();

async function getProductName(productId: string, key: string): Promise<string> {
  const cached = productNameCache.get(productId);
  if (cached !== undefined) return cached;

  try {
    const product = await stripeGet<{ name?: string }>(
      `/products/${productId}`,
      {},
      key
    );
    const name = product.name ?? "";
    productNameCache.set(productId, name);
    return name;
  } catch {
    productNameCache.set(productId, "");
    return "";
  }
}

function parseIdList(csv: string | null): Set<string> {
  if (!csv) return new Set();
  return new Set(
    csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

const TIER_RANK: Record<Tier, number> = { free: 0, standard: 1, plus: 2 };

/**
 * Resolve a member's tier from Stripe by email address.
 * Returns null when Stripe is not configured or the call fails, so callers
 * can fall back to the StuntListing profile fields.
 */
export async function getTierFromStripe(
  email: string
): Promise<StripeTierResult | null> {
  const key = await getConfig("STRIPE_SECRET_KEY");
  if (!key) return null;

  const plusIds = parseIdList(await getConfig("STRIPE_PLUS_IDS"));
  const standardIds = parseIdList(await getConfig("STRIPE_STANDARD_IDS"));

  try {
    // Stripe matches this exactly (case-insensitive); duplicates are possible,
    // so every customer sharing the address is considered.
    const customers = await stripeGet<StripeList<StripeCustomer>>(
      "/customers",
      { email: email.toLowerCase().trim(), limit: "10" },
      key
    );

    if (customers.data.length === 0) {
      return {
        tier: "free",
        customerId: null,
        subscriptionId: null,
        status: null,
        matchedOn: "no stripe customer for email",
      };
    }

    let best: StripeTierResult = {
      tier: "free",
      customerId: customers.data[0].id,
      subscriptionId: null,
      status: null,
      matchedOn: "no entitled subscription",
    };

    for (const customer of customers.data) {
      const subs = await stripeGet<StripeList<StripeSubscription>>(
        "/subscriptions",
        { customer: customer.id, status: "all", limit: "100" },
        key
      );

      for (const sub of subs.data) {
        if (!ENTITLED_STATUSES.has(sub.status)) continue;

        for (const item of sub.items.data) {
          const price = item.price;
          let tier: Tier | null = null;
          let matchedOn: string | null = null;

          if (plusIds.has(price.id) || plusIds.has(price.product)) {
            tier = "plus";
            matchedOn = `configured plus id (${price.id})`;
          } else if (standardIds.has(price.id) || standardIds.has(price.product)) {
            tier = "standard";
            matchedOn = `configured standard id (${price.id})`;
          } else {
            const label = (
              price.nickname || (await getProductName(price.product, key))
            ).toLowerCase();
            if (label.includes("plus")) {
              tier = "plus";
              matchedOn = `name match "${label}"`;
            } else if (label.includes("standard")) {
              tier = "standard";
              matchedOn = `name match "${label}"`;
            } else if (label) {
              // An entitled subscription we can't classify still means the
              // member is paying for something.
              tier = "standard";
              matchedOn = `unclassified paid plan "${label}"`;
            }
          }

          if (tier && TIER_RANK[tier] > TIER_RANK[best.tier]) {
            best = {
              tier,
              customerId: customer.id,
              subscriptionId: sub.id,
              status: sub.status,
              matchedOn,
            };
          }
        }
      }
    }

    return best;
  } catch (error) {
    console.error("Stripe tier lookup failed:", error);
    return null;
  }
}
