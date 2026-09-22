// GET /api/admin/organisations — real counterpart of the mock's getOrganisations().
// Admin-only.
import { NextResponse, type NextRequest } from "next/server";
import { listAdminOrganisations } from "@/lib/server/adminOrganizations";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["moderator", "super-admin"])) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const items = await listAdminOrganisations();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/admin/organisations failed", err);
    return NextResponse.json({ error: "Failed to load organisations." }, { status: 500 });
  }
}
