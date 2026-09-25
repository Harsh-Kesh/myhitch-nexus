// POST /api/studio/payouts/withdraw — creates a real Stripe Transfer to a channel's
// connected account. Membership-gated. This is the one route in this whole session that
// actually moves money (test-mode only, until real keys/onboarding exist) — every check
// below (onboarded, minimum, sufficient balance) is enforced server-side, not just in
// the UI that calls it.
import { NextResponse, type NextRequest } from "next/server";
import { createPayout } from "@/lib/server/payouts";
import { StripeNotConfiguredError } from "@/lib/server/commerce";
import { getRequestAccount } from "@/lib/server/rbac";
import { query } from "@/lib/server/db";

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { channelId?: string; amountMinor?: number };
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

  try {
    const result = await createPayout(body.channelId, { id: account.id, name: account.fullName }, body.amountMinor);
    switch (result.outcome) {
      case "not_onboarded":
        return NextResponse.json({ error: "Finish connecting a bank account first." }, { status: 400 });
      case "amount_too_small":
        return NextResponse.json({ error: "The minimum withdrawal is $50.00." }, { status: 400 });
      case "insufficient_balance":
        return NextResponse.json({ error: "That's more than your available balance." }, { status: 400 });
      case "success":
        return NextResponse.json({ amountMinor: result.amountMinor });
    }
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
    }
    console.error("POST /api/studio/payouts/withdraw failed", err);
    return NextResponse.json({ error: "Failed to process the withdrawal." }, { status: 500 });
  }
}
