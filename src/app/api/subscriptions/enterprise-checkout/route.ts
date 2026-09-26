// POST /api/subscriptions/enterprise-checkout — creates a real Stripe Checkout session
// for the signed-in account's own organization, at the exact price a super-admin
// negotiated and set on it (see adminEnterprise.ts's approveEnterpriseApplication()).
// Deliberately its own route rather than reusing /api/subscriptions/checkout — that one
// assumes a fixed PLAN_CATALOG price, Enterprise's is per-organization.
import { NextResponse, type NextRequest } from "next/server";
import { startEnterpriseSubscription } from "@/lib/server/subscriptions";
import { StripeNotConfiguredError } from "@/lib/server/commerce";
import { resolveOrgIdForAccount, NoOrganizationError } from "@/lib/server/enterprise";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["producer"])) {
    return NextResponse.json({ error: "This checkout is only for Enterprise applications." }, { status: 403 });
  }

  let body: { returnPath?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const returnPath = body.returnPath?.startsWith("/") ? body.returnPath : "/business/channel";

  let orgId: string;
  try {
    orgId = await resolveOrgIdForAccount(account.id);
  } catch (err) {
    if (err instanceof NoOrganizationError) {
      return NextResponse.json({ error: "You aren't a member of any organization." }, { status: 403 });
    }
    throw err;
  }

  try {
    const result = await startEnterpriseSubscription(account.id, account.email, orgId, returnPath);
    if (result.outcome === "already_subscribed") {
      return NextResponse.json({ error: "You already have an active Enterprise subscription." }, { status: 409 });
    }
    if (result.outcome === "not_awaiting_payment") {
      return NextResponse.json(
        { error: "Your Enterprise application doesn't have a price set yet — check back once it's been approved." },
        { status: 409 },
      );
    }
    return NextResponse.json({ url: result.url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "Payments aren't set up yet. Try again later." }, { status: 503 });
    }
    console.error("POST /api/subscriptions/enterprise-checkout failed", err);
    return NextResponse.json({ error: "Failed to start checkout." }, { status: 500 });
  }
}
