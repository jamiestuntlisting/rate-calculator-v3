import { getDb, getEnv } from "@/lib/db";

/**
 * Plaid, view only. Three calls: make a Link token so the page can open
 * Plaid Link, swap the public token Link hands back for an access
 * token, and pull transactions with the sync cursor. Plain fetch —
 * Plaid's REST API is small and the Worker has no Node runtime for
 * its SDK. Keys live where the other secrets do: PLAID_CLIENT_ID,
 * PLAID_SECRET and PLAID_ENV (sandbox | development | production) on
 * the Worker, or app_config rows of those names.
 */

export interface PlaidConfig {
  clientId: string;
  secret: string;
  env: "sandbox" | "development" | "production";
}

const HOSTS: Record<PlaidConfig["env"], string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

export async function plaidConfig(): Promise<PlaidConfig | null> {
  const env = (await getEnv()) as unknown as Record<string, string | undefined>;
  const db = await getDb();
  const read = async (key: string) => {
    if (env[key]) return env[key]!;
    const row = await db
      .prepare("SELECT value FROM app_config WHERE key = ?1")
      .bind(key)
      .first<{ value: string }>();
    return row?.value?.trim() || "";
  };
  const clientId = await read("PLAID_CLIENT_ID");
  const secret = await read("PLAID_SECRET");
  const envName = ((await read("PLAID_ENV")) || "sandbox") as PlaidConfig["env"];
  if (!clientId || !secret) return null;
  return { clientId, secret, env: envName in HOSTS ? envName : "sandbox" };
}

export class PlaidError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function call<T>(config: PlaidConfig, path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${HOSTS[config.env]}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: config.clientId, secret: config.secret, ...body }),
  });
  const data = (await res.json()) as T & { error_code?: string; error_message?: string };
  if (!res.ok) {
    throw new PlaidError(
      data.error_message || `Plaid ${path} failed`,
      data.error_code || "unknown",
      res.status
    );
  }
  return data;
}

/** A Link token: transactions only, view only, for this member. */
export async function createLinkToken(config: PlaidConfig, userId: string): Promise<string> {
  const data = await call<{ link_token: string }>(config, "/link/token/create", {
    user: { client_user_id: userId },
    client_name: "StuntListing Bookkeeper",
    products: ["transactions"],
    country_codes: ["US"],
    language: "en",
    transactions: { days_requested: 730 },
  });
  return data.link_token;
}

export async function exchangePublicToken(
  config: PlaidConfig,
  publicToken: string
): Promise<{ accessToken: string; itemId: string }> {
  const data = await call<{ access_token: string; item_id: string }>(
    config,
    "/item/public_token/exchange",
    { public_token: publicToken }
  );
  return { accessToken: data.access_token, itemId: data.item_id };
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  /** Plaid's sign: positive is money OUT, negative is money IN. */
  amount: number;
  date: string;
  name: string;
  merchant_name?: string | null;
  pending: boolean;
}

/** Every transaction since the cursor, following `has_more`. */
export async function syncTransactions(
  config: PlaidConfig,
  accessToken: string,
  cursor: string | null
): Promise<{ added: PlaidTransaction[]; removed: string[]; cursor: string }> {
  const added: PlaidTransaction[] = [];
  const removed: string[] = [];
  let next = cursor ?? "";
  for (let i = 0; i < 50; i++) {
    const data = await call<{
      added: PlaidTransaction[];
      modified: PlaidTransaction[];
      removed: Array<{ transaction_id: string }>;
      next_cursor: string;
      has_more: boolean;
    }>(config, "/transactions/sync", {
      access_token: accessToken,
      cursor: next || undefined,
      count: 500,
    });
    added.push(...data.added, ...data.modified);
    removed.push(...data.removed.map((r) => r.transaction_id));
    next = data.next_cursor;
    if (!data.has_more) break;
  }
  return { added, removed, cursor: next };
}

export async function removeItem(config: PlaidConfig, accessToken: string): Promise<void> {
  await call(config, "/item/remove", { access_token: accessToken });
}
