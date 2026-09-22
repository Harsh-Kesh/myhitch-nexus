// Server-only. Creator Tipping & Patronage (Fan subscriptions & tips)
// Supports one-time tips and recurring monthly patron contributions for creators.
import "server-only";
import { query, queryOne } from "./db";
import { getStripe, StripeNotConfiguredError } from "./stripeClient";
import { SITE_URL } from "@/lib/utils";

export interface CreateTipInput {
  channelId: string;
  accountId?: string | null;
  supporterName: string;
  supporterEmail?: string | null;
  amountCents: number; // minor units e.g. 500 = $5.00 / £5.00
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

  // Calculate platform fee (10% platform share, 90% creator share)
  const platformFeeCents = Math.round(amountCents * 0.1);
  const creatorAmountCents = amountCents - platformFeeCents;

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
