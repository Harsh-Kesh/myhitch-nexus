// Server-only. Real subscription plans — Nexus Premium, Family and Business — per the
// client's pricing model (2026-09-20). Replaces the single hardcoded "Nexus Premium"
// plan; channel memberships and per-video rent/buy/PPV are retired (see this migration's
// own header comment, 20260920000002_pricing_plans.sql) since neither appears in that
// model — every video is either Free or requires a paid plan. Same
// STRIPE_SECRET_KEY/StripeNotConfiguredError pattern as commerce.ts.
import "server-only";
import type Stripe from "stripe";
import { query, queryOne } from "./db";
import { getStripe } from "./stripeClient";
import { SITE_URL } from "@/lib/utils";

export type PlanId = "premium" | "family" | "business";
export type BillingInterval = "month" | "year";

interface PlanDefinition {
  productName: string;
  currency: string;
  /** Only the intervals this plan actually offers — Family is month-only in the
   * pricing model, Premium/Business offer both with the graphic's own "save 17%". */
  prices: Partial<Record<BillingInterval, number>>;
}

// Minor units (pence), GBP — matching the currency every other real Stripe price in this
// app already uses (Premium's own £9.99/month predates this file's generalisation and is
// unchanged here). The pricing graphic's $ figures are the same numbers (9.99, 99, 29,
// 290); the client hasn't asked for a currency change, so this keeps one consistent
// currency across the whole app rather than introducing a second one from a marketing
// mockup alone.
export const PLAN_CATALOG: Record<PlanId, PlanDefinition> = {
  premium: {
    productName: "Nexus Premium",
    currency: "gbp",
    prices: { month: 999, year: 9900 },
  },
  family: {
    productName: "Nexus Family",
    currency: "gbp",
    prices: { month: 1499 },
  },
  business: {
    productName: "Nexus Business",
    currency: "gbp",
    prices: { month: 2900, year: 29000 },
  },
};

export type CreatePlanCheckoutResult =
  | { outcome: "success"; url: string }
  | { outcome: "already_subscribed" }
  | { outcome: "invalid_interval" };

/** `returnPath` is where the page the request came from wants the checkout to land back
 * on — a plan can be started from more than one place (a video paywall, the plans page,
 * account settings), unlike a video purchase which always returns to that one video. */
