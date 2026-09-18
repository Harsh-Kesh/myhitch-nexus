// GET /api/admin/users — real counterpart of the mock's getAdminUsers(). Admin-only.
import { NextResponse, type NextRequest } from "next/server";
import { listAdminUsers } from "@/lib/server/adminUsers";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!account.roles.includes("admin")) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const items = await listAdminUsers();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/admin/users failed", err);
    return NextResponse.json({ error: "Failed to load users." }, { status: 500 });
  }
}
