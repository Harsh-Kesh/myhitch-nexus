// GET /api/enterprise/audit-logs — real audit trail for the signed-in account's own
// organization (actions taken by any of its members — see listOrgAuditLog()'s own header
// for why that's the honest scope given the existing audit_log table's shape).
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";
import { resolveOrgIdForAccount, isEnterpriseOrgActive, NoOrganizationError, listOrgAuditLog } from "@/lib/server/enterprise";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  // Enterprise Hub tab — Nexus Enterprise only, not Business (which has its own set of
  // features and never included this one — see PLANS' own "All Business features" +
  // list of add-ons on the Enterprise tier). Previously any org member of any tier could
  // reach this, since resolveOrgIdForAccount() below only checks org membership.
  if (!hasAnyRole(account, ["producer"])) {
    return NextResponse.json({ error: "This feature is included with Nexus Enterprise." }, { status: 403 });
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
  if (!(await isEnterpriseOrgActive(orgId))) {
    return NextResponse.json({ error: "Your Enterprise application is still pending approval." }, { status: 403 });
  }

  const severity = request.nextUrl.searchParams.get("severity") ?? undefined;
  const targetType = request.nextUrl.searchParams.get("targetType") ?? undefined;
  const entries = await listOrgAuditLog(orgId, { severity, targetType });
  return NextResponse.json({ entries });
}
