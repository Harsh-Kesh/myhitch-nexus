// Server-only. Creator Tipping & Patronage (Fan subscriptions & tips)
// Supports one-time tips and recurring monthly patron contributions for creators.
import "server-only";
import type Stripe from "stripe";
import { query, queryOne } from "./db";
import { getStripe, StripeNotConfiguredError } from "./stripeClient";
import { SITE_URL } from "@/lib/utils";

/** Same flat 10%/90% split used at checkout-creation time (createTipCheckoutSession) —
 * kept as one function so a renewal invoice's split can never drift from the split
 * quoted to the fan when they set up patronage. Not yet wired to the admin-configurable
 * commission_rates table (unlike purchases/rentals/ad revenue) — a known, disclosed gap,
 * not an oversight; tracked as follow-up work, not blocking real money reaching creators. */
function splitTipAmount(amountCents: number): { platformFeeCents: number; creatorAmountCents: number } {
  const platformFeeCents = Math.round(amountCents * 0.1);
  return { platformFeeCents, creatorAmountCents: amountCents - platformFeeCents };
}

export interface CreateTipInput {
  channelId: string;
  accountId?: string | null;
  supporterName: string;
  supporterEmail?: string | null;
  amountCents: number; // minor units e.g. 500 = $5.00 AUD
  currency?: string;
  message?: string | null;
  isPatron?: boolean; // false for one-time tip, true for monthly patron subscription
  successUrl?: string;
  cancelUrl?: string;
}

export type CreateTipResult =
  | { outcome: "success"; url: string; tipId: string }
  | { outcome: "invalid_amount"; reason: string }
  | { outcome: "channel_not_found" }
  | { outcome: "stripe_not_configured"; tipId: string };

export interface CreatorTipRow {
  id: string;
  channel_id: string;
  account_id: string | null;
  supporter_name: string;
  supporter_email: string | null;
  amount_cents: number;
  currency: string;
  message: string | null;
  is_patron: boolean;
  stripe_session_id: string | null;
  status: "pending" | "completed" | "refunded";
  platform_fee_cents: number;
  creator_amount_cents: number;
  created_at: string;
}

export interface CreatorTippingSummary {
  totalTipsCount: number;
  totalTipsCents: number;
  activePatronsCount: number;
  recentTips: CreatorTipRow[];
}

/**
 * Creates a checkout session for tipping or monthly patronage.
 */
export async function createTipCheckoutSession(
  input: CreateTipInput,
): Promise<CreateTipResult> {
  const {
    channelId,
    accountId = null,
    supporterName,
    supporterEmail = null,
    amountCents,
    currency = "aud",
    message = null,
    isPatron = false,
    successUrl,
    cancelUrl,
  } = input;

  if (amountCents < 100) {
    return { outcome: "invalid_amount", reason: "Minimum tip amount is 1.00" };
  }

  // A tip against a channel_id that doesn't exist as a real organization would still
  // charge the fan's real card (when Stripe is configured) and create a row nothing
  // could ever attribute or pay out — checked before any Stripe call, not after. The
  // UUID-shape guard comes first since `organizations.id` is a real uuid column and a
  // non-UUID channelId (e.g. a mock demo channel's "ch_mara"-style id) would otherwise
  // make Postgres throw rather than just report "not found".
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelId);
  const channel = isUuid
    ? await queryOne<{ id: string }>(`select id from organizations where id = $1`, [channelId])
    : null;
  if (!channel) {
    return { outcome: "channel_not_found" };
  }

  const { platformFeeCents, creatorAmountCents } = splitTipAmount(amountCents);

  // Insert pending tip record
  const tip = await queryOne<CreatorTipRow>(
    `insert into creator_tips (
      channel_id, account_id, supporter_name, supporter_email,
      amount_cents, currency, message, is_patron,
      platform_fee_cents, creator_amount_cents, status
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
    returning *`,
    [
      channelId,
      accountId,
      supporterName.trim() || "Anonymous Fan",
      supporterEmail,
      amountCents,
      currency.toLowerCase(),
      message,
      Boolean(isPatron),
      platformFeeCents,
      creatorAmountCents,
    ],
  );

  if (!tip) {
    throw new Error("Failed to record pending tip");
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      // In development / demo when Stripe secret is not present, auto-complete the tip
      await completeTip(tip.id);
      return {
        outcome: "stripe_not_configured",
        tipId: tip.id,
      };
    }
    throw err;
  }

  const defaultSuccess = `${SITE_URL}/channel/${channelId}?tip_success=true`;
  const defaultCancel = `${SITE_URL}/channel/${channelId}?tip_cancelled=true`;

  const session = await stripe.checkout.sessions.create({
    mode: isPatron ? "subscription" : "payment",
    customer_email: supporterEmail ?? undefined,
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: currency.toLowerCase(),
          product_data: {
            name: isPatron ? `Patron Support for Creator` : `Creator Tip`,
            description: message ? `"${message}"` : `Support for ${channelId}`,
          },
          unit_amount: amountCents,
          ...(isPatron ? { recurring: { interval: "month" } } : {}),
        },
        quantity: 1,
      },
    ],
    metadata: {
      nexus_action: "creator_tip",
      tip_id: tip.id,
      channel_id: channelId,
      account_id: accountId ?? "",
      is_patron: isPatron ? "true" : "false",
    },
    // For patron (recurring) tips, the resulting Subscription object needs this same
    // metadata — invoice.paid fires again every renewal month with no reference back to
    // this Checkout Session, only to the Subscription, so recordPatronRenewalFromInvoice()
    // has nothing to key off without it. Mirrors subscriptions.ts's own subscription_data
    // pattern for platform plans.
    ...(isPatron
      ? {
          subscription_data: {
            metadata: {
              nexus_action: "creator_tip",
              channel_id: channelId,
              account_id: accountId ?? "",
            },
          },
        }
      : {}),
    success_url: successUrl ?? defaultSuccess,
    cancel_url: cancelUrl ?? defaultCancel,
  });

  await query(
    `update creator_tips set stripe_session_id = $1 where id = $2`,
    [session.id, tip.id],
  );

  return {
    outcome: "success",
    url: session.url ?? defaultSuccess,
    tipId: tip.id,
  };
}

