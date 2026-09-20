// POST /api/auth/set-password — the counterpart to an admin-created account's one-time
// temporary password (adminUsers.ts's createAdminUser()). Requires a signed-in session;
// not a "forgot password" flow (no reset token/email exists yet). Clears
// must_change_password so requireRole()/the login page stop redirecting here.
import { NextResponse, type NextRequest } from "next/server";
import { setPassword } from "@/lib/server/localPassword";
import { getRequestAccount } from "@/lib/server/rbac";

interface SetPasswordBody {
  newPassword?: string;
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: SetPasswordBody;
  try {
    body = (await request.json()) as SetPasswordBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const newPassword = body.newPassword ?? "";
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    await setPassword(account.id, newPassword);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/auth/set-password failed", err);
    return NextResponse.json({ error: "Failed to set your password." }, { status: 500 });
  }
}
