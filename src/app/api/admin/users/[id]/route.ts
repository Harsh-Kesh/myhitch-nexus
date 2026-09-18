// PATCH /api/admin/users/[id] — real counterpart of the mock's updateUserRole()/
// updateUserStatus(), combined into one endpoint since /admin/users' "Save changes"
// button applies both in one action. Admin-only.
import { NextResponse, type NextRequest } from "next/server";
import { updateAdminUserRoles, updateAdminUserStatus, type AdminUserRow } from "@/lib/server/adminUsers";
import { getRequestAccount } from "@/lib/server/rbac";

interface PatchBody {
  roles?: string[];
  status?: AdminUserRow["status"];
  reason?: string;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!account.roles.includes("admin")) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const { id } = await params;

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const admin = { id: account.id, name: account.fullName };
  try {
    if (body.roles) {
      await updateAdminUserRoles(admin, id, body.roles);
    }
    if (body.status) {
      await updateAdminUserStatus(admin, id, body.status, body.reason?.trim() ?? "");
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`PATCH /api/admin/users/${id} failed`, err);
    return NextResponse.json({ error: "Failed to update the user." }, { status: 500 });
  }
}
