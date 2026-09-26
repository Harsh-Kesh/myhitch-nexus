// Enterprise API: Overview & Summary Metrics (GET)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";
import {
  getEnterpriseOverview,
  resolveOrgIdForAccount,
  isEnterpriseOrgActive,
  NoOrganizationError,
} from "@/lib/server/enterprise";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
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

  const overview = await getEnterpriseOverview(orgId);
  return NextResponse.json({ overview });
}
