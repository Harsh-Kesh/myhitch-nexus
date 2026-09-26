// PATCH /api/admin/enterprise/[id] — activate or reject a real Enterprise application.
// Super-admin only (see route.ts's own header for why).
import { NextResponse, type NextRequest } from "next/server";
import { decideEnterpriseApplication } from "@/lib/server/adminEnterprise";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["super-admin"])) {
    return NextResponse.json({ error: "Super-admin access required." }, { status: 403 });
  }
  const { id } = await params;

  let body: { status?: "active" | "rejected"; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (body.status !== "active" && body.status !== "rejected") {
    return NextResponse.json({ error: "status must be 'active' or 'rejected'." }, { status: 400 });
  }

  try {
    const result = await decideEnterpriseApplication(
      { id: account.id, name: account.fullName, roles: account.roles },
      id,
      body.status,
      body.notes?.trim() ?? "",
    );
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }
    if (result.outcome === "not_enterprise_org") {
      return NextResponse.json({ error: "This organization isn't an Enterprise application." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`PATCH /api/admin/enterprise/${id} failed`, err);
    return NextResponse.json({ error: "Failed to update the application." }, { status: 500 });
  }
}