export async function createPlanCheckoutSession(
  accountId: string,
  accountEmail: string,
  plan: PlanId,
  interval: BillingInterval,
  returnPath: string,
): Promise<CreatePlanCheckoutResult> {
  const definition = PLAN_CATALOG[plan];
  const unitAmount = definition.prices[interval];
  if (!unitAmount) return { outcome: "invalid_interval" };

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
          currency: definition.currency,
          product_data: { name: definition.productName },
          unit_amount: unitAmount,
          recurring: { interval },
        },
        quantity: 1,
      },
    ],
    // Also set on the subscription itself (not just this session) so a later
    // customer.subscription.updated/deleted webhook — which carries the Subscription
    // object, not the Checkout Session — still has accountId/plan to work with.
    subscription_data: { metadata: { accountId, plan } },
    success_url: `${SITE_URL}${returnPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}${returnPath}?checkout=cancelled`,
    metadata: { accountId, plan },
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
  const plan = (subscription.metadata?.plan as PlanId | undefined) ?? "premium";
  if (!accountId) {
    console.error("Stripe subscription missing accountId metadata", subscription.id);
    return;
  }
  const item = subscription.items.data[0];
  const priceMinor = item?.price.unit_amount ?? PLAN_CATALOG[plan].prices.month ?? 0;
  const currency = (item?.price.currency ?? PLAN_CATALOG[plan].currency).toUpperCase();
  const billingInterval: BillingInterval = item?.price.recurring?.interval === "year" ? "year" : "month";
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  await query(
    `insert into subscriptions (
       account_id, plan, billing_interval, stripe_customer_id, stripe_subscription_id,
       status, price_minor, currency, current_period_end, cancel_at_period_end
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (stripe_subscription_id) do update set
       status = $6, price_minor = $7, currency = $8, current_period_end = $9,
       cancel_at_period_end = $10`,
    [
      accountId,
      plan,
      billingInterval,
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

/** Premium and Family both carry the full content-access benefit in the pricing model
 * ("All Premium benefits" is Family's first line) — Business does not (it's about
 * promotion/campaign tools, not content consumption), so it's deliberately excluded
 * here despite also being a paid plan. */
export async function checkRealContentAccess(accountId: string): Promise<boolean> {
  const row = await queryOne(
    `select 1 from subscriptions where account_id = $1 and plan in ('premium', 'family') and status = 'active'`,
    [accountId],
  );
  return Boolean(row);
}

export async function checkRealPlanActive(accountId: string, plan: PlanId): Promise<boolean> {
  const row = await queryOne(
    `select 1 from subscriptions where account_id = $1 and plan = $2 and status = 'active'`,
    [accountId, plan],
  );
  return Boolean(row);
}

export interface RealSubscriptionRow {
  id: string;
  plan: PlanId;
  billingInterval: BillingInterval;
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
    plan: PlanId;
    billing_interval: BillingInterval;
    status: RealSubscriptionRow["status"];
    price_minor: number;
    currency: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    created_at: string;
  }>(
    `select id, plan, billing_interval, status, price_minor, currency, current_period_end,
            cancel_at_period_end, created_at
     from subscriptions
     where account_id = $1
     order by created_at desc`,
    [accountId],
  );
  return rows.map((row) => ({
    id: row.id,
    plan: row.plan,
    billingInterval: row.billing_interval,
    status: row.status,
    priceMinor: row.price_minor,
    currency: row.currency,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    createdAt: row.created_at,
  }));
}

export interface PlanPurchaseRow {
  id: string;
  planLabel: string;
  amountMinor: number;
  currency: string;
  invoiceNumber: string;
  purchasedAt: string;
  receiptUrl: string | null;
}

/** Real receipts for real plan billing — one row per paid Stripe invoice, not per
 * `subscriptions` row, since a subscription renews monthly/yearly and each renewal is
 * its own payment. Plan/interval come from our own `subscriptions` table (keyed by the
 * invoice's underlying Stripe subscription id) rather than Stripe's line-item pricing
 * shape, which doesn't expose the recurring interval directly. No new schema needed for
 * the receipt itself — Stripe's own hosted invoice already has a real, downloadable
 * receipt (`hosted_invoice_url`). */
export async function listRealPlanPurchases(accountId: string): Promise<PlanPurchaseRow[]> {
  const subs = await query<{
    stripe_customer_id: string;
    stripe_subscription_id: string;
    plan: PlanId;
    billing_interval: BillingInterval;
  }>(
    `select stripe_customer_id, stripe_subscription_id, plan, billing_interval
     from subscriptions where account_id = $1`,
    [accountId],
  );
  if (subs.length === 0) return [];

  const bySubscriptionId = new Map(subs.map((row) => [row.stripe_subscription_id, row]));
  const customerIds = [...new Set(subs.map((row) => row.stripe_customer_id))];

  const rows: PlanPurchaseRow[] = [];
  for (const customerId of customerIds) {
    const invoices = await getStripe().invoices.list({ customer: customerId, limit: 100 });
    for (const invoice of invoices.data) {
      if (invoice.status !== "paid") continue;
      const subscriptionRef = invoice.parent?.subscription_details?.subscription;
      const subscriptionId =
        typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
      const match = subscriptionId ? bySubscriptionId.get(subscriptionId) : undefined;
      const plan = match?.plan ?? "premium";
      const interval = match?.billing_interval ?? "month";
      rows.push({
        id: invoice.id,
        planLabel: `${PLAN_CATALOG[plan].productName} — ${interval === "year" ? "Yearly" : "Monthly"}`,
        amountMinor: invoice.amount_paid,
        currency: invoice.currency.toUpperCase(),
        invoiceNumber: invoice.number ?? invoice.id,
        purchasedAt: new Date(invoice.created * 1000).toISOString(),
        receiptUrl: invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? null,
      });
    }
  }
  return rows.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
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
  const plan = (session.metadata?.plan as PlanId | undefined) ?? "premium";
  const granted = await checkRealPlanActive(requestingAccountId, plan);
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
