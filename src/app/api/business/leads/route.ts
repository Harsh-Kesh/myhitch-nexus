// GET/PATCH /api/business/leads — real leads captured from the signed-in account's own
// organization's videos.
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { resolveOrgIdForAccount, NoOrganizationError } from "@/lib/server/enterprise";
import { listLeads, updateLeadStatus, type LeadStatus } from "@/lib/server/businessLeads";

const VALID_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "closed"];

async function requireOrg(request: NextRequest): Promise<{ orgId: string } | { error: NextResponse }> {
  const account = await getRequestAccount(request);
  if (!account) {
    return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  }
  try {
    return { orgId: await resolveOrgIdForAccount(account.id) };
  } catch (err) {
    if (err instanceof NoOrganizationError) {
      return { error: NextResponse.json({ error: "You aren't a member of any organization." }, { status: 403 }) };
    }
    throw err;
  }
}

export async function GET(request: NextRequest) {
  const resolved = await requireOrg(request);
  if ("error" in resolved) return resolved.error;

  const statusParam = request.nextUrl.searchParams.get("status");
  const status = VALID_STATUSES.includes(statusParam as LeadStatus) ? (statusParam as LeadStatus) : undefined;
  const leads = await listLeads(resolved.orgId, status);
  return NextResponse.json({ leads });
}

export async function PATCH(request: NextRequest) {
  const resolved = await requireOrg(request);
  if ("error" in resolved) return resolved.error;

  let body: { id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.id || !VALID_STATUSES.includes(body.status as LeadStatus)) {
    return NextResponse.json({ error: "id and a valid status are required." }, { status: 400 });
  }

  const result = await updateLeadStatus(resolved.orgId, body.id, body.status as LeadStatus);
  if (result.outcome === "not_found") {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }
  return NextResponse.json({ lead: result.lead });
}
