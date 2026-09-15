// POST /api/auth/login — verifies email+password and issues a session cookie. The one
// route that changes when Auth0 lands: swap verifyLocalPassword() for
// verifyAuth0Password() from auth0Sync.ts (same three-outcome shape, plus an
// mfa_required branch to wire up) — see src/lib/server/localPassword.ts's header.
import { NextResponse, type NextRequest } from "next/server";
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
