// GET /api/auth/me — who, if anyone, the request's session cookie belongs to. Returns
// 200 with `{ account: null }` rather than 401 when signed out — this is the "is anyone
// logged in" check every page makes on load, not a protected resource, so absence is a
// normal response to handle, not an error to catch.
// PATCH /api/auth/me — updates the signed-in account's own profile fields (name, email,
// handle, country, language). See accountSettings.ts for what's deliberately excluded.
import { NextResponse, type NextRequest } from "next/server";
import { updateAccount, type AccountSettingsPatch } from "@/lib/server/accountSettings";
import { getRequestAccount, toMockRoles } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  return NextResponse.json({
    account: account ? { ...account, roles: toMockRoles(account.roles) } : null,
  });
}

export async function PATCH(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: AccountSettingsPatch;
  try {
    body = (await request.json()) as AccountSettingsPatch;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const result = await updateAccount(account.id, body);
    switch (result.outcome) {
      case "invalid_email":
        return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      case "email_taken":
        return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
      case "invalid_handle":
        return NextResponse.json(
          { error: "Handle must be 2-32 characters: lowercase letters, numbers, - or _." },
          { status: 400 },
        );
      case "handle_taken":
        return NextResponse.json({ error: "That handle is already taken." }, { status: 409 });
      case "not_found":
        return NextResponse.json({ error: "Account not found." }, { status: 404 });
      case "success":
        break;
    }
  } catch (err) {
    console.error("PATCH /api/auth/me failed", err);
    return NextResponse.json({ error: "Failed to update account." }, { status: 500 });
  }

  const updated = await getRequestAccount(request);
  return NextResponse.json({
    account: updated ? { ...updated, roles: toMockRoles(updated.roles) } : null,
  });
}
