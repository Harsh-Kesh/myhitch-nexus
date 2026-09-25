// Server-only. Parental-control PIN hashing and verification for account_profiles
// (Family Tier). Found live and unhashed: the PIN was stored in plaintext, returned in
// full to the browser on every GET, and "verified" by a client-side string comparison
// against that same plaintext value — meaning anyone with devtools (or just the raw API
// response) could read and bypass it instantly, no brute force needed. Fixed to the same
// real, server-only hash-and-compare shape localPassword.ts already uses for account
// passwords, plus rate limiting on verification attempts (a PIN's keyspace is tiny —
// 4-6 digits — so brute force is a real risk once the plaintext-leak hole is closed).
import "server-only";
import { hashPassword, matchesHash } from "./localPassword";
import { getRedis } from "./redis";
import { queryOne } from "./db";

export async function hashPin(pin: string): Promise<string> {
  return hashPassword(pin);
}

const memoryAttempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_ATTEMPTS = 6;
const BLOCK_SECONDS = 5 * 60;

function attemptsKey(profileId: string): string {
  return `profile-pin-attempts:${profileId}`;
}
function blockKey(profileId: string): string {
  return `profile-pin-block:${profileId}`;
}

async function isRateLimited(profileId: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      return (await redis.exists(blockKey(profileId))) === 1;
    } catch (err) {
      console.error("[profilePin] Redis isRateLimited failed, failing open", err);
      return false;
    }
  }
  const entry = memoryAttempts.get(profileId);
  return Boolean(entry && entry.blockedUntil > Date.now());
}

async function recordFailure(profileId: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const count = await redis.incr(attemptsKey(profileId));
      if (count === 1) await redis.expire(attemptsKey(profileId), BLOCK_SECONDS);
      if (count >= MAX_ATTEMPTS) {
        await redis.set(blockKey(profileId), "1", "EX", BLOCK_SECONDS);
        await redis.del(attemptsKey(profileId));
      }
    } catch (err) {
      console.error("[profilePin] Redis recordFailure failed, attempt not counted", err);
    }
    return;
  }
  const entry = memoryAttempts.get(profileId) ?? { count: 0, blockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = Date.now() + BLOCK_SECONDS * 1000;
    entry.count = 0;
  }
  memoryAttempts.set(profileId, entry);
}

async function clearFailures(profileId: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(attemptsKey(profileId), blockKey(profileId));
    } catch (err) {
      console.error("[profilePin] Redis clearFailures failed", err);
    }
    return;
  }
  memoryAttempts.delete(profileId);
}

export type VerifyProfilePinResult =
  | { outcome: "correct" }
  | { outcome: "incorrect" }
  | { outcome: "rate_limited" }
  | { outcome: "no_pin_set" }
  | { outcome: "not_found" };

/** The real, server-side PIN check — ownership-scoped (a profile's PIN can only ever be
 * checked by the account that owns it), rate-limited, and the hash never leaves this
 * function. */
export async function verifyProfilePin(
  accountId: string,
  profileId: string,
  pin: string,
): Promise<VerifyProfilePinResult> {
  const row = await queryOne<{ pin_code: string | null }>(
    `select pin_code from account_profiles where id = $1 and account_id = $2`,
    [profileId, accountId],
  );
  if (!row) return { outcome: "not_found" };
  if (!row.pin_code) return { outcome: "no_pin_set" };

  if (await isRateLimited(profileId)) {
    return { outcome: "rate_limited" };
  }

  const correct = await matchesHash(pin, row.pin_code);
  if (!correct) {
    await recordFailure(profileId);
    return { outcome: "incorrect" };
  }
  await clearFailures(profileId);
  return { outcome: "correct" };
}
