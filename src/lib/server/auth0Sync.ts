// Server-only. Application-friendly Auth0 operations built on top of the low-level HTTP
// helpers in auth0Client.ts (see docs/AUTH0_INTEGRATION_STANDARD.md §2). This layer knows
// the *shape* of the Auth0 calls the app needs (create/update/verify/change-password) and
// maps Auth0's error responses into typed results/errors — it does not touch Postgres, issue
// a Nexus session, send email, or make any HTTP-route decisions. Those stay in the route
// files that will call this module in a later step.
//
// Adapted from MYHitch Pass's reference implementation with one deliberate difference:
// Pass mirrors a single `app_metadata.role` into Auth0, because Pass has exactly one role
// per user. Nexus's role model is additive — an account can hold Viewer, Creator, Business,
// Advertiser etc. simultaneously (SRS §4) — so there is no single "role" to mirror. The
// only reason Pass mirrors role at all is so its Auth0 Post-Login Action can decide whether
// to enforce MFA without calling back into Pass's own database. Nexus mirrors the narrower,
// already-computed answer to that same question instead: `app_metadata.mfa_required`, a
// boolean our backend derives from account_roles (SEC-2: mandatory for
// business/advertiser/producer/education-provider/admin) and keeps in sync on every role
// grant/revoke. This keeps the Auth0-side Action trivial (`if mfa_required, enforce MFA`)
// without needing Auth0 to understand Nexus's role taxonomy at all — the taxonomy itself
// stays entirely in account_roles, exactly as docs/AUTH0_INTEGRATION_STANDARD.md §3
// requires ("do not attempt to make Auth0 the source of truth for anything relational").
import "server-only";
import { auth0Fetch, auth0ManagementFetch, Auth0ApiError } from "./auth0Client";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Thrown when Auth0 already has a user for the given email (Management API 409). */
export class Auth0ConflictError extends Error {
  constructor(message = "An Auth0 user with this email already exists.") {
    super(message);
    this.name = "Auth0ConflictError";
  }
}

// ─── createAuth0User ─────────────────────────────────────────────────────────

export interface CreateAuth0UserInput {
  email: string;
  password: string;
  /** See the module header — the additive-roles adaptation of Pass's `role` field. */
  mfaRequired?: boolean;
}

export interface CreateAuth0UserResult {
  auth0UserId: string;
  email: string;
  emailVerified: boolean;
}

interface Auth0ManagementUserResponse {
  user_id: string;
  email: string;
  email_verified: boolean;
}

/**
 * Creates the Auth0-side credential/identity for a new user via the Management API.
 * Does not touch our own database, does not send any email, and does not create a
 * session — the caller is responsible for the `accounts` row and for its own OTP flow.
 */
export async function createAuth0User(input: CreateAuth0UserInput): Promise<CreateAuth0UserResult> {
  const connection = requireEnv("AUTH0_DB_CONNECTION");

  try {
    const res = await auth0ManagementFetch("/users", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        connection,
        email_verified: false,
        ...(input.mfaRequired !== undefined ? { app_metadata: { mfa_required: input.mfaRequired } } : {}),
      }),
    });

    const data = (await res.json()) as Auth0ManagementUserResponse;
    return { auth0UserId: data.user_id, email: data.email, emailVerified: data.email_verified };
  } catch (err) {
    if (err instanceof Auth0ApiError && err.status === 409) {
      throw new Auth0ConflictError();
    }
    throw err;
  }
}

// ─── findAuth0UserByEmail ─────────────────────────────────────────────────────

export interface Auth0UserSummary {
  auth0UserId: string;
  email: string;
  emailVerified: boolean;
  /** Raw app_metadata — callers check specific keys themselves; this layer doesn't
   * interpret its contents. */
  appMetadata: Record<string, unknown>;
}

/**
 * Looks up an Auth0 user by exact email via the Management API. Returns only the
 * minimal safe fields callers need — never the full raw Auth0 user object, and never
 * anything token/credential-shaped. Email equality alone must never be treated as
 * sufficient authorization to act on an account — callers must additionally verify
 * whatever local ownership check applies to their flow.
 */
export async function findAuth0UserByEmail(email: string): Promise<Auth0UserSummary | null> {
  const res = await auth0ManagementFetch(`/users-by-email?email=${encodeURIComponent(email)}`);
  const body = (await res.json()) as Array<{
    user_id: string;
    email: string;
    email_verified: boolean;
    app_metadata?: Record<string, unknown>;
  }>;
  const match = body[0];
  if (!match) return null;
  return {
    auth0UserId: match.user_id,
    email: match.email,
    emailVerified: match.email_verified,
    appMetadata: match.app_metadata ?? {},
  };
}

