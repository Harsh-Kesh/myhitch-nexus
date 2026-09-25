// POST /api/webhooks/stripe/ — the source of truth for fulfilling a checkout (see
// commerce.ts's fulfillCheckoutSession() header comment on why the redirect page also
// calls it, and why that's safe). Needs STRIPE_WEBHOOK_SECRET and a webhook endpoint
// pointed at this URL in the Stripe dashboard — both configured 2026-09-18. The
// endpoint URL MUST include the trailing slash: next.config's trailingSlash: true
// 308-redirects a request without one, and Stripe's webhook sender does not follow
// redirects — every delivery silently failed until this was found and fixed.
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { fulfillCheckoutSession, getStripe, StripeNotConfiguredError } from "@/lib/server/commerce";
import { recordSubscriptionPaymentFromInvoice, upsertSubscriptionFromStripe } from "@/lib/server/subscriptions";
import { recordMembershipPaymentFromInvoice } from "@/lib/server/channelMemberships";
import { upsertPayoutAccountFromStripe } from "@/lib/server/payouts";
import { completeTip, recordPatronRenewalFromInvoice } from "@/lib/server/tipping";

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
      if (session.metadata?.nexus_action === "creator_tip") {
        // A tip's session has no videoId/kind at all (fulfillCheckoutSession() would
        // silently no-op on it), and covers both mode="payment" (one-time tip) and the
        // first month of mode="subscription" (patron) — found live: real tip charges
        // were succeeding in Stripe while this row sat at status='pending' forever,
        // invisible to the creator's tip feed, revenue, and payout balance.
        const paymentIntentId =
          typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
        await completeTip(session.metadata.tip_id, paymentIntentId);
      } else if (session.mode === "payment") {
        await fulfillCheckoutSession(session);
      }
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await upsertSubscriptionFromStripe(event.data.object as Stripe.Subscription);
    } else if (event.type === "invoice.paid") {
      // Channel-membership revenue and platform-plan (Premium/Family/Business) revenue
      // are both credited here, once per invoice — each function is a no-op for the
      // other's case (recordMembershipPaymentFromInvoice() requires a channelId in the
      // subscription's metadata, recordSubscriptionPaymentFromInvoice() requires its
      // absence), so this event needs no mode check and the same invoice is never
      // recorded into both tables.
      const invoice = event.data.object as Stripe.Invoice;
      await Promise.all([
        recordMembershipPaymentFromInvoice(invoice),
        recordSubscriptionPaymentFromInvoice(invoice),
        recordPatronRenewalFromInvoice(invoice),
      ]);
    } else if (event.type === "account.updated") {
      await upsertPayoutAccountFromStripe(event.data.object as Stripe.Account);
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handling failed", err);
    return NextResponse.json({ error: "Webhook handling failed." }, { status: 500 });
  }
}