/**
 * Marks a tip as completed (via webhook or demo auto-completion).
 */
export async function completeTip(
  tipIdOrSessionId: string,
  paymentIntentId?: string | null,
): Promise<CreatorTipRow | null> {
  const tip = await queryOne<CreatorTipRow>(
    `update creator_tips
     set status = 'completed',
         stripe_payment_intent_id = coalesce($2, stripe_payment_intent_id)
     where id::text = $1 or stripe_session_id = $1
     returning *`,
    [tipIdOrSessionId, paymentIntentId ?? null],
  );

  return tip;
}

/**
 * Records a recurring patron payment from a renewal invoice (the 2nd+ month of a patron
 * subscription). The first month is already handled by completeTip() off
 * checkout.session.completed against the pending row createTipCheckoutSession() inserted
 * — this function deliberately skips `billing_reason === 'subscription_create'` (that
 * same first invoice) so it's never double-recorded, and inserts a brand-new completed
 * `creator_tips` row per renewal instead, since each billing cycle is its own real
 * payment that should show up in the creator's tip feed and revenue.
 */
export async function recordPatronRenewalFromInvoice(invoice: Stripe.Invoice): Promise<void> {
  if (invoice.billing_reason === "subscription_create") return;
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
  if (!subscriptionId) return;

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.metadata?.nexus_action !== "creator_tip") return;

  const channelId = subscription.metadata.channel_id;
  const accountId = subscription.metadata.account_id || null;
  if (!channelId) return;

  const amountCents = invoice.amount_paid;
  if (amountCents <= 0) return;
  const { platformFeeCents, creatorAmountCents } = splitTipAmount(amountCents);

  await query(
    `insert into creator_tips (
       channel_id, account_id, supporter_name, supporter_email,
       amount_cents, currency, is_patron, stripe_session_id, stripe_payment_intent_id,
       status, platform_fee_cents, creator_amount_cents
     ) values ($1, $2, 'Patron', null, $3, $4, true, $5, null, 'completed', $6, $7)`,
    [
      channelId,
      accountId,
      amountCents,
      (invoice.currency ?? "aud").toLowerCase(),
      subscriptionId,
      platformFeeCents,
      creatorAmountCents,
    ],
  );
}

/**
 * Lists recent completed tips for a channel.
 */
export async function listChannelTips(
  channelId: string,
  limit = 20,
): Promise<CreatorTipRow[]> {
  const rows = await query<CreatorTipRow>(
    `select * from creator_tips
     where channel_id = $1 and status = 'completed'
     order by created_at desc
     limit $2`,
    [channelId, limit],
  );
  return rows;
}

/**
 * Returns tipping & patronage summary for creator studio.
 */
export async function getCreatorTippingSummary(
  channelId: string,
): Promise<CreatorTippingSummary> {
  const totals = await queryOne<{
    total_count: string;
    total_amount: string;
    patrons_count: string;
  }>(
    `select
       count(*)::text as total_count,
       coalesce(sum(amount_cents), 0)::text as total_amount,
       count(case when is_patron = true then 1 end)::text as patrons_count
     from creator_tips
     where channel_id = $1 and status = 'completed'`,
    [channelId],
  );

  const recentTips = await listChannelTips(channelId, 10);

  return {
    totalTipsCount: Number(totals?.total_count ?? 0),
    totalTipsCents: Number(totals?.total_amount ?? 0),
    activePatronsCount: Number(totals?.patrons_count ?? 0),
    recentTips,
  };
}