/**
 * Deletes an Auth0 user via the Management API. Not part of any user-facing
 * account-deletion flow — this exists solely as a best-effort compensating action for
 * the registration route, for the case where Auth0 user creation succeeds but the
 * subsequent database insert fails, so the orphaned Auth0 identity doesn't permanently
 * block a retried signup with the same email.
 */
export async function deleteAuth0User(auth0UserId: string): Promise<void> {
  await auth0ManagementFetch(`/users/${encodeURIComponent(auth0UserId)}`, {
    method: "DELETE",
  });
}

/**
 * Asks Auth0 to send its own hosted "verify your email" email to this user. Best-effort
 * from the caller's point of view — Auth0 owns the verification link/redirect entirely;
 * this app only ever reads back `emailVerified` via findAuth0UserByEmail() afterwards,
 * it never issues or checks a code of its own for this flow.
 *
 * NOTE: this is the one place the standard's "never Auth0's mailer" rule needs a decision
 * before use — FR-6.2.3 wants Nexus-branded email/mobile verification. Whether that means
 * disabling this and rolling our own verification-link email (matching the OTP pattern
 * used for password reset below), or accepting Auth0's templated email for this one flow,
 * is an open question, not yet decided. Do not wire this into a route until it is.
 */
export async function sendAuth0VerificationEmail(auth0UserId: string): Promise<void> {
  await auth0ManagementFetch("/jobs/verification-email", {
    method: "POST",
    body: JSON.stringify({ user_id: auth0UserId }),
  });
}

// ─── updateAuth0User ─────────────────────────────────────────────────────────

export interface UpdateAuth0UserInput {
  emailVerified?: boolean;
  /** New password. When set, the connection is attached automatically. */
  password?: string;
  /** See the module header — recomputed by the caller whenever account_roles changes. */
  mfaRequired?: boolean;
  /**
   * Backend-authoritative marker (app_metadata.mfa_enrolled) a Post-Login Action reads
   * to decide whether this user has actually completed enrollment (distinct from
   * mfaRequired, which decides whether enrollment is mandatory) — set true only by the
   * MFA confirm route, only after local TOTP verification AND the Auth0
   * authentication-method creation have both already succeeded.
   */
  mfaEnrolled?: boolean;
}

/**
 * Patches an existing Auth0 user via the Management API. Only the fields this
 * integration actually needs (email_verified, password, app_metadata.mfa_required/
 * mfa_enrolled) are ever sent — never arbitrary Auth0 profile fields. app_metadata is
 * merged by Auth0's API, not replaced, so setting one of these here never clobbers
 * the other.
 */
