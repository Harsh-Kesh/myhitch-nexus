// POST /api/auth/social/google — Verifies Google ID token / One Tap credential and creates/signs into account
import { NextResponse, type NextRequest } from "next/server";
import { query, queryOne } from "@/lib/server/db";
import { toMockRoles } from "@/lib/server/rbac";
import { verifyGoogleIdToken } from "@/lib/server/socialIdentity";
import { recordLegalAcceptance } from "@/lib/server/legalAcceptance";
import { provisionChannelForRole } from "@/lib/server/channelProvisioning";
import { createSession, getSessionAccount, setSessionCookie } from "@/lib/server/session";

interface GoogleAuthBody {
  credential?: string;
  name?: string;
}

export async function POST(request: NextRequest) {
  let body: GoogleAuthBody;
  try {
    body = (await request.json()) as GoogleAuthBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const credential = body.credential?.trim();
  if (!credential) {
    return NextResponse.json({ error: "Google credential is required." }, { status: 400 });
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(credential);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to verify Google credential.";
    return NextResponse.json(
      { error: message },
      { status: 401 },
    );
  }

  const email = identity.email.toLowerCase().trim();

  // 1. Find existing account by email
  const existingAccount = await queryOne<{ id: string }>(
    `select id from accounts where email = $1`,
    [email],
  );

  let accountId: string;

  if (existingAccount) {
    accountId = existingAccount.id;
  } else {
    // 2. Create new account via Google Sign-In
    const fullName = body.name?.trim() || email.split("@")[0];
    const newAccount = await queryOne<{ id: string }>(
      `insert into accounts (email, full_name)
       values ($1, $2)
       returning id`,
      [email, fullName],
    );

    if (!newAccount) {
      return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
    }

    accountId = newAccount.id;

    // Record legal acceptances
    await recordLegalAcceptance(accountId, request.headers.get("x-forwarded-for"), "terms_and_privacy");
    await recordLegalAcceptance(accountId, request.headers.get("x-forwarded-for"), "community_guidelines");

    // Assign viewer role
    await query(
      `insert into account_roles (account_id, role, verified)
       values ($1, 'viewer', true)
       on conflict (account_id, role) do nothing`,
      [accountId],
    );

    // Provision default viewer channel
    await provisionChannelForRole(accountId, "viewer", { name: fullName, email, country: null });
  }

  // 3. Create session & set cookie
  const session = await createSession(accountId, {
    remember: true,
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for"),
  });

  const account = await getSessionAccount(session.token);

  const response = NextResponse.json({
    success: true,
    account: account ? { ...account, roles: toMockRoles(account.roles) } : null,
  });

  setSessionCookie(response, session.token, session.maxAgeSeconds);
  return response;
}
