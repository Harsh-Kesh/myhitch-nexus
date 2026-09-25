// Server-only. Family Profiles & Parental Controls (Family Tier: "Up to 5 family profiles & parental controls")
import "server-only";
import { query, queryOne } from "./db";
import { checkRealPlanActive } from "./subscriptions";
import { hashPin } from "./profilePin";

export interface AccountProfile {
  id: string;
  accountId: string;
  name: string;
  avatarUrl: string | null;
  isKids: boolean;
  maturityRating: "ALL" | "PG" | "TEEN" | "18+";
  /** Never the actual PIN or its hash — see profilePin.ts's verifyProfilePin() for the
   * only real way to check a PIN. Exposing the hash to the client would let it be
   * cracked offline; exposing the old plaintext value was worse still (this used to be
   * returned in full and checked client-side — real critical finding, fixed 2026-09-24). */
  hasPinSet: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileOverview {
  profiles: AccountProfile[];
  totalProfiles: number;
  maxProfiles: number;
}

/** Same ownership bar as commerce.ts's isBlockedByProfileAgeRating() — a client can never
 * scope a query to a profile it doesn't own by just supplying its id. Returns the id back
 * unchanged when it checks out, or null (ignore rather than trust) otherwise — callers
 * that key a query on the result get "no profile" instead of silently trusting a stranger's
 * profile id, the same "ignore, don't error" stance the age-gate check already takes. */
export async function verifyOwnProfileId(accountId: string, profileId: string | null | undefined): Promise<string | null> {
  if (!profileId) return null;
  const row = await queryOne<{ id: string }>(
    `select id from account_profiles where id = $1 and account_id = $2`,
    [profileId, accountId],
  );
  return row ? row.id : null;
}

export async function listAccountProfiles(accountId: string): Promise<ProfileOverview> {
  const rows = await query<{
    id: string;
    account_id: string;
    name: string;
    avatar_url: string | null;
    is_kids: boolean;
    maturity_rating: "ALL" | "PG" | "TEEN" | "18+";
    pin_code: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `select id, account_id, name, avatar_url, is_kids, maturity_rating, pin_code, created_at, updated_at
     from account_profiles
     where account_id = $1
     order by created_at asc`,
    [accountId],
  );

  const profiles: AccountProfile[] = rows.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    name: r.name,
    avatarUrl: r.avatar_url,
    isKids: r.is_kids,
    maturityRating: r.maturity_rating,
    hasPinSet: r.pin_code !== null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return {
    profiles,
    totalProfiles: profiles.length,
    maxProfiles: 5,
  };
}

export async function createAccountProfile(
  accountId: string,
  input: {
    name: string;
    avatarUrl?: string;
    isKids?: boolean;
    maturityRating?: "ALL" | "PG" | "TEEN" | "18+";
    pinCode?: string;
  },
): Promise<AccountProfile> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Profile name is required");
  }

  // Check 5 profile limit and Family Plan subscription requirement
  const countRow = await queryOne<{ count: string }>(
    `select count(*)::text as count from account_profiles where account_id = $1`,
    [accountId],
  );

  const currentCount = parseInt(countRow?.count ?? "0", 10);
  if (currentCount >= 1) {
    const isFamilyPlan = await checkRealPlanActive(accountId, "family");
    if (!isFamilyPlan) {
      throw new Error(
        "Adding additional household profiles requires an active Nexus Family Plan (£14.99/mo). Please upgrade your subscription.",
      );
    }
  }
  if (currentCount >= 5) {
    throw new Error("Family plan includes up to 5 profiles. Please remove an existing profile to add a new one.");
  }

  const isKids = Boolean(input.isKids);
  const maturity = input.maturityRating ?? (isKids ? "ALL" : "18+");
  const pinHash = input.pinCode?.trim() ? await hashPin(input.pinCode.trim()) : null;

  const row = await queryOne<{
    id: string;
    account_id: string;
    name: string;
    avatar_url: string | null;
    is_kids: boolean;
    maturity_rating: "ALL" | "PG" | "TEEN" | "18+";
    pin_code: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `insert into account_profiles (
      account_id, name, avatar_url, is_kids, maturity_rating, pin_code
    ) values ($1, $2, $3, $4, $5, $6)
    returning id, account_id, name, avatar_url, is_kids, maturity_rating, pin_code, created_at, updated_at`,
    [accountId, name, input.avatarUrl ?? null, isKids, maturity, pinHash],
  );

  if (!row) throw new Error("Failed to create profile");

  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    avatarUrl: row.avatar_url,
    isKids: row.is_kids,
    maturityRating: row.maturity_rating,
    hasPinSet: row.pin_code !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateAccountProfile(
  accountId: string,
  profileId: string,
  input: {
    name?: string;
    avatarUrl?: string;
    isKids?: boolean;
    maturityRating?: "ALL" | "PG" | "TEEN" | "18+";
    pinCode?: string | null;
  },
): Promise<AccountProfile> {
  const updates: string[] = ["updated_at = now()"];
  const params: unknown[] = [profileId, accountId];
  let paramIdx = 3;

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Profile name cannot be empty");
    updates.push(`name = $${paramIdx++}`);
    params.push(name);
  }

  if (input.avatarUrl !== undefined) {
    updates.push(`avatar_url = $${paramIdx++}`);
    params.push(input.avatarUrl || null);
  }

  if (input.isKids !== undefined) {
    updates.push(`is_kids = $${paramIdx++}`);
    params.push(Boolean(input.isKids));
  }

  if (input.maturityRating !== undefined) {
    updates.push(`maturity_rating = $${paramIdx++}`);
    params.push(input.maturityRating);
  }

  if (input.pinCode !== undefined) {
    const pinHash = input.pinCode?.trim() ? await hashPin(input.pinCode.trim()) : null;
    updates.push(`pin_code = $${paramIdx++}`);
    params.push(pinHash);
  }

  const row = await queryOne<{
    id: string;
    account_id: string;
    name: string;
    avatar_url: string | null;
    is_kids: boolean;
    maturity_rating: "ALL" | "PG" | "TEEN" | "18+";
    pin_code: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `update account_profiles
     set ${updates.join(", ")}
     where id = $1 and account_id = $2
     returning id, account_id, name, avatar_url, is_kids, maturity_rating, pin_code, created_at, updated_at`,
    params,
  );

  if (!row) throw new Error("Profile not found or access denied");

  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    avatarUrl: row.avatar_url,
    isKids: row.is_kids,
    maturityRating: row.maturity_rating,
    hasPinSet: row.pin_code !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteAccountProfile(
  accountId: string,
  profileId: string,
): Promise<boolean> {
  // Ensure we don't delete if it's the only profile
  const countRow = await queryOne<{ count: string }>(
    `select count(*)::text as count from account_profiles where account_id = $1`,
    [accountId],
  );

  const currentCount = parseInt(countRow?.count ?? "0", 10);
  if (currentCount <= 1) {
    throw new Error("You must keep at least one profile.");
  }

  const result = await query(
    `delete from account_profiles where id = $1 and account_id = $2`,
    [profileId, accountId],
  );

  return result.length > 0;
}
