// GET /api/admin/copyright-cases — real case list for /admin/reports' copyright domain.
// Admin-only.
import { NextResponse, type NextRequest } from "next/server";
import { listCopyrightCasesForAdmin } from "@/lib/server/copyright";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["moderator", "finance-admin", "super-admin"])) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const items = await listCopyrightCasesForAdmin();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/admin/copyright-cases failed", err);
    return NextResponse.json({ error: "Failed to load copyright cases." }, { status: 500 });
  }
}