export async function updateAuth0User(auth0UserId: string, input: UpdateAuth0UserInput): Promise<void> {
  const body: Record<string, unknown> = {};

  if (input.emailVerified !== undefined) body.email_verified = input.emailVerified;
  if (input.password !== undefined) {
    body.password = input.password;
    body.connection = requireEnv("AUTH0_DB_CONNECTION");
  }

  const appMetadata: Record<string, unknown> = {};
  if (input.mfaRequired !== undefined) appMetadata.mfa_required = input.mfaRequired;
  if (input.mfaEnrolled !== undefined) appMetadata.mfa_enrolled = input.mfaEnrolled;
  if (Object.keys(appMetadata).length > 0) body.app_metadata = appMetadata;

  if (Object.keys(body).length === 0) return;

  await auth0ManagementFetch(`/users/${encodeURIComponent(auth0UserId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// ─── changeAuth0Password ─────────────────────────────────────────────────────

/**
 * Changes an existing Auth0 user's password via the Management API. Auth0 owns hashing —
 * the plaintext password is sent once over TLS and never hashed or stored locally, and
 * no password field in our own database is ever touched here (session revocation after a
 * password change remains the calling route's responsibility).
 */
export async function changeAuth0Password(auth0UserId: string, newPassword: string): Promise<void> {
  await updateAuth0User(auth0UserId, { password: newPassword });
}

// ─── verifyAuth0Password ─────────────────────────────────────────────────────

export type VerifyAuth0PasswordResult =
  | { outcome: "success" }
  | { outcome: "invalid_credentials" }
  | { outcome: "mfa_required"; mfaToken: string }
  | { outcome: "rate_limited" };

interface Auth0TokenErrorBody {
  error?: string;
  error_description?: string;
  mfa_token?: string;
}

/**
 * Distinguishes Auth0's own anti-brute-force/anomaly-detection rejection from a
 * genuine wrong password. Auth0's Attack Protection can reject a password-realm grant
 * independently of whether the password is actually correct — it fires on request
 * *pattern* (e.g. a burst of concurrent identical-identity attempts), not just on
 * repeated failures. Auth0 signals this with `error: "too_many_attempts"` (Suspicious
 * IP Throttling) or `error: "unauthorized"` with a description naming the block
 * (Brute-force Protection locking the account) — both distinct from `invalid_grant`,
 * which is Auth0's actual "wrong email or password" response.
 */
function isAuth0AttackProtectionBlock(body: Auth0TokenErrorBody | null): boolean {
  if (!body) return false;
  if (body.error === "too_many_attempts") return true;
  if (body.error !== "unauthorized") return false;
  const description = (body.error_description ?? "").toLowerCase();
  return /block|too many|suspicious|unusual activity/.test(description);
}

/**
 * Verifies an email/password pair against Auth0 using the backend-mediated Resource
 * Owner Password grant (docs/AUTH0_INTEGRATION_STANDARD.md §1/§5) — never a redirect,
 * never Universal Login. Returns a typed outcome instead of throwing for the two
 * branches a login route must handle itself (wrong credentials, MFA challenge
 * required); any other Auth0 failure (5xx, network error, unrecognized error code)
 * propagates as Auth0ApiError.
 *
 * Does not issue a Nexus session — the caller does that only after interpreting this
 * result.
 *
 * Deliberately requests no `audience` and no `scope`: this call exists purely to get a
 * pass/fail (or MFA-required) signal from Auth0, and nothing here ever reads claims off
 * an access_token or id_token, so none is requested or returned. In particular, the
 * Auth0 Management API audience must NEVER be requested from this user-context grant —
 * that audience is authorized only for the M2M application's client_credentials grant
 * (see auth0Client.ts); requesting it here would ask Auth0 to mint a
 * Management-API-scoped token for an application that was never authorized for it.
 */
export async function verifyAuth0Password(email: string, password: string): Promise<VerifyAuth0PasswordResult> {
  const clientId = requireEnv("AUTH0_CLIENT_ID");
  const clientSecret = requireEnv("AUTH0_CLIENT_SECRET");
  const realm = requireEnv("AUTH0_DB_CONNECTION");

  try {
    await auth0Fetch("/oauth/token", {
      method: "POST",
      body: JSON.stringify({
        grant_type: "http://auth0.com/oauth/grant-type/password-realm",
        username: email,
        password,
        realm,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    return { outcome: "success" };
  } catch (err) {
    if (err instanceof Auth0ApiError) {
      const body = (err.body ?? null) as Auth0TokenErrorBody | null;

      if (body?.error === "mfa_required" && body.mfa_token) {
        return { outcome: "mfa_required", mfaToken: body.mfa_token };
      }

      if (isAuth0AttackProtectionBlock(body)) {
        return { outcome: "rate_limited" };
      }

      if (body?.error === "invalid_grant" || err.status === 401 || err.status === 403) {
        return { outcome: "invalid_credentials" };
      }
    }

    throw err;
  }
}

// ─── verifyAuth0MfaOtp ────────────────────────────────────────────────────────

export type VerifyAuth0MfaOtpResult = { outcome: "success" } | { outcome: "invalid_code" };

/**
 * Completes an Auth0 MFA challenge for an already-enrolled TOTP factor, using the
 * mfa_token obtained from a prior password-realm login that returned mfa_required.
 * TOTP is a "sync" factor, so no separate /mfa/challenge call is needed — the 6-digit
 * code is submitted directly via the mfa-otp grant. Requests no audience/scope, and
 * returns no token content — same minimal-request philosophy as verifyAuth0Password.
 * A wrong code and an invalid/expired mfa_token both surface from Auth0 as the same
 * "invalid_grant" error and are treated identically — this call should always be made
 * against an mfa_token whose own short lifetime is independently enforced by the
 * caller (a short-lived server-side login-challenge record), so that ambiguity
 * doesn't matter in practice.
 */
export async function verifyAuth0MfaOtp(mfaToken: string, code: string): Promise<VerifyAuth0MfaOtpResult> {
  const clientId = requireEnv("AUTH0_CLIENT_ID");
  const clientSecret = requireEnv("AUTH0_CLIENT_SECRET");

  try {
    await auth0Fetch("/oauth/token", {
      method: "POST",
      body: JSON.stringify({
        grant_type: "http://auth0.com/oauth/grant-type/mfa-otp",
        client_id: clientId,
        client_secret: clientSecret,
        mfa_token: mfaToken,
        otp: code,
      }),
    });

    return { outcome: "success" };
  } catch (err) {
    if (err instanceof Auth0ApiError) {
      const body = (err.body ?? null) as Auth0TokenErrorBody | null;

      if (body?.error === "invalid_grant" || err.status === 401 || err.status === 403) {
        return { outcome: "invalid_code" };
      }
    }

    throw err;
  }
}
