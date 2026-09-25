// Server-only. Real subscription plans — Nexus Premium, Family and Business — per the
// client's pricing model (2026-09-20). Replaces the single hardcoded "Nexus Premium"
// plan; channel memberships and per-video rent/buy/PPV are retired (see this migration's
// own header comment, 20260920000002_pricing_plans.sql) since neither appears in that
// model — every video is either Free or requires a paid plan. Same
// STRIPE_SECRET_KEY/StripeNotConfiguredError pattern as commerce.ts.
import "server-only";
import type Stripe from "stripe";
import { query, queryOne } from "./db";
import { getStripe, StripeNotConfiguredError } from "./stripeClient";
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

// Minor units (cents), AUD — client decision, 2026-09-25: this is an Australian
// platform (real org verification already uses the Australian Business Register/ABN
// lookup), and every price shown anywhere should be AUD, not the GBP this catalog
// originally shipped with. The numeric amounts (9.99, 99, 29, 290) are unchanged — only
// the currency code, matching the pricing page's own real numbers.
export const PLAN_CATALOG: Record<PlanId, PlanDefinition> = {
  premium: {
    productName: "Nexus Premium",
    currency: "aud",
    prices: { month: 999, year: 9900 },
  },
  family: {
    productName: "Nexus Family",
    currency: "aud",
    prices: { month: 1499 },
  },
  business: {
    productName: "Nexus Business",
    currency: "aud",
    prices: { month: 2900, year: 29000 },
  },
};

export type StartOrChangePlanResult =
  | { outcome: "checkout_required"; url: string }
  | { outcome: "changed"; plan: PlanId; currentPeriodEnd: string | null }
  | { outcome: "already_subscribed" }
  | { outcome: "invalid_interval" };

/** A subscription-item update's `price_data.product` takes a real Stripe Product id —
 * unlike a Checkout Session line item, there's no inline `product_data` shorthand for it
 * — so a real plan change needs one stable product per plan to reference. Created once
 * (a fixed, deterministic id per plan) and reused forever; `resource_missing` on the
 * first real change for a given plan is the only time this ever calls
 * `products.create()`. */
async function getOrCreatePlanProduct(plan: PlanId): Promise<string> {
  const productId = `nexus_plan_${plan}`;
  try {
    await getStripe().products.retrieve(productId);
  } catch (err) {
    if ((err as { code?: string }).code !== "resource_missing") throw err;
    await getStripe().products.create({ id: productId, name: PLAN_CATALOG[plan].productName });
  }
  return productId;
}

/** The one place "subscribe" and "change plan" both go through. `returnPath` is where
 * the page the request came from wants a Checkout redirect to land back on — unused for
 * the in-place-change branch, which never redirects at all (the existing subscription's
 * Stripe Customer already has a saved default payment method from its own original
 * Checkout, so a change is charged/credited against that directly). A plan can be
 * started or changed from more than one place (a video paywall, the plans page, account
 * settings). */
export async function startOrChangePlan(
  accountId: string,
  accountEmail: string,
  plan: PlanId,
  interval: BillingInterval,
  returnPath: string,
): Promise<StartOrChangePlanResult> {
  const definition = PLAN_CATALOG[plan];
  const unitAmount = definition.prices[interval];
  if (!unitAmount) return { outcome: "invalid_interval" };

  // Any existing active/past_due row for this account on ANY plan — not just this one.
  // Whether this is a brand-new subscription or a change to one already running hinges
  // on whether the account has a paid subscription at all, never on which plan it
  // happens to be. Found live 2026-09-25: the previous version of this check only looked
  // for an existing row on the SAME plan, so switching Premium -> Family sailed straight
  // through to a brand-new Checkout Session — a second, independent Stripe subscription
  // billing in parallel with the first, instead of replacing it.
  const existing = await queryOne<{
    id: string;
    plan: PlanId;
    billing_interval: BillingInterval;
    stripe_subscription_id: string;
  }>(
    `select id, plan, billing_interval, stripe_subscription_id from subscriptions
     where account_id = $1 and status in ('active', 'past_due') limit 1`,
    [accountId],
  );

  if (existing && existing.plan === plan && existing.billing_interval === interval) {
    return { outcome: "already_subscribed" };
  }

  if (existing) {
    // A real change to an already-running subscription: swap its one line item's price
    // in place (same subscription id, same items[0].id) rather than starting a second
    // Stripe subscription. `always_invoice` settles the prorated difference immediately
    // — charged now for an upgrade, credited now for a downgrade — instead of silently
    // carrying it to the next renewal invoice, so what happened on screen matches what
    // Stripe actually billed right away.
    const stripeSubscription = await getStripe().subscriptions.retrieve(existing.stripe_subscription_id);
    const itemId = stripeSubscription.items.data[0]?.id;
    if (!itemId) throw new Error(`Stripe subscription ${existing.stripe_subscription_id} has no line item.`);
    const productId = await getOrCreatePlanProduct(plan);

    const updated = await getStripe().subscriptions.update(existing.stripe_subscription_id, {
      items: [
        {
          id: itemId,
          price_data: {
            currency: definition.currency,
            product: productId,
            unit_amount: unitAmount,
            recurring: { interval },
          },
        },
      ],
      proration_behavior: "always_invoice",
      metadata: { accountId, plan },
      // "cancel at period end" belongs to the subscription object, not to whichever
      // plan is currently attached to it — since a change re-prices that same
      // subscription rather than replacing it, a pending cancellation from before the
      // change would otherwise silently carry over. Found live 2026-09-25: a client
      // cancelled while on Premium, then changed their mind and switched to Family —
      // the switch went through, but the subscription was still scheduled to end,
      // because nothing had told Stripe otherwise. Choosing to change plans is an
      // unambiguous "I want to keep subscribing" signal, so it clears any pending
      // cancellation as part of the same update.
      cancel_at_period_end: false,
    });
    await upsertSubscriptionFromStripe(updated);
    const item = updated.items.data[0];
    return {
      outcome: "changed",
      plan,
      currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    };
  }

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
  return { outcome: "checkout_required", url: session.url };
}

