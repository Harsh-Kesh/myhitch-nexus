// Server-only. Role naming lives in two places with different vocabularies: the mock
// UserRole type (src/lib/mock-api/types.ts — "education", "organisation") predates the
// real schema, while account_roles.role (Phase 0 migration) uses the SRS §4 spelling
// ("education_provider", "government_nonprofit"). Kept as an explicit two-way map rather
// than renaming either side — the mock type is a public signature UI code already
// depends on, and the DB check constraint mirrors the SRS document's own wording.
import "server-only";
import type { NextRequest } from "next/server";
import { getSessionAccount, readSessionToken, type SessionAccount } from "./session";

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
