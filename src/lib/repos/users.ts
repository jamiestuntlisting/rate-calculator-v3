import { getDb, newId, nowIso } from "@/lib/db";

export interface UserRecord {
  _id: string;
  stuntlistingUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  tier: "free" | "standard" | "plus";
  role: "user" | "admin";
  lastLogin: string | null;
  stlAccessToken: string | null;
  /** Manually chosen tier; wins over Stripe/StuntListing when set. */
  tierOverride: "free" | "standard" | "plus" | null;
  /** 0/1 — we transcribe this member's Exhibit Gs for them. */
  transcriptionAddOn: number;
  /** How that transcription is paid for: 'monthly', 'per_g', or null. */
  transcriptionBilling: "monthly" | "per_g" | null;
  /** Bare digits of the member's mobile, for texted-in Exhibit Gs. */
  phone: string | null;
  /** Small UI preferences as one JSON object; see UserPrefs. */
  prefs: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The preferences that ride the user row. Every key is optional and
 * absent means the default, so an empty object is a fresh account.
 */
export interface UserPrefs {
  /**
   * The order the transcription page runs its time fields: through the
   * day ("chrono", the default) or as the card's columns run ("card" —
   * call, dismissals, then the meals).
   */
  transcribeTimeOrder?: "chrono" | "card";
}

/** The stored JSON, or {} for NULL, junk, or a non-object. */
export function parseUserPrefs(
  prefs: string | null | undefined
): UserPrefs {
  if (!prefs) return {};
  try {
    const parsed = JSON.parse(prefs);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as UserPrefs)
      : {};
  } catch {
    return {};
  }
}

/** Merge a patch into the stored preferences and return the result. */
export async function mergeUserPrefs(
  userId: string,
  patch: UserPrefs
): Promise<UserPrefs> {
  const db = await getDb();
  const row = await db
    .prepare("SELECT prefs FROM users WHERE _id = ?1")
    .bind(userId)
    .first<{ prefs: string | null }>();
  const next = { ...parseUserPrefs(row?.prefs), ...patch };
  await db
    .prepare("UPDATE users SET prefs = ?1, updatedAt = ?2 WHERE _id = ?3")
    .bind(JSON.stringify(next), nowIso(), userId)
    .run();
  return next;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const db = await getDb();
  return db
    .prepare("SELECT * FROM users WHERE _id = ?1")
    .bind(id)
    .first<UserRecord>();
}

export async function findUserByStuntlistingId(
  stuntlistingUserId: string
): Promise<UserRecord | null> {
  const db = await getDb();
  return db
    .prepare("SELECT * FROM users WHERE stuntlistingUserId = ?1")
    .bind(stuntlistingUserId)
    .first<UserRecord>();
}

export interface UpsertUserInput {
  stuntlistingUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  tier: "free" | "standard" | "plus";
  role: "user" | "admin";
  stlAccessToken: string | null;
}

/**
 * Insert-or-update a user keyed by StuntListing user id, refreshing
 * profile fields and lastLogin. Mirrors the old
 * `User.findOneAndUpdate({stuntlistingUserId}, {$set}, {upsert, new})`.
 */
export async function upsertUserByStuntlistingId(
  input: UpsertUserInput
): Promise<UserRecord> {
  const db = await getDb();
  const now = nowIso();
  const row = await db
    .prepare(
      `INSERT INTO users
        (_id, stuntlistingUserId, email, firstName, lastName, tier, role, lastLogin, stlAccessToken, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
       ON CONFLICT(stuntlistingUserId) DO UPDATE SET
         email = excluded.email,
         firstName = excluded.firstName,
         lastName = excluded.lastName,
         tier = excluded.tier,
         role = excluded.role,
         lastLogin = excluded.lastLogin,
         stlAccessToken = excluded.stlAccessToken,
         updatedAt = excluded.updatedAt
       RETURNING *`
    )
    .bind(
      newId(),
      input.stuntlistingUserId,
      input.email,
      input.firstName,
      input.lastName,
      input.tier,
      input.role,
      now,
      input.stlAccessToken,
      now
    )
    .first<UserRecord>();

  if (!row) throw new Error("Failed to upsert user");
  return row;
}

/**
 * Find a user by StuntListing id, creating it with the given defaults when
 * missing (old `$setOnInsert` upsert semantics — existing rows unchanged).
 */
export async function findOrCreateUserByStuntlistingId(
  stuntlistingUserId: string,
  defaults: Omit<UpsertUserInput, "stuntlistingUserId" | "stlAccessToken">
): Promise<UserRecord> {
  const db = await getDb();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO users
        (_id, stuntlistingUserId, email, firstName, lastName, tier, role, lastLogin, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?8)
       ON CONFLICT(stuntlistingUserId) DO NOTHING`
    )
    .bind(
      newId(),
      stuntlistingUserId,
      defaults.email,
      defaults.firstName,
      defaults.lastName,
      defaults.tier,
      defaults.role,
      now
    )
    .run();

  const row = await db
    .prepare("SELECT * FROM users WHERE stuntlistingUserId = ?1")
    .bind(stuntlistingUserId)
    .first<UserRecord>();
  if (!row) throw new Error("Failed to find or create user");
  return row;
}

/** Set the member's plan. No payment is taken — see docs on PLAN_PRICES. */
export async function updateMembership(
  userId: string,
  tierOverride: "free" | "standard" | "plus" | null,
  transcriptionBilling: "monthly" | "per_g" | null
): Promise<UserRecord | null> {
  const db = await getDb();
  return db
    .prepare(
      `UPDATE users
         SET tierOverride = ?1,
             transcriptionBilling = ?2,
             transcriptionAddOn = ?3,
             tier = COALESCE(?1, tier),
             updatedAt = ?4
       WHERE _id = ?5
       RETURNING *`
    )
    .bind(
      tierOverride,
      transcriptionBilling,
      transcriptionBilling ? 1 : 0,
      nowIso(),
      userId
    )
    .first<UserRecord>();
}

/**
 * The member a texted-in Exhibit G belongs to. Matching compares the
 * last ten digits — the national number — so "+1 929..." and "929..."
 * are the same person. Returns null on no match or an ambiguous one:
 * a wrong guess files someone's paperwork into a stranger's account.
 */
export async function findUserByPhoneKey(
  key: string
): Promise<UserRecord | null> {
  if (key.length < 10) return null;
  const db = await getDb();
  const { results } = await db
    .prepare(
      `SELECT * FROM users
       WHERE phone IS NOT NULL AND substr(phone, -10) = ?1`
    )
    .bind(key)
    .all<UserRecord>();
  return results.length === 1 ? results[0] : null;
}

/** Store (or clear) the member's mobile, already reduced to digits. */
export async function setUserPhone(
  userId: string,
  digits: string | null
): Promise<UserRecord | null> {
  const db = await getDb();
  return db
    .prepare(
      "UPDATE users SET phone = ?1, updatedAt = ?2 WHERE _id = ?3 RETURNING *"
    )
    .bind(digits, nowIso(), userId)
    .first<UserRecord>();
}

export async function listUsers(): Promise<UserRecord[]> {
  const db = await getDb();
  const { results } = await db
    .prepare("SELECT * FROM users ORDER BY lastLogin DESC")
    .all<UserRecord>();
  return results;
}
