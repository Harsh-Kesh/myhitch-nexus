// Server-only. Real Nexus Premium (platform) subscriptions — see the migration comment
// (20260918000002_subscriptions.sql) for why channel memberships are deliberately not
// part of this slice. Same STRIPE_SECRET_KEY/StripeNotConfiguredError pattern as
// commerce.ts.
import "server-only";
import type Stripe from "stripe";
import { query, queryOne } from "./db";
import { getStripe } from "./stripeClient";
import { SITE_URL } from "@/lib/utils";

const PREMIUM_PRICE_MINOR = 999;
const PREMIUM_CURRENCY = "gbp";
const PREMIUM_INTERVAL = "month";

export type CreatePremiumCheckoutResult =
  | { outcome: "success"; url: string }
  | { outcome: "already_subscribed" };

/** `returnPath` is where the video/account page the request came from wants the
 * checkout to land back on (e.g. `/video/{id}/`) — Premium can be started from more
 * than one place, unlike a video purchase which always returns to that one video. */
export async function createPremiumCheckoutSession(
  accountId: string,
  accountEmail: string,
  returnPath: string,
): Promise<CreatePremiumCheckoutResult> {
  const existing = await queryOne<{ id: string }>(
    `select id from subscriptions where account_id = $1 and status in ('active', 'past_due')`,
    [accountId],
  );
  if (existing) return { outcome: "already_subscribed" };

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: accountEmail,
    line_items: [
      {
        price_data: {
          currency: PREMIUM_CURRENCY,
          product_data: { name: "Nexus Premium" },
          unit_amount: PREMIUM_PRICE_MINOR,
          recurring: { interval: PREMIUM_INTERVAL },
        },
        quantity: 1,
      },
    ],
    // Also set on the subscription itself (not just this session) so a later
    // customer.subscription.updated/deleted webhook — which carries the Subscription
    // object, not the Checkout Session — still has accountId to work with.
    subscription_data: { metadata: { accountId } },
    success_url: `${SITE_URL}${returnPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}${returnPath}?checkout=cancelled`,
    metadata: { accountId },
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  return { outcome: "success", url: session.url };
}

function mapStripeStatus(status: Stripe.Subscription.Status): "active" | "past_due" | "cancelled" | "incomplete" {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled") return "cancelled";
  return "incomplete";
}

/** Idempotent upsert keyed on stripe_subscription_id — the webhook's
 * customer.subscription.* handlers and the checkout-return page's verify call can both
 * reach this for the same subscription without creating duplicates, same pattern as
 * commerce.ts's fulfillCheckoutSession(). */
export async function upsertSubscriptionFromStripe(subscription: Stripe.Subscription): Promise<void> {
  const accountId = subscription.metadata?.accountId;
  if (!accountId) {
    console.error("Stripe subscription missing accountId metadata", subscription.id);
    return;
  }
  const item = subscription.items.data[0];
  const priceMinor = item?.price.unit_amount ?? PREMIUM_PRICE_MINOR;
  const currency = (item?.price.currency ?? PREMIUM_CURRENCY).toUpperCase();
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  await query(
    `insert into subscriptions (
       account_id, stripe_customer_id, stripe_subscription_id, status, price_minor,
       currency, current_period_end, cancel_at_period_end
     ) values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (stripe_subscription_id) do update set
       status = $4, price_minor = $5, currency = $6, current_period_end = $7,
       cancel_at_period_end = $8`,
    [
      accountId,
      customerId,
      subscription.id,
      mapStripeStatus(subscription.status),
      priceMinor,
      currency,
      periodEnd,
      subscription.cancel_at_period_end,
    ],
  );
}

export async function checkRealPremium(accountId: string): Promise<boolean> {
  const row = await queryOne(
    `select 1 from subscriptions where account_id = $1 and status = 'active'`,
    [accountId],
  );
  return Boolean(row);
}

export interface RealSubscriptionRow {
  id: string;
  status: "active" | "past_due" | "cancelled" | "incomplete";
  priceMinor: number;
  currency: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

export async function listRealSubscriptions(accountId: string): Promise<RealSubscriptionRow[]> {
  const rows = await query<{
    id: string;
    status: RealSubscriptionRow["status"];
    price_minor: number;
    currency: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    created_at: string;
  }>(
    `select id, status, price_minor, currency, current_period_end, cancel_at_period_end, created_at
     from subscriptions where account_id = $1 order by created_at desc`,
    [accountId],
  );
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    priceMinor: row.price_minor,
    currency: row.currency,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    createdAt: row.created_at,
  }));
}

// Same shape as commerce.ts's VerifyCheckoutSessionResult ({ granted } | { outcome:
// "not_your_session" }) so the checkout-return page can handle either mode identically.
export type VerifySubscriptionSessionResult = { granted: boolean } | { outcome: "not_your_session" };

/** Same role as commerce.ts's verifyCheckoutSession() — called by the checkout-return
 * page as a UX nicety on top of the webhook (see that function's header comment for why
 * both reaching the same fulfillment is safe). */
export async function verifySubscriptionSession(
  sessionId: string,
  requestingAccountId: string,
): Promise<VerifySubscriptionSessionResult> {
  const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  const accountId = session.metadata?.accountId;
  if (accountId !== requestingAccountId) return { outcome: "not_your_session" };

  if (session.subscription && typeof session.subscription !== "string") {
    await upsertSubscriptionFromStripe(session.subscription);
  }
  const granted = await checkRealPremium(requestingAccountId);
  return { granted };
}

export type CancelSubscriptionResult =
  | { outcome: "success"; currentPeriodEnd: string | null }
  | { outcome: "not_found" };

/** Cancels at period end, not immediately — matching what the account/subscriptions
 * page has always told the user ("access continues until {renewsAt}"), a promise the
 * mock's own cancelSubscription() never actually kept (it flipped status immediately).
 * Real Stripe's cancel_at_period_end makes that copy accurate for the first time. */
export async function cancelRealSubscription(
  accountId: string,
  subscriptionRowId: string,
): Promise<CancelSubscriptionResult> {
  const row = await queryOne<{ stripe_subscription_id: string }>(
    `select stripe_subscription_id from subscriptions where id = $1 and account_id = $2`,
    [subscriptionRowId, accountId],
  );
  if (!row) return { outcome: "not_found" };

  const updated = await getStripe().subscriptions.update(row.stripe_subscription_id, {
    cancel_at_period_end: true,
  });
  await upsertSubscriptionFromStripe(updated);
  const item = updated.items.data[0];
  return {
    outcome: "success",
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
  };
}
