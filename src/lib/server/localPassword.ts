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

// In-memory only — acceptable for a single-instance deployment (matches this app's
// current reality) and for a feature with a planned removal date, but won't survive a
// restart or scale past one instance. Move to Redis alongside the rest of the queues/
// rate-limits work (docs/DEVELOPMENT-PLAN.md's Redis line item) if this is still in use
// when that's provisioned.
const attemptsByEmail = new Map<string, { count: number; blockedUntil: number }>();
const MAX_ATTEMPTS = 8;
const BLOCK_MS = 5 * 60 * 1000;

function isRateLimited(email: string): boolean {
  const entry = attemptsByEmail.get(email);
  return Boolean(entry && entry.blockedUntil > Date.now());
}

function recordFailure(email: string): void {
  const entry = attemptsByEmail.get(email) ?? { count: 0, blockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = Date.now() + BLOCK_MS;
    entry.count = 0;
  }
  attemptsByEmail.set(email, entry);
}

function clearFailures(email: string): void {
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
  if (isRateLimited(normalizedEmail)) {
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
    recordFailure(normalizedEmail);
    return { outcome: "invalid_credentials" };
  }

  const ok = await matchesHash(password, account.password_hash);
  if (!ok) {
    recordFailure(normalizedEmail);
    return { outcome: "invalid_credentials" };
  }

  clearFailures(normalizedEmail);
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
