// Server-only. Renting/buying a movie in the MYHitch app paid from the customer's MYHitch
// Wallet, for the MYHitch hub (/api/hub/app/wallet/{quote,confirm,release}/). The hub
// (src/routes/siteWallet.js + walletPay.js there) drives it:
//
//  1. quote    Nexus prices it exactly like the app's card checkout (appViewers.ts's
//              resolveAppSale(), same refusals) but creates no PaymentIntent. It answers
//              the total and the business's share — what the creator nets from the same
//              sale by card (commissions.ts's splitVideoSale()) — with the business's
//              Business Portal Stripe connected account (portalAccounts.ts).
//  2. the hub takes the total from the wallet and Transfers the share to that account
//     from the Portal's Stripe platform (where the wallet's money is).
//  3. confirm  Nexus grants the rental/purchase exactly as a paid card checkout does
//              (commerce.ts's grantWalletVideoEntitlement(): same entitlements row,
//              rental window and receipt notification), idempotent on the quote.
//     On any failure the hub undoes 2 and calls release.
//
// The creator has then already been paid their share, so confirm also records it as paid
// out (a `payouts` row, 'wallet:<quote_id>') — the entitlement still counts as their
// revenue, but it doesn't add to the balance they can withdraw through Nexus's own
// Connect payouts (payouts.ts), so they're never paid for the same sale twice.
//
// Refunds go back through the hub (refundWalletEntitlement()): Nexus's Stripe never saw
// this money, so it is never asked to refund it.
//
// State lives in hub_wallet_orders (supabase/migrations/20261022000001_hub_wallet_orders.sql).
// Until that migration is applied every call throws WalletNotReadyError (routes: 503).
import "server-only";
import { NextResponse } from "next/server";
import { query, queryOne, withTransaction, type TransactionClient } from "./db";
import { checkRealEntitlement, grantWalletVideoEntitlement, walletPaymentKey } from "./commerce";
import { splitVideoSale } from "./commissions";
import { resolvePortalConnectedAccount } from "./portalAccounts";
import {
  cancelUnpaidAppSheets,
  checkAppCardPayments,
  entitlementPurchase,
  resolveAppSale,
  type AppEntitlementRow,
  type AppKind,
  type AppPurchase,
  type AppSaleRefusal,
  type AppViewer,
} from "./appViewers";

/** How long the hub may hold a quote (its own cap is 15 minutes too). */
export const WALLET_QUOTE_TTL_SECONDS = 15 * 60;
/** A confirm that started inside the quote's lifetime may land a little after it: the hub
 * checks the expiry before taking the money, then spends some seconds paying the business.
 * Refusing it then would only make the hub undo a good payment. */
const CONFIRM_GRACE_SECONDS = 120;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** hub_wallet_orders doesn't exist yet — the migration hasn't been applied. */
export class WalletNotReadyError extends Error {
  constructor() {
    super("hub_wallet_orders is missing — apply supabase/migrations/20261022000001_hub_wallet_orders.sql.");
    this.name = "WalletNotReadyError";
  }
}

/** What the wallet routes answer while hub_wallet_orders is missing. */
export function walletNotReadyResponse(err: WalletNotReadyError): NextResponse {
  console.error(err.message);
  return NextResponse.json(
    { error: "Paying with the MYHitch Wallet isn't switched on yet.", code: "wallet_not_ready" },
    { status: 503 },
  );
}

function isMissingSchema(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "42P01" || code === "42703"; // undefined_table / undefined_column
}

async function orders<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isMissingSchema(err)) throw new WalletNotReadyError();
    throw err;
  }
}

interface OrderRow {
  quote_id: string;
  account_id: string;
  video_id: string;
  kind: AppKind;
  organization_id: string;
  connected_account_id: string;
  amount_minor: number;
  currency: string;
  platform_fee_minor: number;
  payee_minor: number;
  status: "quoted" | "confirmed" | "released" | "refunded";
  expires_at: string | Date;
  wallet_reference: string | null;
  transfer_ids: string[];
  entitlement_id: string | null;
}

