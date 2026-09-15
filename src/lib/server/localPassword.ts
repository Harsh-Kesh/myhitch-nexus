// Server-only. THE swappable seam referenced throughout this feature: everything else
// (session issuance, RBAC, the register/login/logout/me routes) is real, permanent
// infrastructure that stays exactly as-is once Auth0 access lands. This one file is not
// — it exists only because there is no Auth0 tenant to call yet
// (docs/DEVELOPMENT-PLAN.md §9, blocker #2). The day that lands, delete this file and
// point src/app/api/auth/login/route.ts and register/route.ts at
// verifyAuth0Password()/createAuth0User() in auth0Sync.ts instead — same
// { outcome: "success" | "invalid_credentials" | "rate_limited" } shape on purpose, so
// the swap in the route is a one-line change, not a rewrite.
//
// Hashing uses Node's built-in scrypt (via node:crypto) rather than adding a bcrypt/
// argon2 dependency — scrypt is an OWASP-acceptable KDF and this avoids a native-module
// dependency for code with an intentionally short lifespan.
import "server-only";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { query, queryOne } from "./db";
import { getRedis } from "./redis";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

async function matchesHash(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Redis-backed when REDIS_URL is configured (Railway, in every deployed environment) so
// the lockout survives a restart and would hold correctly across multiple instances if
// this ever scales past one — falls back to the original in-memory Map for local dev
// without Redis, which is still exactly correct for a single local process. A Redis
// error mid-request (not just "no REDIS_URL") fails *open* — rate limiting is
// defense-in-depth on top of the real check (the password itself), not the auth
// boundary itself, so an infrastructure hiccup should not lock every user out of login.
const attemptsByEmail = new Map<string, { count: number; blockedUntil: number }>();
const MAX_ATTEMPTS = 8;
const BLOCK_SECONDS = 5 * 60;

function attemptsKey(email: string): string {
  return `login-attempts:${email}`;
}
function blockKey(email: string): string {
  return `login-block:${email}`;
}

async function isRateLimited(email: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      return (await redis.exists(blockKey(email))) === 1;
    } catch (err) {
      console.error("[localPassword] Redis isRateLimited failed, failing open", err);
      return false;
    }
  }
  const entry = attemptsByEmail.get(email);
  return Boolean(entry && entry.blockedUntil > Date.now());
}

async function recordFailure(email: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const count = await redis.incr(attemptsKey(email));
      if (count === 1) await redis.expire(attemptsKey(email), BLOCK_SECONDS);
      if (count >= MAX_ATTEMPTS) {
        await redis.set(blockKey(email), "1", "EX", BLOCK_SECONDS);
        await redis.del(attemptsKey(email));
      }
    } catch (err) {
      console.error("[localPassword] Redis recordFailure failed, attempt not counted", err);
    }
    return;
  }
  const entry = attemptsByEmail.get(email) ?? { count: 0, blockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = Date.now() + BLOCK_SECONDS * 1000;
    entry.count = 0;
  }
  attemptsByEmail.set(email, entry);
}

async function clearFailures(email: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(attemptsKey(email), blockKey(email));
    } catch (err) {
      console.error("[localPassword] Redis clearFailures failed", err);
    }
    return;
  }
  attemptsByEmail.delete(email);
}

export type VerifyLocalPasswordResult =
  | { outcome: "success"; accountId: string }
  | { outcome: "invalid_credentials" }
  | { outcome: "rate_limited" };

/** Same three-outcome shape as auth0Sync.ts's verifyAuth0Password (minus MFA, which is
 * an Auth0-only concept until that lands) — see this file's header for why that match
 * matters. */
export async function verifyLocalPassword(
  email: string,
  password: string,
): Promise<VerifyLocalPasswordResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (await isRateLimited(normalizedEmail)) {
    return { outcome: "rate_limited" };
  }

  const account = await queryOne<{ id: string; password_hash: string | null }>(
    `select id, password_hash from accounts where lower(email) = $1`,
    [normalizedEmail],
  );

  // No account, or an account with no local password (e.g. social-only, once that
  // exists) — same "invalid_credentials" outcome either way, so a login attempt can't
  // be used to enumerate which emails have registered.
  if (!account || !account.password_hash) {
    await recordFailure(normalizedEmail);
    return { outcome: "invalid_credentials" };
  }

  const ok = await matchesHash(password, account.password_hash);
  if (!ok) {
    await recordFailure(normalizedEmail);
    return { outcome: "invalid_credentials" };
  }

  await clearFailures(normalizedEmail);
  return { outcome: "success", accountId: account.id };
}

export async function emailIsRegistered(email: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from accounts where lower(email) = $1`,
    [email.trim().toLowerCase()],
  );
  return Boolean(row);
}

export async function createLocalAccount(input: {
  email: string;
  password: string;
  fullName: string;
  country: string | null;
}): Promise<{ id: string }> {
  const passwordHash = await hashPassword(input.password);
  const rows = await query<{ id: string }>(
    `insert into accounts (email, full_name, password_hash, country)
     values ($1, $2, $3, $4)
     returning id`,
    [input.email.trim().toLowerCase(), input.fullName, passwordHash, input.country],
  );
  return rows[0];
}
