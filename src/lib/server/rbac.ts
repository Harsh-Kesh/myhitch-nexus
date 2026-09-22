// Server-only. account_roles.role was originally written from the SRS §4 spelling
// ("education_provider", "government_nonprofit") but migration 20260914000002 realigned
// the check constraint to the mock UserRole spelling instead ("education", "organisation")
// — both tables were still empty at the time, so it was a plain constraint swap, not a
// data migration (see that migration's own comment). Every mock role now has an identical
// DB spelling; this map is kept explicit anyway (rather than a passthrough) so a future
// re-divergence is a one-line diff here instead of a silent constraint violation.
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
  education: "education",
  organisation: "organisation",
  moderator: "moderator",
  "finance-admin": "finance-admin",
  "super-admin": "super-admin",
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

/** For an already-resolved account (every admin route already has one from
 * getRequestAccount()) — scoped-admin-role gate (ROLE-8/9/10, SEC-1): each admin route
 * passes the exact tiers docs/openapi.yaml documents for it, e.g.
 * hasAnyRole(account, ["moderator", "super-admin"]). */
export function hasAnyRole(account: SessionAccount, roles: string[]): boolean {
  return roles.some((role) => account.roles.includes(toDbRole(role)));
}

/** The real audit-log counterpart of the generic "admin" actorRole literal every
 * recordAudit() call used before scoped roles existed — most-privileged tier first, since
 * an account can hold more than one (additive roles). Falls back to "admin" only for a
 * pre-migration edge case that shouldn't exist for any real account any more. */
export function describeAdminTier(roles: string[]): string {
  if (roles.includes("super-admin")) return "super-admin";
  if (roles.includes("finance-admin")) return "finance-admin";
  if (roles.includes("moderator")) return "moderator";
  return "admin";
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

  // Defense in depth alongside the login page's own redirect (see useLogin's caller in
  // auth/login/page.tsx) — catches an admin-created account reaching a protected
  // workspace via a bookmarked link or an already-open tab, not just fresh logins.
  if (account.mustChangePassword) redirect("/auth/set-password");

  if (!account.roles.some((role) => required.includes(role))) redirect("/");

  return account;
}
