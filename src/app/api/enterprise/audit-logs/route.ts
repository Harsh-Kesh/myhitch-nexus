// GET /api/enterprise/audit-logs — real audit trail for the signed-in account's own
// organization (actions taken by any of its members — see listOrgAuditLog()'s own header
// for why that's the honest scope given the existing audit_log table's shape).
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { resolveOrgIdForAccount, NoOrganizationError, listOrgAuditLog } from "@/lib/server/enterprise";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  let orgId: string;
  try {
    orgId = await resolveOrgIdForAccount(account.id);
  } catch (err) {
    if (err instanceof NoOrganizationError) {
      return NextResponse.json({ error: "You aren't a member of any organization." }, { status: 403 });
    }
    throw err;
  }

  const severity = request.nextUrl.searchParams.get("severity") ?? undefined;
  const targetType = request.nextUrl.searchParams.get("targetType") ?? undefined;
  const entries = await listOrgAuditLog(orgId, { severity, targetType });
  return NextResponse.json({ entries });
}
