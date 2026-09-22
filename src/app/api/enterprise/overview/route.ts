// Enterprise API: Overview & Summary Metrics (GET)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import {
  getEnterpriseOverview,
  resolveOrgIdForAccount,
} from "@/lib/server/enterprise";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  const orgId = await resolveOrgIdForAccount(account?.id);

  const overview = await getEnterpriseOverview(orgId);
  return NextResponse.json({ overview });
}
