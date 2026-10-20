// POST /api/subscriptions/app-confirm — called by the MYHitch mobile app once its
// PaymentSheet finishes for ../app-subscribe, so the new plan shows up right away
// instead of waiting on the Stripe webhook (the app's equivalent of the Checkout return
// page's verify call). Body `{ subscriptionId }`. Records the subscription through the
// same upsertSubscriptionFromStripe() the webhook uses — a no-op while it's still unpaid
// — and answers with the same `{ items }` as GET /api/subscriptions.
import { NextResponse, type NextRequest } from "next/server";
import { confirmAppSubscription, listRealSubscriptions } from "@/lib/server/subscriptions";
import { StripeNotConfiguredError } from "@/lib/server/commerce";
import { getRequestAccount } from "@/lib/server/rbac";

const SUBSCRIPTION_ID = /^sub_[A-Za-z0-9]{8,64}$/;

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { subscriptionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const subscriptionId = typeof body?.subscriptionId === "string" ? body.subscriptionId : "";
  if (!SUBSCRIPTION_ID.test(subscriptionId)) {
    return NextResponse.json({ error: "A Stripe subscription id is required." }, { status: 400 });
  }

  try {
    const result = await confirmAppSubscription(account.id, subscriptionId);
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
    }
    const items = await listRealSubscriptions(account.id);
    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "Payments aren't set up yet. Try again later." }, { status: 503 });
    }
    console.error("POST /api/subscriptions/app-confirm failed", err);
    return NextResponse.json({ error: "Failed to confirm the subscription." }, { status: 500 });
  }
}
