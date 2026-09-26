// GET /api/admin/enterprise — real Enterprise application queue + raw sales-inquiry
// leads for context. Super-admin only — matches setOrganizationSeatLimit()'s own
// reasoning in adminOrganizations.ts: this changes what a paying customer can do, not a
// content/brand-safety call a moderator would otherwise make.
import { NextResponse, type NextRequest } from "next/server";
import { listEnterpriseApplications, listSalesInquiries } from "@/lib/server/adminEnterprise";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["super-admin"])) {
    return NextResponse.json({ error: "Super-admin access required." }, { status: 403 });
  }

  try {
    const [applications, inquiries] = await Promise.all([
      listEnterpriseApplications(),
      listSalesInquiries(),
    ]);
    return NextResponse.json({ applications, inquiries });
  } catch (err) {
    console.error("GET /api/admin/enterprise failed", err);
    return NextResponse.json({ error: "Failed to load Enterprise applications." }, { status: 500 });
  }
}