const ORDER_COLUMNS = `quote_id, account_id, video_id, kind, organization_id, connected_account_id, amount_minor,
  currency, platform_fee_minor, payee_minor, status, expires_at, wallet_reference, transfer_ids, entitlement_id`;

// ─── quote ──────────────────────────────────────────────────────────────────

export interface WalletQuote {
  quote_id: string;
  total_cents: number;
  currency: "aud";
  payees: Array<{ connected_account_id: string; amount_cents: number }>;
  expires_at: string;
  title: string;
}

export type WalletQuoteResult =
  | { outcome: "quote"; quote: WalletQuote }
  | AppSaleRefusal
  /** Free, or the business has no (enabled) Business Portal connected account. */
  | { outcome: "wallet_unavailable" }
  /** The Portal couldn't be read — fail closed. */
  | { outcome: "portal_unavailable" };

/** Prices renting/buying `videoId` for the wallet: the same total the card checkout would
 * charge, and the creator's share of it. Nothing is granted or charged. */
export async function createWalletQuote(viewer: AppViewer, videoId: string, kind: AppKind): Promise<WalletQuoteResult> {
  const sale = await resolveAppSale(viewer, videoId, kind);
  if (sale.outcome !== "ok") return sale;
  // Nothing to pay: the card checkout unlocks a free movie at once.
  if (sale.amountMinor <= 0) return { outcome: "wallet_unavailable" };

  const card = await checkAppCardPayments(viewer, sale.movie.id);
  if (card) return { outcome: card };

  const payee = await resolvePortalConnectedAccount(sale.channelId);
  if (!payee.found) {
    return payee.reason === "portal_unavailable" ? { outcome: "portal_unavailable" } : { outcome: "wallet_unavailable" };
  }

  const split = await splitVideoSale(kind, sale.amountMinor);
  const expiresAt = new Date(Date.now() + WALLET_QUOTE_TTL_SECONDS * 1000);
  const row = await orders(() =>
    queryOne<{ quote_id: string }>(
      `insert into hub_wallet_orders (
         account_id, myhitch_user_id, video_id, kind, organization_id, connected_account_id,
         amount_minor, currency, platform_fee_minor, payee_minor, expires_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning quote_id`,
      [
        viewer.accountId,
        viewer.myhitchUserId,
        sale.movie.id,
        kind,
        sale.channelId,
        payee.accountId,
        sale.amountMinor,
        sale.currency,
        split.platformFeeMinor,
        split.creatorNetMinor,
        expiresAt,
      ],
    ),
  );
  if (!row) throw new Error("Could not save the wallet quote.");

  return {
    outcome: "quote",
    quote: {
      quote_id: row.quote_id,
      total_cents: sale.amountMinor,
      currency: "aud",
      payees: [{ connected_account_id: payee.accountId, amount_cents: split.creatorNetMinor }],
      expires_at: expiresAt.toISOString(),
      // The same wording as the card PaymentIntent's description.
      title: `${sale.title} — ${kind === "rent" ? "Rental" : "Purchase"}`,
    },
  };
}

// ─── confirm ────────────────────────────────────────────────────────────────

export interface WalletConfirmInput {
  quoteId: string;
  walletReference: string;
  transferIds: string[];
  amountCents: number;
}

export type WalletConfirmResult =
  | { outcome: "confirmed"; purchase: AppPurchase; walletReference: string; transferIds: string[]; amountCents: number }
  | { outcome: "quote_not_found" }
  | { outcome: "quote_released" }
  | { outcome: "quote_expired" }
  | { outcome: "amount_mismatch"; expectedCents: number }
  | { outcome: "transfers_missing" }
  /** Already confirmed with a different wallet payment. */
  | { outcome: "already_confirmed" }
  /** The customer came to own the movie some other way after the quote (a card payment, another quote). */
  | { outcome: "already_entitled" };

