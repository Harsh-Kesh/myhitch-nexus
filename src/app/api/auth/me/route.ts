// GET /api/auth/me — who, if anyone, the request's session cookie belongs to. Returns
// 200 with `{ account: null }` rather than 401 when signed out — this is the "is anyone
// logged in" check every page makes on load, not a protected resource, so absence is a
// normal response to handle, not an error to catch.
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount, toMockRoles } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  return NextResponse.json({
    account: account ? { ...account, roles: toMockRoles(account.roles) } : null,
  });
}
