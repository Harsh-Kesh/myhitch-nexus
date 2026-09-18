// Server-only. Real creator payouts via Stripe Connect Express accounts — see the
// migration comment (20260918000003_payouts.sql). Same STRIPE_SECRET_KEY/
// StripeNotConfiguredError pattern as commerce.ts/subscriptions.ts.
import "server-only";
import type Stripe from "stripe";
import { query, queryOne } from "./db";
import { getStripe } from "./stripeClient";
import { computeChannelNetRevenue } from "./commissions";
import { SITE_URL } from "@/lib/utils";

export interface PayoutAccountStatus {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export async function getPayoutAccountStatus(organizationId: string): Promise<PayoutAccountStatus> {
  const row = await queryOne<{
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
  }>(
    `select charges_enabled, payouts_enabled, details_submitted from payout_accounts where organization_id = $1`,
    [organizationId],
  );
  if (!row) return { connected: false, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false };
  return {
    connected: true,
    chargesEnabled: row.charges_enabled,
    payoutsEnabled: row.payouts_enabled,
    detailsSubmitted: row.details_submitted,
  };
}

/** Creates the Express account on first call, reuses it on every later call (a channel
 * gets exactly one) — either way returns a fresh onboarding link, since Account Links
 * expire quickly and a creator may need to resume onboarding more than once. */
export async function createConnectOnboardingLink(
  organizationId: string,
  accountEmail: string,
  returnPath: string,
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

  const link = await getStripe().accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${SITE_URL}${returnPath}?connect=refresh`,
    return_url: `${SITE_URL}${returnPath}?connect=return`,
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

export async function createPayout(organizationId: string, requestedAmountMinor?: number): Promise<CreatePayoutResult> {
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

  return { outcome: "success", amountMinor };
}

export interface PayoutRow {
  id: string;
  amountMinor: number;
  currency: string;
  status: string;
  createdAt: string;
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
