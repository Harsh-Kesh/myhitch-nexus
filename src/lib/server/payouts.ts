// Server-only. Real creator payouts via Stripe Connect Express accounts — see the
// migration comment (20260918000003_payouts.sql). Same STRIPE_SECRET_KEY/
// StripeNotConfiguredError pattern as commerce.ts/subscriptions.ts.
import "server-only";
import type Stripe from "stripe";
import { query, queryOne } from "./db";
import { getStripe } from "./stripeClient";
import { computeChannelNetRevenue } from "./commissions";
import { recordAudit } from "./moderation";
import { SITE_URL } from "@/lib/utils";

export interface PayoutAccountStatus {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export async function getPayoutAccountStatus(organizationId: string): Promise<PayoutAccountStatus> {
  const row = await queryOne<{
    stripe_account_id: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
  }>(
    `select stripe_account_id, charges_enabled, payouts_enabled, details_submitted from payout_accounts where organization_id = $1`,
    [organizationId],
  );
  if (!row) return { connected: false, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false };

  let chargesEnabled = row.charges_enabled;
  let payoutsEnabled = row.payouts_enabled;
  let detailsSubmitted = row.details_submitted;

  // Active sync with Stripe if connected so user landing back sees live verification state instantly
  if (row.stripe_account_id) {
    try {
      const stripeAcc = await getStripe().accounts.retrieve(row.stripe_account_id);
      chargesEnabled = stripeAcc.charges_enabled;
      payoutsEnabled = stripeAcc.payouts_enabled;
      detailsSubmitted = stripeAcc.details_submitted;
      await upsertPayoutAccountFromStripe(stripeAcc);
    } catch {
      // Ignore Stripe retrieval errors if offline or mock
    }
  }

