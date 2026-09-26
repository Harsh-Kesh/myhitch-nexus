// GET/POST /api/business/support — real priority support tickets for the signed-in
// account's own organization.
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";
import {
  resolveOrgIdForAccount,
  NoOrganizationError,
  createSupportTicket,
  listSupportTickets,
} from "@/lib/server/enterprise";

// "Priority business support" is a Nexus Business benefit in its own right (not an
// Enterprise-exclusive one — see PLANS' Business tier copy), so this stays open to both
// Business and Enterprise tiers — just not to a plain creator/viewer/other org type that
// never paid for either plan.
const SUPPORT_ELIGIBLE_ROLES = ["business", "advertiser", "producer"];

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, SUPPORT_ELIGIBLE_ROLES)) {
    return NextResponse.json({ error: "Priority support is included with Nexus Business and Enterprise." }, { status: 403 });
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
  const tickets = await listSupportTickets(orgId);
  return NextResponse.json({ tickets });
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, SUPPORT_ELIGIBLE_ROLES)) {
    return NextResponse.json({ error: "Priority support is included with Nexus Business and Enterprise." }, { status: 403 });
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

  let body: { subject?: string; message?: string; priority?: "normal" | "high" | "urgent" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.subject || !body.message) {
    return NextResponse.json({ error: "subject and message are required." }, { status: 400 });
  }

  const result = await createSupportTicket({
    organizationId: orgId,
    accountId: account.id,
    subject: body.subject,
    message: body.message,
    priority: body.priority,
  });
  if (result.outcome === "invalid") {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ticket: result.ticket }, { status: 201 });
}
