// POST /api/studio/payouts/onboard — creates (or resumes) real Stripe Connect Express
// onboarding for a channel. Membership-gated like every other Studio write.
import { NextResponse, type NextRequest } from "next/server";
import { createConnectOnboardingLink } from "@/lib/server/payouts";
import { StripeNotConfiguredError } from "@/lib/server/commerce";
import { getRequestAccount } from "@/lib/server/rbac";
import { query } from "@/lib/server/db";

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { channelId?: string; returnPath?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.channelId) {
    return NextResponse.json({ error: "channelId is required." }, { status: 400 });
  }
  const membership = await query(
    `select 1 from memberships where account_id = $1 and organization_id = $2`,
    [account.id, body.channelId],
  );
  if (membership.length === 0) {
    return NextResponse.json({ error: "You aren't a member of that channel." }, { status: 403 });
  }
  const returnPath = body.returnPath?.startsWith("/") ? body.returnPath : "/studio/revenue/";
  const origin = request.headers.get("origin") || request.nextUrl.origin;

  try {
    const url = await createConnectOnboardingLink(body.channelId, account.email, returnPath, origin);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "Payments aren't set up yet. Try again later." }, { status: 503 });
    }
    console.error("POST /api/studio/payouts/onboard failed", err);
    return NextResponse.json({ error: "Failed to start onboarding." }, { status: 500 });
  }
}
