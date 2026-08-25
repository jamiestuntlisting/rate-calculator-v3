import { getDb } from "@/lib/db";

// Public in this repo — only ever used outside production.
const DEV_FALLBACK = "stuntlisting-bookkeeper-dev-secret-change-in-production";

let cachedDbSecret: Uint8Array | null = null;

/**
 * Resolve the JWT signing secret for session cookies.
 *
 * Order: the SESSION_SECRET environment secret (if set on the Worker) wins;
 * otherwise the `app_config` row in D1 (key 'SESSION_SECRET'), cached per
 * isolate; otherwise a dev-only fallback outside production.
 *
 * The D1 fallback exists so the app can be fully provisioned without
 * dashboard access — the database is part of the deployment we control.
 */
export async function getSessionSecretKey(): Promise<Uint8Array> {
  const envSecret = process.env.SESSION_SECRET;
  if (envSecret) {
    return new TextEncoder().encode(envSecret);
  }

  if (cachedDbSecret) return cachedDbSecret;

  try {
    const db = await getDb();
    const row = await db
      .prepare("SELECT value FROM app_config WHERE key = 'SESSION_SECRET'")
      .first<{ value: string }>();
    if (row?.value) {
      cachedDbSecret = new TextEncoder().encode(row.value);
      return cachedDbSecret;
    }
  } catch {
    // app_config missing or D1 unreachable — fall through
  }

  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode(DEV_FALLBACK);
  }

  throw new Error(
    "No session secret configured. Set the SESSION_SECRET secret on the Worker, or add an app_config row with key 'SESSION_SECRET' in the D1 database."
  );
}