/** The body the hub sends to confirm, checked; or what's wrong with it. */
export function parseWalletConfirm(body: unknown): { input: WalletConfirmInput; error?: undefined } | { input?: undefined; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.quote_id !== "string" || !b.quote_id) return { error: "quote_id is required." };
  if (typeof b.wallet_reference !== "string" || !b.wallet_reference.trim() || b.wallet_reference.length > 200) {
    return { error: "wallet_reference is required." };
  }
  const ids = b.transfer_ids ?? [];
  if (
    !Array.isArray(ids) ||
    ids.length > 50 ||
    !ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= 255)
  ) {
    return { error: "transfer_ids must be a list of Stripe transfer ids." };
  }
  if (typeof b.amount_cents !== "number" || !Number.isSafeInteger(b.amount_cents) || b.amount_cents < 0) {
    return { error: "amount_cents must be a whole number of cents." };
  }
  return {
    input: {
      quoteId: b.quote_id,
      walletReference: b.wallet_reference.trim(),
      transferIds: [...new Set(ids as string[])],
      amountCents: b.amount_cents,
    },
  };
}

type Db = Pick<TransactionClient, "query" | "queryOne">;

/** Grants the order's entitlement, books the creator's share as already paid out and
 * links the two — every step idempotent, so a repeated confirm only reads it back. */
async function completeOrder(db: Db, order: OrderRow): Promise<AppPurchase> {
  await grantWalletVideoEntitlement({
    accountId: order.account_id,
    videoId: order.video_id,
    kind: order.kind,
    amountMinor: order.amount_minor,
    currency: order.currency,
    quoteId: order.quote_id,
  });
  const entitlement = await db.queryOne<AppEntitlementRow>(
    `select id, video_id, kind, status, created_at, expires_at from entitlements
     where stripe_checkout_session_id = $1`,
    [walletPaymentKey(order.quote_id)],
  );
  if (!entitlement) throw new Error(`Wallet order ${order.quote_id} has no entitlement after granting it.`);

  if (order.payee_minor > 0) {
    await db.query(
      `insert into payouts (organization_id, stripe_transfer_id, amount_minor, currency, status)
       values ($1, $2, $3, $4, 'paid')
       on conflict (stripe_transfer_id) do nothing`,
      [order.organization_id, `wallet:${order.quote_id}`, order.payee_minor, order.currency],
    );
  }
  if (order.entitlement_id !== entitlement.id) {
    await db.query(`update hub_wallet_orders set entitlement_id = $2 where quote_id = $1`, [order.quote_id, entitlement.id]);
  }
  return entitlementPurchase(entitlement);
}

function confirmed(order: OrderRow, purchase: AppPurchase): WalletConfirmResult {
  return {
    outcome: "confirmed",
    purchase,
    walletReference: order.wallet_reference ?? "",
    transferIds: order.transfer_ids ?? [],
    amountCents: order.amount_minor,
  };
}

