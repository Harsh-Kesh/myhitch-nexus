// POST /api/auth/register — creates a local account and signs it in immediately, same
// as the mock's register() always did. See src/lib/server/localPassword.ts's header for
// why this is a local password rather than Auth0: no tenant to call yet
// (docs/DEVELOPMENT-PLAN.md §9, blocker #2).
//
// Deliberately narrow: this is the "simple auth page for now" scope, not the full
// registration wizard the UI shows (org verification documents, MFA enrollment, mobile
// OTP) — those need P2's document storage, real Auth0 MFA, and an SMS provider
// respectively, none of which exist yet. Every account created here lands as
// unverified for roles that need it; the studio/business surfaces they unlock stay
// gated on that until the real verification workflow is built.
import { NextResponse, type NextRequest } from "next/server";
import { provisionChannelForRole } from "@/lib/server/channelProvisioning";
import { query } from "@/lib/server/db";
import { createLocalAccount, emailIsRegistered } from "@/lib/server/localPassword";
import { recordLegalAcceptance } from "@/lib/server/legalAcceptance";
import { toDbRole } from "@/lib/server/rbac";
import { createSession, setSessionCookie } from "@/lib/server/session";

const ROLES_REQUIRING_VERIFICATION = new Set([
  "business",
  "advertiser",
  "producer",
  "education",
  "organisation",
]);

// The exact 7 self-service roles the registration wizard itself offers
// (src/app/auth/register/page.tsx) — never "admin" or any other privileged/internal
// role. `role` arrives as free text from the request body; without this allow-list a
// request with `role: "admin"` would insert straight into account_roles (whose check
// constraint does happen to permit "admin", since that table is shared with real admin
// grants) and hand the caller a real, working admin account with no verification at
// all. Found and fixed 2026-09-18 during an authorization audit — confirmed exploitable
// against production before this fix landed.
const SELF_REGISTRABLE_ROLES = new Set([
  "viewer",
  "creator",
  "business",
  "advertiser",
  "producer",
  "education",
  "organisation",
]);

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  country?: string;
  acceptedTerms?: boolean;
}

export async function POST(request: NextRequest) {
  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const role = body.role?.trim() || "viewer";
  const country = body.country?.trim() || null;

  if (!name || !email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: "A name and a valid email address are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (body.acceptedTerms !== true) {
    return NextResponse.json(
      { error: "You must accept the terms of service and privacy policy." },
      { status: 400 },
    );
  }
  if (!SELF_REGISTRABLE_ROLES.has(toDbRole(role))) {
    return NextResponse.json({ error: "That role can't be self-registered." }, { status: 400 });
  }

  if (await emailIsRegistered(email)) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const account = await createLocalAccount({ email, password, fullName: name, country });
  await recordLegalAcceptance(account.id, request.headers.get("x-forwarded-for"), "terms_and_privacy");
  await recordLegalAcceptance(account.id, request.headers.get("x-forwarded-for"), "community_guidelines");

  const dbRole = toDbRole(role);
  await query(
    `insert into account_roles (account_id, role, verified)
     values ($1, $2, $3)
     on conflict (account_id, role) do nothing`,
    [account.id, dbRole, !ROLES_REQUIRING_VERIFICATION.has(dbRole)],
  );

  await provisionChannelForRole(account.id, dbRole, { name, country, email });

  const session = await createSession(account.id, {
    remember: true,
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for"),
  });

  const response = NextResponse.json({ userId: account.id, verificationRequired: true });
  setSessionCookie(response, session.token, session.maxAgeSeconds);
  return response;
}
