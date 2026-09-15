// Server-only. Role naming lives in two places with different vocabularies: the mock
// UserRole type (src/lib/mock-api/types.ts — "education", "organisation") predates the
// real schema, while account_roles.role (Phase 0 migration) uses the SRS §4 spelling
// ("education_provider", "government_nonprofit"). Kept as an explicit two-way map rather
// than renaming either side — the mock type is a public signature UI code already
// depends on, and the DB check constraint mirrors the SRS document's own wording.
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import {
  getSessionAccount,
  readSessionToken,
  SESSION_COOKIE_NAME,
  type SessionAccount,
} from "./session";

const MOCK_TO_DB_ROLE: Record<string, string> = {
  viewer: "viewer",
  creator: "creator",
  business: "business",
  advertiser: "advertiser",
  producer: "producer",
  education: "education_provider",
  organisation: "government_nonprofit",
  admin: "admin",
};

const DB_TO_MOCK_ROLE: Record<string, string> = Object.fromEntries(
  Object.entries(MOCK_TO_DB_ROLE).map(([mock, db]) => [db, mock]),
);

export function toDbRole(mockRole: string): string {
  return MOCK_TO_DB_ROLE[mockRole] ?? mockRole;
}

export function toMockRoles(dbRoles: string[]): string[] {
  return dbRoles.map((role) => DB_TO_MOCK_ROLE[role] ?? role);
}

/** Resolves the signed-in account for a request, or null if there isn't one — same
 * "absence is a normal state, not an error" shape as getSessionAccount() itself. */
export async function getRequestAccount(request: NextRequest): Promise<SessionAccount | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  return getSessionAccount(token);
}

/** For future write-path routes (watchlist, ratings, comments, admin actions): resolves
 * the account and checks it holds `role`, without leaking whether the failure was "not
 * signed in" vs "signed in but missing the role" — callers return 401/403 as they see
 * fit, this only answers the yes/no question. */
export async function accountHasRole(request: NextRequest, role: string): Promise<boolean> {
  const account = await getRequestAccount(request);
  return Boolean(account?.roles.includes(toDbRole(role)));
}

/**
 * Server Component / layout guard — real, server-side enforcement of SEC-1 ("today any
 * logged-in user can open /admin"), replacing the client-only AuthGuard's "is anyone
 * logged in" check, which never looked at *which* roles they held. Reads the session
 * cookie via next/headers (layouts have no NextRequest to read, unlike route handlers)
 * and redirects before anything protected renders or ships to the browser.
 *
 * Not signed in -> /auth/login, same destination the old client guard used. Signed in
 * but missing every one of `roles` -> / (home) — deliberately a plain redirect rather
 * than a dedicated "access denied" page, since none exists yet and this is the honest
 * minimum rather than a half-built extra surface.
 */
export async function requireRole(roles: string | string[]): Promise<SessionAccount> {
  const required = (Array.isArray(roles) ? roles : [roles]).map(toDbRole);

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect("/auth/login");

  const account = await getSessionAccount(token);
  if (!account) redirect("/auth/login");

  if (!account.roles.some((role) => required.includes(role))) redirect("/");

  return account;
}