  return {
    connected: true,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
  };
}

/** Creates the Express account on first call, reuses it on every later call (a channel
 * gets exactly one) — either way returns a fresh onboarding link, since Account Links
 * expire quickly and a creator may need to resume onboarding more than once. */
export async function createConnectOnboardingLink(
  organizationId: string,
  accountEmail: string,
  returnPath: string,
  baseUrl?: string,
): Promise<string> {
  let stripeAccountId = (
    await queryOne<{ stripe_account_id: string }>(
      `select stripe_account_id from payout_accounts where organization_id = $1`,
      [organizationId],
    )
  )?.stripe_account_id;

  if (!stripeAccountId) {
    const account = await getStripe().accounts.create({
      type: "express",
      email: accountEmail,
      capabilities: { transfers: { requested: true } },
    });
    stripeAccountId = account.id;
    await query(
      `insert into payout_accounts (organization_id, stripe_account_id) values ($1, $2)`,
      [organizationId, stripeAccountId],
    );
  }

  const origin = baseUrl || SITE_URL;
  const link = await getStripe().accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${origin}${returnPath}?connect=refresh`,
    return_url: `${origin}${returnPath}?connect=return`,
    type: "account_onboarding",
  });
  return link.url;
}

/** Webhook target for account.updated — the one real signal that onboarding actually
 * finished (Stripe's own hosted flow, never our own form) and this channel can now
 * actually receive a transfer. */
export async function upsertPayoutAccountFromStripe(account: Stripe.Account): Promise<void> {
  await query(
    `update payout_accounts set
       charges_enabled = $2, payouts_enabled = $3, details_submitted = $4
     where stripe_account_id = $1`,
    [account.id, account.charges_enabled, account.payouts_enabled, account.details_submitted],
  );
}

/** Real net (creator-share, after commission) revenue minus what's already been
 * transferred out — computeChannelNetRevenue() is the one place gross-to-net
 * commission math happens, shared with the revenue-ledger's own summary, so the two can
 * never disagree about how much a channel has actually earned. */
export async function getAvailableBalance(organizationId: string): Promise<{ amountMinor: number; currency: string }> {
  const { netMinor, currency } = await computeChannelNetRevenue(organizationId);
  const paidRow = await queryOne<{ total: string }>(
    `select coalesce(sum(amount_minor), 0) as total from payouts where organization_id = $1 and status = 'paid'`,
    [organizationId],
  );
  const paid = Number(paidRow?.total ?? 0);
  return { amountMinor: Math.max(netMinor - paid, 0), currency };
}

export type CreatePayoutResult =
  | { outcome: "success"; amountMinor: number }
  | { outcome: "not_onboarded" }
  | { outcome: "insufficient_balance" }
  | { outcome: "amount_too_small" };

const MINIMUM_PAYOUT_MINOR = 5000; // £50.00 — matches the mock's own minimum

export async function createPayout(
  organizationId: string,
  actor: { id: string; name: string },
  requestedAmountMinor?: number,
): Promise<CreatePayoutResult> {
  const account = await queryOne<{ stripe_account_id: string; payouts_enabled: boolean }>(
    `select stripe_account_id, payouts_enabled from payout_accounts where organization_id = $1`,
    [organizationId],
  );
  if (!account?.payouts_enabled) return { outcome: "not_onboarded" };

  const { amountMinor: available, currency } = await getAvailableBalance(organizationId);
  const amountMinor = requestedAmountMinor ?? available;
  if (amountMinor < MINIMUM_PAYOUT_MINOR) return { outcome: "amount_too_small" };
  if (amountMinor > available) return { outcome: "insufficient_balance" };

  const transfer = await getStripe().transfers.create({
    amount: amountMinor,
    currency: currency.toLowerCase(),
    destination: account.stripe_account_id,
  });

  await query(
    `insert into payouts (organization_id, stripe_transfer_id, amount_minor, currency, status)
     values ($1, $2, $3, $4, 'paid')`,
    [organizationId, transfer.id, amountMinor, currency],
  );

  await recordAudit({
    actorAccountId: actor.id,
    actorName: actor.name,
    actorRole: "creator",
    action: "payout.created",
    targetType: "organization",
    targetId: organizationId,
    reason: `Withdrew ${(amountMinor / 100).toFixed(2)} ${currency} via Stripe Connect (transfer ${transfer.id}).`,
    severity: "notice",
  });

  return { outcome: "success", amountMinor };
}

export interface PayoutRow {
  id: string;
  amountMinor: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface OrgPayoutRow {
  organizationId: string;
  organizationName: string;
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  grossMinor: number;
  availableMinor: number;
  paidMinor: number;
  lastPayoutAt: string | null;
}

/** Platform-wide, one-query counterpart of getAvailableBalance() — that function (and
 * computeChannelNetRevenue() underneath it) is 4 queries per organization with no batch
 * variant, so looping it over every org would be 4×N round trips. Same LEFT JOIN LATERAL
 * rate-resolution shape as commissions.ts's getPlatformRevenueSummary(), applied per-row
 * instead of collapsed to one grand total. Backs the real admin finance page. Only
 * returns organizations with real revenue or a connected payout account — every other
 * organization has nothing to show here. */
export async function listPlatformPayouts(): Promise<OrgPayoutRow[]> {
  const rows = await query<{
    organization_id: string;
    organization_name: string;
    connected: boolean;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
    gross_minor: string;
    net_minor: string;
    paid_minor: string;
    last_payout_at: string | null;
  }>(
    `select
       o.id as organization_id,
       o.name as organization_name,
       (pa.stripe_account_id is not null) as connected,
       coalesce(pa.charges_enabled, false) as charges_enabled,
       coalesce(pa.payouts_enabled, false) as payouts_enabled,
       coalesce(pa.details_submitted, false) as details_submitted,
       coalesce(rev.gross_minor, 0) as gross_minor,
       coalesce(rev.net_minor, 0) as net_minor,
       coalesce(paid.paid_minor, 0) as paid_minor,
       paid.last_payout_at
     from organizations o
     left join payout_accounts pa on pa.organization_id = o.id
     left join lateral (
       select
         coalesce(sum(x.amount_minor), 0) as gross_minor,
         coalesce(sum(x.amount_minor - round(x.amount_minor * x.pct / 100.0)), 0) as net_minor
       from (
         select e.amount_minor, coalesce(cr.platform_share_pct, 0) as pct
         from entitlements e
         join videos v on v.id = e.video_id
         left join lateral (
           select platform_share_pct from commission_rates
           where scope = (case when e.kind = 'ppv' then 'ppv' else 'purchase_rental' end)
             and effective_from <= e.created_at
           order by effective_from desc limit 1
         ) cr on true
         where v.channel_id = o.id
         union all
         select mp.amount_minor, coalesce(cr.platform_share_pct, 0) as pct
         from membership_payments mp
         left join lateral (
           select platform_share_pct from commission_rates
           where scope = 'membership' and effective_from <= mp.created_at
           order by effective_from desc limit 1
         ) cr on true
         where mp.channel_id = o.id
         union all
         -- Already split at write time — pct derived from the stored platform_fee_minor
         -- so it reproduces exactly, same reasoning as commissions.ts's trend query.
         select ai.cost_minor as amount_minor,
           case when ai.cost_minor > 0 then ai.platform_fee_minor * 100.0 / ai.cost_minor else 0 end as pct
         from ad_impressions ai
         where ai.channel_id = o.id
         union all
         -- creator_tips.channel_id is text (not a hard FK — see tipping.ts's own note on
         -- why), hence the explicit cast against o.id here.
         select ct.amount_cents as amount_minor,
           case when ct.amount_cents > 0 then ct.platform_fee_cents * 100.0 / ct.amount_cents else 0 end as pct
         from creator_tips ct
         where ct.status = 'completed' and ct.channel_id = o.id::text
       ) x
     ) rev on true
     left join lateral (
       select coalesce(sum(amount_minor), 0) as paid_minor, max(created_at) as last_payout_at
       from payouts where organization_id = o.id and status = 'paid'
     ) paid on true
     where coalesce(rev.gross_minor, 0) > 0 or pa.stripe_account_id is not null
     order by rev.net_minor desc nulls last`,
  );

  return rows.map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    connected: row.connected,
    chargesEnabled: row.charges_enabled,
    payoutsEnabled: row.payouts_enabled,
    detailsSubmitted: row.details_submitted,
    grossMinor: Number(row.gross_minor),
    availableMinor: Math.max(Number(row.net_minor) - Number(row.paid_minor), 0),
    paidMinor: Number(row.paid_minor),
    lastPayoutAt: row.last_payout_at,
  }));
}

export async function listPayouts(organizationId: string): Promise<PayoutRow[]> {
  const rows = await query<{ id: string; amount_minor: number; currency: string; status: string; created_at: string }>(
    `select id, amount_minor, currency, status, created_at from payouts where organization_id = $1 order by created_at desc`,
    [organizationId],
  );
  return rows.map((row) => ({
    id: row.id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
  }));
}
