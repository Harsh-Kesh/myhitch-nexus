// POST /api/channels/[id]/membership/checkout — creates a real Stripe Checkout session
// for a channel membership. Real accounts only, mirrors /api/subscriptions/checkout's
// shape for platform Premium.
import { NextResponse, type NextRequest } from "next/server";
import { createChannelMembershipCheckoutSession } from "@/lib/server/channelMemberships";
import { StripeNotConfiguredError } from "@/lib/server/commerce";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { returnPath?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const returnPath = body.returnPath?.startsWith("/") ? body.returnPath : "/";

  try {
    const result = await createChannelMembershipCheckoutSession(account.id, account.email, id, returnPath);
    switch (result.outcome) {
      case "success":
        return NextResponse.json({ url: result.url });
      case "not_available":
        return NextResponse.json({ error: "This channel doesn't offer memberships." }, { status: 404 });
      case "own_channel":
        return NextResponse.json({ error: "You can't become a member of your own channel." }, { status: 400 });
      case "already_member":
        return NextResponse.json({ error: "You're already a member of this channel." }, { status: 409 });
      case "unsupported_currency":
        return NextResponse.json({ error: `${result.currency} isn't supported for checkout yet.` }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "Payments aren't set up yet. Try again later." }, { status: 503 });
    }
    console.error(`POST /api/channels/${id}/membership/checkout failed`, err);
    return NextResponse.json({ error: "Failed to start checkout." }, { status: 500 });
  }
}
