// Server-only. Real commerce, first slice — Stripe Checkout for buying/renting/PPV-
// unlocking a single video, docs/DEVELOPMENT-PLAN.md's P3. See the migration comment
// (20260918000001_entitlements.sql) for what's deliberately out of scope.
//
// Requires STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET for the webhook route) in the
// environment — neither exists yet as of this slice landing (confirmed: zero Stripe
// config anywhere). Every function here is buildable and typecheckable against that
// absence today, same as the Auth0 lib files were before tenant access existed; getStripe()
// throws a clear, distinguishable error so routes can return a real "not configured yet"
// response instead of a bare 500 until real keys land.
import "server-only";
import Stripe from "stripe";
import { query, queryOne } from "./db";
import { SITE_URL } from "@/lib/utils";

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe is not configured (missing STRIPE_SECRET_KEY).");
    this.name = "StripeNotConfiguredError";
  }
}

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeNotConfiguredError();
  stripeClient = new Stripe(key);
  return stripeClient;
}

export type CheckoutKind = "buy" | "rent" | "ppv";

interface VideoPriceRow {
  channel_id: string;
  title: string;
  access_models: string[];
  rent_price_minor: number | null;
  rent_price_currency: string | null;
  buy_price_minor: number | null;
  buy_price_currency: string | null;
  ppv_price_minor: number | null;
  ppv_price_currency: string | null;
  rental_window_hours: number | null;
}

async function getVideoPriceRow(videoId: string): Promise<VideoPriceRow | null> {
  return queryOne<VideoPriceRow>(
    `select v.channel_id, v.title, p.access_models, p.rent_price_minor, p.rent_price_currency,
            p.buy_price_minor, p.buy_price_currency, p.ppv_price_minor, p.ppv_price_currency,
            p.rental_window_hours
     from videos v
     join video_pricing p on p.video_id = v.id
     where v.id = $1`,
    [videoId],
  );
}

function priceFor(row: VideoPriceRow, kind: CheckoutKind): { amountMinor: number; currency: string } | null {
  if (kind === "buy" && row.buy_price_minor != null) {
    return { amountMinor: row.buy_price_minor, currency: row.buy_price_currency ?? "GBP" };
  }
  if (kind === "rent" && row.rent_price_minor != null) {
    return { amountMinor: row.rent_price_minor, currency: row.rent_price_currency ?? "GBP" };
  }
  if (kind === "ppv" && row.ppv_price_minor != null) {
    return { amountMinor: row.ppv_price_minor, currency: row.ppv_price_currency ?? "GBP" };
  }
  return null;
}

// Stripe's supported-currency list is a real constraint (LKR, one of the four
// currencies this app otherwise models, isn't on it) — surfaced as a clear outcome
// rather than an opaque Stripe API error reaching the checkout route.
const STRIPE_SUPPORTED_CURRENCIES = new Set(["gbp", "usd", "eur"]);

export type CreateCheckoutSessionResult =
  | { outcome: "success"; url: string }
  | { outcome: "video_not_found" }
  | { outcome: "not_for_sale" }
  | { outcome: "already_entitled" }
  | { outcome: "own_video" }
  | { outcome: "unsupported_currency"; currency: string };

export async function createCheckoutSession(
  accountId: string,
  videoId: string,
  kind: CheckoutKind,
): Promise<CreateCheckoutSessionResult> {
  const row = await getVideoPriceRow(videoId);
  if (!row) return { outcome: "video_not_found" };
  if (row.channel_id) {
    const membership = await queryOne(
      `select 1 from memberships where account_id = $1 and organization_id = $2`,
      [accountId, row.channel_id],
    );
    if (membership) return { outcome: "own_video" };
  }
  if (!row.access_models.includes(kind)) {
    return { outcome: "not_for_sale" };
  }
  const price = priceFor(row, kind);
  if (!price) return { outcome: "not_for_sale" };
  if (!STRIPE_SUPPORTED_CURRENCIES.has(price.currency.toLowerCase())) {
    return { outcome: "unsupported_currency", currency: price.currency };
  }

  const existing = await checkRealEntitlement(accountId, videoId);
  if (existing.granted) return { outcome: "already_entitled" };

  const kindLabel = kind === "buy" ? "Purchase" : kind === "rent" ? "Rental" : "Pay-per-view access";
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: price.currency.toLowerCase(),
          product_data: { name: `${row.title} — ${kindLabel}` },
          unit_amount: price.amountMinor,
        },
        quantity: 1,
      },
    ],
    // SITE_URL, never request.nextUrl.origin — behind Railway's proxy that resolved to
    // an internal container address (localhost:8080) rather than the public domain,
    // found by actually completing a real test-mode payment and landing on a dead link.
    success_url: `${SITE_URL}/video/${videoId}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/video/${videoId}/?checkout=cancelled`,
    metadata: { accountId, videoId, kind },
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  return { outcome: "success", url: session.url };
}

