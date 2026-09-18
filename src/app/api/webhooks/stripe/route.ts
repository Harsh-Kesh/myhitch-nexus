// POST /api/webhooks/stripe — the source of truth for fulfilling a checkout (see
// commerce.ts's fulfillCheckoutSession() header comment on why the redirect page also
// calls it, and why that's safe). Needs STRIPE_WEBHOOK_SECRET, and a webhook endpoint
// pointed at this URL configured in the Stripe dashboard — neither exists yet.
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { fulfillCheckoutSession, getStripe, StripeNotConfiguredError } from "@/lib/server/commerce";

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
      await fulfillCheckoutSession(event.data.object as Stripe.Checkout.Session);
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handling failed", err);
    return NextResponse.json({ error: "Webhook handling failed." }, { status: 500 });
  }
}