/** The hub has taken the money and paid the business: grant the rental/purchase. */
export async function confirmWalletPayment(viewer: AppViewer, input: WalletConfirmInput): Promise<WalletConfirmResult> {
  if (!UUID_PATTERN.test(input.quoteId)) return { outcome: "quote_not_found" };

  type Step = { done: WalletConfirmResult } | { repeat: OrderRow } | { granted: OrderRow; purchase: AppPurchase };
  const step = await orders(() =>
    withTransaction<Step>(async (tx) => {
      const order = await tx.queryOne<OrderRow>(
        `select ${ORDER_COLUMNS} from hub_wallet_orders where quote_id = $1 for update`,
        [input.quoteId],
      );
      if (!order || order.account_id !== viewer.accountId) return { done: { outcome: "quote_not_found" } };
      if (order.status === "confirmed" || order.status === "refunded") return { repeat: order };
      if (order.status === "released") return { done: { outcome: "quote_released" } };
      if (input.amountCents !== order.amount_minor) {
        return { done: { outcome: "amount_mismatch", expectedCents: order.amount_minor } };
      }
      if (order.payee_minor > 0 && input.transferIds.length === 0) return { done: { outcome: "transfers_missing" } };
      if (new Date(order.expires_at).getTime() + CONFIRM_GRACE_SECONDS * 1000 <= Date.now()) {
        return { done: { outcome: "quote_expired" } };
      }

      // One confirm at a time per customer and movie, so two quotes for the same movie
      // can't both be granted (the second sees the first's entitlement and is refused,
      // and the hub gives that money back).
      await tx.query(`select pg_advisory_xact_lock(hashtext($1))`, [`nexus-wallet:${order.account_id}:${order.video_id}`]);
      const ownGrant = await tx.queryOne<{ id: string }>(
        `select id from entitlements where stripe_checkout_session_id = $1`,
        [walletPaymentKey(order.quote_id)],
      );
      if (!ownGrant && (await checkRealEntitlement(order.account_id, order.video_id)).granted) {
        return { done: { outcome: "already_entitled" } };
      }
      const taken = await tx.queryOne(
        `select 1 from hub_wallet_orders where wallet_reference = $1 and quote_id <> $2`,
        [input.walletReference, order.quote_id],
      );
      if (taken) return { done: { outcome: "already_confirmed" } };

      const updated = await tx.queryOne<OrderRow>(
        `update hub_wallet_orders
         set status = 'confirmed', wallet_reference = $2, transfer_ids = $3, confirmed_at = now()
         where quote_id = $1 and status = 'quoted'
         returning ${ORDER_COLUMNS}`,
        [order.quote_id, input.walletReference, input.transferIds],
      );
      if (!updated) throw new Error(`Wallet order ${order.quote_id} changed while it was locked.`);
      return { granted: updated, purchase: await completeOrder(tx, updated) };
    }),
  );

  if ("done" in step) return step.done;
  if ("repeat" in step) {
    const order = step.repeat;
    if (order.wallet_reference !== input.walletReference) return { outcome: "already_confirmed" };
    return confirmed(order, await orders(() => completeOrder({ query, queryOne }, order)));
  }
  // A card sheet for the same movie left open can no longer be paid as well.
  await cancelUnpaidAppSheets(viewer, step.granted.video_id);
  return confirmed(step.granted, step.purchase);
}

// ─── release ────────────────────────────────────────────────────────────────

export type WalletReleaseResult = { outcome: "released" } | { outcome: "quote_not_found" } | { outcome: "already_confirmed" };

/** The hub backed out (or undid a failed payment): the quote can never be confirmed. */
export async function releaseWalletQuote(viewer: AppViewer, quoteId: string): Promise<WalletReleaseResult> {
  if (!UUID_PATTERN.test(quoteId)) return { outcome: "quote_not_found" };
  return orders(async () => {
    const released = await queryOne<{ quote_id: string }>(
      `update hub_wallet_orders set status = 'released', released_at = now()
       where quote_id = $1 and account_id = $2 and status = 'quoted'
       returning quote_id`,
      [quoteId, viewer.accountId],
    );
    if (released) return { outcome: "released" as const };
    const current = await queryOne<{ status: OrderRow["status"]; account_id: string }>(
      `select status, account_id from hub_wallet_orders where quote_id = $1`,
      [quoteId],
    );
    if (!current || current.account_id !== viewer.accountId) return { outcome: "quote_not_found" as const };
    if (current.status === "released") return { outcome: "released" as const };
    return { outcome: "already_confirmed" as const };
  });
}

// ─── refunds ────────────────────────────────────────────────────────────────