/** Idempotent — both the webhook and the redirect page's own verify call reach this for
 * the same session, by design (the webhook is the source of truth; verify-on-redirect is
 * a UX nicety so it feels instant without waiting on webhook delivery, and works even
 * before a webhook endpoint is configured in the Stripe dashboard). Whichever runs first
 * wins; entitlements.stripe_checkout_session_id's unique constraint makes the loser a
 * no-op rather than a duplicate entitlement. */
export async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid") return;
  const { accountId, videoId, kind } = session.metadata as {
    accountId?: string;
    videoId?: string;
    kind?: CheckoutKind;
  };
  if (!accountId || !videoId || !kind) {
    console.error("Stripe checkout session missing required metadata", session.id);
    return;
  }

  const row = await getVideoPriceRow(videoId);
  const windowHours = row?.rental_window_hours ?? 48;
  const expiresAt = kind === "rent" ? new Date(Date.now() + windowHours * 3_600_000) : null;
  const invoiceRow = await queryOne<{ n: number }>(`select nextval('invoice_number_seq') as n`);
  const invoiceNumber = `NX-${new Date().getFullYear()}-${String(invoiceRow!.n).padStart(6, "0")}`;

  await query(
    `insert into entitlements (
       account_id, video_id, kind, amount_minor, currency, status, invoice_number,
       stripe_checkout_session_id, stripe_payment_intent_id, expires_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (stripe_checkout_session_id) do nothing`,
    [
      accountId,
      videoId,
      kind,
      session.amount_total ?? 0,
      (session.currency ?? "gbp").toUpperCase(),
      kind === "rent" ? "active" : "completed",
      invoiceNumber,
      session.id,
      typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
      expiresAt,
    ],
  );
}

export type VerifyCheckoutSessionResult = { granted: boolean } | { outcome: "not_your_session" };

/** `requestingAccountId` must match the session's own metadata — without this check,
 * a guessed/leaked session id (cryptographically random, but still) could disclose
 * another account's purchase outcome for a video, even though it can never grant the
 * caller access to it. */
export async function verifyCheckoutSession(
  sessionId: string,
  requestingAccountId: string,
): Promise<VerifyCheckoutSessionResult> {
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  const videoId = session.metadata?.videoId;
  const accountId = session.metadata?.accountId;
  if (!videoId || !accountId) return { granted: false };
  if (accountId !== requestingAccountId) return { outcome: "not_your_session" };

  await fulfillCheckoutSession(session);
  return checkRealEntitlement(accountId, videoId);
}

export interface RealEntitlementResult {
  granted: boolean;
  kind?: CheckoutKind;
  expiresAt?: string;
}

export async function checkRealEntitlement(accountId: string, videoId: string): Promise<RealEntitlementResult> {
  // Lazily expires a rental on read rather than needing a scheduled job — same pattern
  // as videoPublishing.ts's activateScheduledVideos(), correct at this app's read-heavy
  // scale.
  await query(
    `update entitlements set status = 'expired'
     where status = 'active' and kind = 'rent' and expires_at <= now()
       and account_id = $1 and video_id = $2`,
    [accountId, videoId],
  );
  const row = await queryOne<{ kind: CheckoutKind; expires_at: string | null }>(
    `select kind, expires_at from entitlements
     where account_id = $1 and video_id = $2 and status in ('completed', 'active')
     order by created_at desc limit 1`,
    [accountId, videoId],
  );
  if (!row) return { granted: false };
  return { granted: true, kind: row.kind, expiresAt: row.expires_at ?? undefined };
}

export interface PurchaseRow {
  id: string;
  videoId: string;
  videoTitle: string;
  kind: CheckoutKind;
  amountMinor: number;
  currency: string;
  status: string;
  invoiceNumber: string;
  purchasedAt: string;
  expiresAt: string | null;
}

export async function listRealPurchases(accountId: string): Promise<PurchaseRow[]> {
  await query(
    `update entitlements set status = 'expired'
     where status = 'active' and kind = 'rent' and expires_at <= now() and account_id = $1`,
    [accountId],
  );
  const rows = await query<{
    id: string;
    video_id: string;
    title: string;
    kind: CheckoutKind;
    amount_minor: number;
    currency: string;
    status: string;
    invoice_number: string;
    created_at: string;
    expires_at: string | null;
  }>(
    `select e.id, e.video_id, v.title, e.kind, e.amount_minor, e.currency, e.status,
            e.invoice_number, e.created_at, e.expires_at
     from entitlements e
     join videos v on v.id = e.video_id
     where e.account_id = $1
     order by e.created_at desc`,
    [accountId],
  );
  return rows.map((row) => ({
    id: row.id,
    videoId: row.video_id,
    videoTitle: row.title,
    kind: row.kind,
    amountMinor: row.amount_minor,
    currency: row.currency,
    status: row.status,
    invoiceNumber: row.invoice_number,
    purchasedAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

export { getStripe };