function mapStripeStatus(status: Stripe.Subscription.Status): "active" | "past_due" | "cancelled" | "incomplete" {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled") return "cancelled";
  return "incomplete";
}

/** Credits real platform-wide plan revenue once per Stripe invoice — the exact mirror of
 * channelMemberships.ts's recordMembershipPaymentFromInvoice(), which only records when
 * the invoice's underlying subscription HAS a channelId (a channel membership); this
 * records when it does NOT (a platform-wide Premium/Family/Business plan). The two
 * functions are always called together from the webhook's invoice.paid handler and are
 * exact complements, so the same invoice is never recorded into both tables. Found live
 * 2026-09-24 while scoping the real admin finance page: this had no counterpart at all
 * before now — real Stripe subscription revenue, the platform's actual primary revenue
 * stream under the six-tier pricing model, was being collected with zero local record of
 * it (getPlatformRevenueSummary() only ever summed entitlements/membership_payments). */
export async function recordSubscriptionPaymentFromInvoice(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  const stripeSubscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
  if (!stripeSubscriptionId) return;

  const subscription = await getStripe().subscriptions.retrieve(stripeSubscriptionId);
  const { accountId, channelId, plan } = subscription.metadata ?? {};
  if (!accountId || channelId) return; // channel membership, or metadata missing — not platform revenue

  await query(
    `insert into subscription_payments (account_id, plan, amount_minor, currency, stripe_invoice_id)
     values ($1, $2, $3, $4, $5)
     on conflict (stripe_invoice_id) do nothing`,
    [accountId, (plan as PlanId | undefined) ?? "premium", invoice.amount_paid, (invoice.currency ?? "aud").toUpperCase(), invoice.id],
  );
}

/** Idempotent upsert keyed on stripe_subscription_id — the webhook's
 * customer.subscription.* handlers and the checkout-return page's verify call can both
 * reach this for the same subscription without creating duplicates, same pattern as
 * commerce.ts's fulfillCheckoutSession(). The `on conflict` clause must set every column
 * this function ever derives from the live Stripe object, `plan`/`billing_interval`
 * included — found live 2026-09-25: it previously omitted both, so startOrChangePlan()'s
 * real update-in-place (which changes exactly those two columns' Stripe-side meaning)
 * updated `price_minor` correctly but left `plan` stuck on the account's old plan. The
 * UI kept reading that stale `plan`, so it looked like the change silently failed and
 * kept offering the same "upgrade" action — which re-ran the real Stripe update against
 * a subscription already on the new price, correctly producing a $0 proration each time
 * (never a double charge, just a confusing stream of $0 invoices). */
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
       plan = $2, billing_interval = $3, status = $6, price_minor = $7, currency = $8,
       current_period_end = $9, cancel_at_period_end = $10`,
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
  // limit 1 — queryOne() throws if a query returns more than one row, and nothing in the
  // schema stops an account from ending up with two simultaneously 'active' rows (e.g. a
  // Stripe webhook race during an upgrade); this only ever cared about existence. Found
  // live: a real account with two active rows 500'd every download/content-access check.
  const row = await queryOne(
    `select 1 from subscriptions where account_id = $1 and plan in ('premium', 'family') and status = 'active' limit 1`,
    [accountId],
  );
  return Boolean(row);
}

export async function checkRealPlanActive(accountId: string, plan: PlanId): Promise<boolean> {
  const row = await queryOne(
    `select 1 from subscriptions where account_id = $1 and plan = $2 and status = 'active' limit 1`,
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
    // Best-effort per customer — one bad/non-Stripe customer id (e.g. a manually seeded
    // demo row) shouldn't 500 the whole purchases page over its "Receipt" column.
    let invoices: Stripe.ApiList<Stripe.Invoice>;
    try {
      invoices = await getStripe().invoices.list({ customer: customerId, limit: 100 });
    } catch (err) {
      if (err instanceof StripeNotConfiguredError) return [];
      console.error("Failed to list Stripe invoices for customer", customerId, err);
      continue;
    }
    for (const invoice of invoices.data) {
      if (invoice.status !== "paid") continue;
      // A $0 invoice isn't a purchase — under this pricing model (no trials, no
      // coupons) the only way one exists is a redundant plan-change update that landed
      // on a price already in effect (see upsertSubscriptionFromStripe()'s header for
      // the bug that used to make that easy to trigger by accident). Real money moved
      // zero times; nothing here is worth a receipt.
      if (invoice.amount_paid === 0) continue;
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
