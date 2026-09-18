// POST /api/webhooks/stripe — the source of truth for fulfilling a checkout (see
// commerce.ts's fulfillCheckoutSession() header comment on why the redirect page also
// calls it, and why that's safe). Needs STRIPE_WEBHOOK_SECRET, and a webhook endpoint
// pointed at this URL configured in the Stripe dashboard — neither exists yet.
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { fulfillCheckoutSession, getStripe, StripeNotConfiguredError } from "@/lib/server/commerce";
import { upsertSubscriptionFromStripe } from "@/lib/server/subscriptions";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
    }
    console.error("Stripe webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      // One checkout.session.completed event covers both a one-time video purchase and
      // a Premium subscription signup — mode tells them apart. The subscription case
      // doesn't need handling here at all: subscription_data.metadata (set at session
      // creation, see subscriptions.ts) already put accountId on the Subscription
      // object itself, so the customer.subscription.created event below is
      // self-sufficient without this one.
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment") {
        await fulfillCheckoutSession(session);
      }
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await upsertSubscriptionFromStripe(event.data.object as Stripe.Subscription);
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handling failed", err);
    return NextResponse.json({ error: "Webhook handling failed." }, { status: 500 });
  }
}
