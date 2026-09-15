// Server-only. Session issuance, lookup and revocation — permanent infrastructure that
// does NOT change when local password auth is swapped for real Auth0 (see
// localPassword.ts's header comment). Whatever verifies a credential, the result is
// always "this is account X" — from there, issuing a session, reading it back on later
// requests, and enforcing roles from account_roles is identical either way.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "./db";

export const SESSION_COOKIE_NAME = "nx_session";

// A session with "keep me signed in" unchecked still needs a real expiry server-side
// (the cookie itself becomes a browser-session cookie with no Max-Age, but the database
// row must not live forever) — 1 day covers a normal single sitting without forcing a
// re-login mid-session.
const SHORT_SESSION_HOURS = 24;
const REMEMBER_SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionAccount {
  id: string;
  email: string;
  fullName: string;
  handle: string | null;
  avatarUrl: string | null;
  country: string | null;
  preferredLanguage: string | null;
  /** account_roles rows, mapped back to the mock-api's UserRole spelling — see rbac.ts. */
  roles: string[];
}

/**
 * Creates a session row and returns the raw token — the only time it exists outside the
 * cookie itself, since the database only ever stores its hash (see the migration
 * comment). Caller is responsible for setting it as the session cookie.
 */
export async function createSession(
  accountId: string,
  opts: { remember: boolean; userAgent?: string | null; ip?: string | null },
): Promise<{ token: string; expiresAt: Date; maxAgeSeconds: number | undefined }> {
  const token = randomBytes(32).toString("hex");
  const days = opts.remember ? REMEMBER_SESSION_DAYS : SHORT_SESSION_HOURS / 24;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  await query(
    `insert into sessions (account_id, token_hash, expires_at, user_agent, ip)
     values ($1, $2, $3, $4, $5)`,
    [accountId, hashToken(token), expiresAt.toISOString(), opts.userAgent ?? null, opts.ip ?? null],
  );

  return {
    token,
    expiresAt,
    // Omitting Max-Age makes it a browser-session cookie (cleared on browser close) —
    // the "keep me signed in" checkbox is exactly this choice.
    maxAgeSeconds: opts.remember ? REMEMBER_SESSION_DAYS * 24 * 60 * 60 : undefined,
  };
}

/** Looks up the account + roles for a raw session token. Null for missing, expired, or
 * revoked sessions — callers treat all three identically (just "not signed in"). */
export async function getSessionAccount(token: string): Promise<SessionAccount | null> {
  const row = await queryOne<{
    id: string;
    email: string;
    full_name: string;
    handle: string | null;
    avatar_url: string | null;
    country: string | null;
    preferred_language: string | null;
  }>(
    `select a.id, a.email, a.full_name, a.handle, a.avatar_url, a.country, a.preferred_language
     from sessions s
     join accounts a on a.id = s.account_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  if (!row) return null;

  const roleRows = await query<{ role: string }>(
    `select role from account_roles where account_id = $1`,
    [row.id],
  );

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    handle: row.handle,
    avatarUrl: row.avatar_url,
    country: row.country,
    preferredLanguage: row.preferred_language,
    roles: roleRows.map((r) => r.role),
  };
}

/** Deletes a session by its raw token — idempotent, so logging out twice (or logging out
 * a session that already expired) is never an error. */
export async function revokeSession(token: string): Promise<void> {
  await query(`delete from sessions where token_hash = $1`, [hashToken(token)]);
}

export function readSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  maxAgeSeconds: number | undefined,
): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(maxAgeSeconds !== undefined ? { maxAge: maxAgeSeconds } : {}),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
