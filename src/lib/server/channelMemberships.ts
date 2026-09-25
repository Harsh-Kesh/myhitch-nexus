// Server-only. Channel memberships are retired (2026-09-20 pricing-model rebuild —
// see subscriptions.ts's header comment): no creator can offer one and no viewer can
// join one any more, so the settings UI, the tier-pricing API and the join-checkout
// API that used to live here (and in this file, before 2026-09-21) are gone. What's
// left is deliberately read-only: an existing member who already paid for one keeps
// the access and the revenue they already have, via commerce.ts's checkRealEntitlement
// and this file's own webhook handler. Both channel_membership_tiers and
// membership_payments stay in the schema so that history stays queryable.
import "server-only";
import type Stripe from "stripe";
import { query, queryOne } from "./db";
import { getStripe } from "./stripeClient";

export async function checkRealChannelMembership(accountId: string, channelId: string): Promise<boolean> {
  // limit 1 — same reasoning as checkRealContentAccess() in subscriptions.ts: this is a
  // pure existence check, and nothing guarantees only one 'active' row per account/channel.
  const row = await queryOne(
    `select 1 from subscriptions where account_id = $1 and channel_id = $2 and status = 'active' limit 1`,
    [accountId, channelId],
  );
  return Boolean(row);
}

/** Credits a channel's membership revenue once per Stripe invoice, called from the
 * webhook's invoice.paid handler. A subscription renews on its own schedule outside any
 * one checkout — this is the only place recurring membership revenue is recorded, unlike
 * a one-time entitlement which is created once at checkout. Looks the metadata up from
 * Stripe directly (rather than joining our own subscriptions row) so this never depends
 * on customer.subscription.created having already been processed for the same
 * subscription — invoice.paid and that event aren't guaranteed to arrive in order. */
export async function recordMembershipPaymentFromInvoice(invoice: Stripe.Invoice): Promise<void> {
  // This Stripe API version moved the subscription reference off the invoice itself and
  // onto invoice.parent.subscription_details — invoice.subscription no longer exists.
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  const stripeSubscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
  if (!stripeSubscriptionId) return;

  const subscription = await getStripe().subscriptions.retrieve(stripeSubscriptionId);
  const { accountId, channelId } = subscription.metadata ?? {};
  if (!accountId || !channelId) return; // platform Premium, or metadata missing — not channel revenue

  await query(
    `insert into membership_payments (account_id, channel_id, amount_minor, currency, stripe_invoice_id)
     values ($1, $2, $3, $4, $5)
     on conflict (stripe_invoice_id) do nothing`,
    [accountId, channelId, invoice.amount_paid, (invoice.currency ?? "aud").toUpperCase(), invoice.id],
  );
}
