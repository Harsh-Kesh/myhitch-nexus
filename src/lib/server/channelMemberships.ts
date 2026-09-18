// Server-only. Real channel memberships — the piece deliberately left out of the
// platform-Premium subscriptions slice (see 20260918000002_subscriptions.sql's header
// comment). One membership tier per channel: a real creator-set price replacing the
// mock's hardcoded "From £4.00/month", and a real Stripe subscription checkout scoped
// to that one channel via subscription_data.metadata.channelId.
import "server-only";
import type Stripe from "stripe";
import { query, queryOne } from "./db";
import { getStripe } from "./stripeClient";
import { SITE_URL } from "@/lib/utils";

// Same constraint as commerce.ts's own STRIPE_SUPPORTED_CURRENCIES — kept as a separate
// copy rather than a shared import to avoid coupling this file to commerce.ts's module
// graph for three lines of data.
const STRIPE_SUPPORTED_CURRENCIES = new Set(["gbp", "usd", "eur"]);

export interface MembershipTier {
  channelId: string;
  priceMinor: number;
  currency: string;
  benefits: string[];
  isEnabled: boolean;
}

export async function getMembershipTier(channelId: string): Promise<MembershipTier | null> {
  const row = await queryOne<{
    channel_id: string;
    price_minor: number;
    currency: string;
    benefits: string[];
    is_enabled: boolean;
  }>(
    `select channel_id, price_minor, currency, benefits, is_enabled
     from channel_membership_tiers where channel_id = $1`,
    [channelId],
  );
  if (!row) return null;
  return {
    channelId: row.channel_id,
    priceMinor: row.price_minor,
    currency: row.currency,
    benefits: row.benefits,
    isEnabled: row.is_enabled,
  };
}

export interface SetMembershipTierInput {
  priceMinor: number;
  currency: string;
  benefits: string[];
  isEnabled: boolean;
}

export type SetMembershipTierResult =
  | { outcome: "success"; tier: MembershipTier }
  | { outcome: "invalid_price" };

export async function setMembershipTier(
  channelId: string,
  input: SetMembershipTierInput,
): Promise<SetMembershipTierResult> {
  if (!Number.isInteger(input.priceMinor) || input.priceMinor <= 0) {
    return { outcome: "invalid_price" };
  }
  const row = await queryOne<{
    channel_id: string;
    price_minor: number;
    currency: string;
    benefits: string[];
    is_enabled: boolean;
  }>(
    `insert into channel_membership_tiers (channel_id, price_minor, currency, benefits, is_enabled)
     values ($1, $2, $3, $4, $5)
     on conflict (channel_id) do update set
       price_minor = $2, currency = $3, benefits = $4, is_enabled = $5
     returning channel_id, price_minor, currency, benefits, is_enabled`,
    [channelId, input.priceMinor, input.currency, input.benefits, input.isEnabled],
  );
  return {
    outcome: "success",
    tier: {
      channelId: row!.channel_id,
      priceMinor: row!.price_minor,
      currency: row!.currency,
      benefits: row!.benefits,
      isEnabled: row!.is_enabled,
    },
  };
}

export async function checkRealChannelMembership(accountId: string, channelId: string): Promise<boolean> {
  const row = await queryOne(
    `select 1 from subscriptions where account_id = $1 and channel_id = $2 and status = 'active'`,
    [accountId, channelId],
  );
  return Boolean(row);
}

export type CreateChannelMembershipCheckoutResult =
  | { outcome: "success"; url: string }
  | { outcome: "not_available" }
  | { outcome: "own_channel" }
  | { outcome: "already_member" }
  | { outcome: "unsupported_currency"; currency: string };

/** `returnPath` mirrors createPremiumCheckoutSession()'s own parameter — a membership
 * can be started from a video page or (once channel pages grow a "Join" entry point)
 * elsewhere, so the return destination isn't hardcoded. */
export async function createChannelMembershipCheckoutSession(
  accountId: string,
  accountEmail: string,
  channelId: string,
  returnPath: string,
): Promise<CreateChannelMembershipCheckoutResult> {
  const tier = await getMembershipTier(channelId);
  if (!tier || !tier.isEnabled) return { outcome: "not_available" };
  if (!STRIPE_SUPPORTED_CURRENCIES.has(tier.currency.toLowerCase())) {
    return { outcome: "unsupported_currency", currency: tier.currency };
  }

  const isOwnChannel = await queryOne(
    `select 1 from memberships where account_id = $1 and organization_id = $2`,
    [accountId, channelId],
  );
  if (isOwnChannel) return { outcome: "own_channel" };
  if (await checkRealChannelMembership(accountId, channelId)) return { outcome: "already_member" };

  const channelRow = await queryOne<{ name: string }>(`select name from organizations where id = $1`, [channelId]);

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: accountEmail,
    line_items: [
      {
        price_data: {
          currency: tier.currency.toLowerCase(),
          product_data: { name: `${channelRow?.name ?? "Channel"} membership` },
          unit_amount: tier.priceMinor,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    // Also set on the subscription itself, same reasoning as createPremiumCheckoutSession
    // — the invoice.paid/customer.subscription.* webhooks carry the Subscription object,
    // not this Checkout Session, so they need accountId/channelId there too.
    subscription_data: { metadata: { accountId, channelId } },
    success_url: `${SITE_URL}${returnPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}${returnPath}?checkout=cancelled`,
    metadata: { accountId, channelId },
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  return { outcome: "success", url: session.url };
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
    [accountId, channelId, invoice.amount_paid, (invoice.currency ?? "gbp").toUpperCase(), invoice.id],
  );
}
