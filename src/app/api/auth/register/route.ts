// POST /api/auth/register — creates a local account and signs it in immediately, same
// as the mock's register() always did. See src/lib/server/localPassword.ts's header for
// why this is a local password rather than Auth0: no tenant to call yet
// (docs/DEVELOPMENT-PLAN.md §9, blocker #2).
//
// Deliberately narrow: this is the "simple auth page for now" scope, not the full
// registration wizard the UI shows (MFA enrollment, mobile OTP) — those need real Auth0
// MFA and an SMS provider, neither of which exist yet. Business/Enterprise verification
// (ABN/ACN) is collected right here and the org is marked verified immediately — see
// provisionChannelForRole() — there's no separate later review step anymore.
import { NextResponse, type NextRequest } from "next/server";
import { provisionChannelForRole } from "@/lib/server/channelProvisioning";
import { query } from "@/lib/server/db";
import { createLocalAccount, emailIsRegistered } from "@/lib/server/localPassword";
import { recordLegalAcceptance } from "@/lib/server/legalAcceptance";
import { toDbRole } from "@/lib/server/rbac";
import { createSession, setSessionCookie } from "@/lib/server/session";
import { emitNotification } from "@/lib/server/notifications";

const ROLES_REQUIRING_VERIFICATION = new Set([
  "business",
  "enterprise",
  "advertiser",
  "producer",
  
]);

// The self-service roles the registration wizard offers
// (src/app/auth/register/page.tsx) — never "admin" or any other privileged/internal role.
const SELF_REGISTRABLE_ROLES = new Set([
  "viewer",
  "creator",
  "business",
  "enterprise",
  "advertiser",
  "producer",
  
]);

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  country?: string;
  acceptedTerms?: boolean;
  orgName?: string;
  abn?: string;
  acn?: string;
  industry?: string;
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
  const dbRole = toDbRole(role);
  if (!SELF_REGISTRABLE_ROLES.has(dbRole)) {
    return NextResponse.json({ error: "That role can't be self-registered." }, { status: 400 });
  }
  // Verification now happens at registration, not a separate later step — a Business/
  // Enterprise signup needs a real ABN before the org is created verified.
  const abn = body.abn?.trim();
  if ((dbRole === "business" || dbRole === "producer") && !abn) {
    return NextResponse.json({ error: "An ABN is required for Business and Enterprise accounts." }, { status: 400 });
  }

  // Automated ABN verification
  if (abn) {
    const cleanedAbn = abn.replace(/\s+/g, '');
    if (!/^\d{11}$/.test(cleanedAbn)) {
      return NextResponse.json({ error: "Invalid ABN format. An ABN must be 11 digits." }, { status: 400 });
    }
    
    // Real ABR Lookup
    const { lookupAbn } = await import("@/lib/server/abnLookup");
    try {
      const result = await lookupAbn(cleanedAbn);
      if (!result.found) {
        return NextResponse.json({ error: result.message || "ABN Verification Failed. The business number could not be validated." }, { status: 403 });
      }
      // If we wanted, we could override body.orgName with result.entityName here!
      if (!body.orgName?.trim()) {
        body.orgName = result.entityName;
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("isn't configured")) {
        // Fallback to mock for local dev if no GUID is set
        if (cleanedAbn.startsWith("000")) {
          return NextResponse.json({ error: "ABN Verification Failed (Mock). The business number could not be validated." }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: "ABN Verification service is temporarily unavailable." }, { status: 502 });
      }
    }
  }

  if (await emailIsRegistered(email)) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const account = await createLocalAccount({ email, password, fullName: name, country });
  await recordLegalAcceptance(account.id, request.headers.get("x-forwarded-for"), "terms_and_privacy");
  await recordLegalAcceptance(account.id, request.headers.get("x-forwarded-for"), "community_guidelines");

  await query(
    `insert into account_roles (account_id, role, verified)
     values ($1, $2, $3)
     on conflict (account_id, role) do nothing`,
    [account.id, dbRole, !ROLES_REQUIRING_VERIFICATION.has(dbRole)],
  );

  await provisionChannelForRole(account.id, dbRole, {
    name,
    country,
    email,
    orgName: body.orgName?.trim(),
    abn,
    acn: body.acn?.trim(),
    industry: body.industry?.trim(),
  });

  // Enterprise has no self-serve checkout — registering with this role is the sales
  // lead, not a purchase. Auto-creating the real sales_inquiries row here (instead of
  // requiring a second, separate "Contact Sales" form fill-out right after signing up)
  // is what makes the registration itself the actionable thing an admin approves.
  if (dbRole === "producer") {
    await query(
      `insert into sales_inquiries (account_id, full_name, email, company, message)
       values ($1, $2, $3, $4, $5)`,
      [
        account.id,
        name,
        email,
        name,
        "Submitted via Enterprise self-registration — awaiting sales approval.",
      ],
    );
  }

  await emitNotification(
    account.id,
    "account-created",
    "Welcome to MYHitch Nexus",
    "Your account has been successfully created. Explore the catalogue or set up your channel.",
    "/explore"
  );

  const session = await createSession(account.id, {
    remember: true,
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for"),
  });

  const response = NextResponse.json({ userId: account.id, verificationRequired: true });
  setSessionCookie(response, session.token, session.maxAgeSeconds);
  return response;
}