export type WalletRefundResult =
  | { outcome: "refunded"; entitlementId: string; amountMinor: number; walletReference: string }
  | { outcome: "not_found" }
  | { outcome: "already_refunded" }
  /** Paid by card (or free) — not a wallet payment. */
  | { outcome: "not_wallet_paid" }
  /** HUB_URL / HUB_API_KEY aren't set. */
  | { outcome: "hub_not_configured" }
  /** The hub didn't refund it (nothing was marked refunded). */
  | { outcome: "hub_failed"; status: number | null; error: string };

const HUB_REFUND_TIMEOUT_MS = 20_000;

/** Refunds a wallet-paid rental/purchase in full: the hub takes the business's share back
 * (Transfer reversals) and returns the money to the customer's wallet. Nexus's own Stripe
 * is never called. The entitlement is marked refunded only once the hub answers 2xx; the
 * call carries an Idempotency-Key, so retrying after a lost answer refunds once. */
export async function refundWalletEntitlement(entitlementId: string, reason: string): Promise<WalletRefundResult> {
  if (!UUID_PATTERN.test(entitlementId)) return { outcome: "not_found" };
  const entitlement = await queryOne<{ id: string; amount_minor: number; status: string; stripe_checkout_session_id: string }>(
    `select id, amount_minor, status, stripe_checkout_session_id from entitlements where id = $1`,
    [entitlementId],
  );
  if (!entitlement) return { outcome: "not_found" };

  const key = entitlement.stripe_checkout_session_id;
  const keyQuote = key.startsWith("wallet_") ? key.slice("wallet_".length) : null;
  let order: OrderRow | null;
  try {
    order = await queryOne<OrderRow>(
      `select ${ORDER_COLUMNS} from hub_wallet_orders
       where entitlement_id = $1 or quote_id = $2
       limit 1`,
      [entitlement.id, keyQuote && UUID_PATTERN.test(keyQuote) ? keyQuote : null],
    );
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
    if (keyQuote) throw new WalletNotReadyError();
    return { outcome: "not_wallet_paid" };
  }
  if (!order?.wallet_reference) return { outcome: "not_wallet_paid" };
  if (entitlement.status === "refunded" || order.status === "refunded") return { outcome: "already_refunded" };

  const hubUrl = process.env.HUB_URL?.trim().replace(/\/+$/, "");
  const hubKey = process.env.HUB_API_KEY;
  if (!hubUrl || !hubKey) return { outcome: "hub_not_configured" };

  let res: Response;
  try {
    res = await fetch(`${hubUrl}/v1/nexus/wallet-refunds`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": hubKey,
        // The hub answers a repeat of this key with the first refund's result.
        "idempotency-key": `refund-purchase-${entitlement.id}`,
      },
      body: JSON.stringify({
        wallet_reference: order.wallet_reference,
        amount_cents: entitlement.amount_minor,
        reason: reason.slice(0, 500),
        purchase_id: entitlement.id,
      }),
      signal: AbortSignal.timeout(HUB_REFUND_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`Wallet refund of entitlement ${entitlement.id}: the hub didn't answer`, err);
    return { outcome: "hub_failed", status: null, error: "The MYHitch hub didn't answer." };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    const error = typeof body?.error === "string" ? body.error : `The MYHitch hub answered ${res.status}.`;
    console.error(`Wallet refund of entitlement ${entitlement.id} refused by the hub`, res.status, error);
    return { outcome: "hub_failed", status: res.status, error };
  }

  await query(`update entitlements set status = 'refunded' where id = $1`, [entitlement.id]);
  await query(
    `update hub_wallet_orders set status = 'refunded', refunded_at = now(), refund_reason = $2 where quote_id = $1`,
    [order.quote_id, reason.slice(0, 500)],
  );
  return {
    outcome: "refunded",
    entitlementId: entitlement.id,
    amountMinor: entitlement.amount_minor,
    walletReference: order.wallet_reference,
  };
}
