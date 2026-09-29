// POST /api/auth/login — verifies email+password and issues a session cookie. The one
// route that changes when Auth0 lands: swap verifyLocalPassword() for
// verifyAuth0Password() from auth0Sync.ts (same three-outcome shape, plus an
// mfa_required branch to wire up) — see src/lib/server/localPassword.ts's header.
import { NextResponse, type NextRequest } from "next/server";
import { queryOne } from "@/lib/server/db";
import { toMockRoles } from "@/lib/server/rbac";
import { verifyLocalPassword } from "@/lib/server/localPassword";
import { createSession, getSessionAccount, setSessionCookie } from "@/lib/server/session";

interface LoginBody {
  email?: string;
  password?: string;
  remember?: boolean;
}

export async function POST(request: NextRequest) {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim() ?? "";
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const result = await verifyLocalPassword(email, password);

  if (result.outcome === "rate_limited") {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }
  if (result.outcome === "invalid_credentials") {
    return NextResponse.json({ error: "That email or password is not correct." }, { status: 401 });
  }

  const accountStatus = await queryOne<{ status: string; verification_status?: string; abn_lookup_status?: string }>(
    `select a.status, o.verification_status, v.abn_lookup_status
     from accounts a
     left join memberships m on m.account_id = a.id and m.org_role = 'owner'
     left join organizations o on o.id = m.organization_id
     left join organization_verification v on v.organization_id = o.id
     where a.id = $1`,
    [result.accountId]
  );

  if (accountStatus?.status === "suspended" || accountStatus?.status === "closed") {
    return NextResponse.json(
      { error: "This account has been suspended. Contact support if you think this is a mistake." },
      { status: 403 },
    );
  }

  if (accountStatus?.verification_status === "rejected") {
    return NextResponse.json(
      { error: `Registration rejected: ${accountStatus.abn_lookup_status || "Verification failed."}` },
      { status: 403 },
    );
  }

  const session = await createSession(result.accountId, {
    remember: body.remember !== false,
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for"),
  });
  const account = await getSessionAccount(session.token);

  const response = NextResponse.json({
    account: account ? { ...account, roles: toMockRoles(account.roles) } : null,
  });
  setSessionCookie(response, session.token, session.maxAgeSeconds);
  return response;
}
