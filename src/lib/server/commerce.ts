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
import type Stripe from "stripe";
import { query, queryOne } from "./db";
import { getStripe, StripeNotConfiguredError } from "./stripeClient";
import { checkRealContentAccess, listRealPlanPurchases } from "./subscriptions";
import { checkRealChannelMembership } from "./channelMemberships";
import { computeChannelNetRevenue, type RevenueEntryKind } from "./commissions";
import { SITE_URL } from "@/lib/utils";

export { StripeNotConfiguredError, getStripe };

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
  kind?: CheckoutKind | "subscription" | "membership";
  expiresAt?: string;
  /** True only when the sole reason access was denied is the active profile's maturity
   * rating — lets the client show "not appropriate for this profile" rather than a
   * generic paywall, matching the age-gate UX getEntitlement() already had client-side. */
  ageGated?: boolean;
}

const AGE_RATING_WEIGHT: Record<string, number> = { U: 0, ALL: 0, PG: 1, "12": 2, TEEN: 2, "15": 3, "18": 4, "18+": 4 };

/** Real, server-side counterpart of the age-gate check getEntitlement() (mock-api) used
 * to perform entirely client-side — found live as a critical gap: the PIN/profile state
 * it read was plain browser state, so nothing stopped a signed-in account from granting
 * itself access to an over-rated video regardless of the active kids/teen profile.
 * `profileId`, if given, is ownership-checked against `accountId` before its rating is
 * trusted — a client can never claim someone else's profile. Originally only reachable
 * for a purchased/subscription-gated video via checkRealEntitlement() below; also called
 * directly now from playbackAuthorization.ts's authorizeVideoAccess() for free/ad-
 * supported content, closing the free-content half of the same gap (SRS FR-6.4.6). */
export async function isBlockedByProfileAgeRating(
  accountId: string,
  videoId: string,
  profileId: string | null | undefined,
): Promise<boolean> {
  if (!profileId) return false;
  const profile = await queryOne<{ maturity_rating: string }>(
    `select maturity_rating from account_profiles where id = $1 and account_id = $2`,
    [profileId, accountId],
  );
  if (!profile) return false; // not this account's profile — ignore rather than trust it
  const rights = await queryOne<{ age_rating: string | null }>(
    `select age_rating from video_rights where video_id = $1`,
    [videoId],
  );
  const videoWeight = AGE_RATING_WEIGHT[rights?.age_rating ?? "U"] ?? 0;
  const maxWeight = AGE_RATING_WEIGHT[profile.maturity_rating] ?? 4;
  return videoWeight > maxWeight;
}

/** A subscription-gated video (access_models includes "subscription") needs no per-video
 * entitlement row at all — an active Nexus Premium subscription covers every one of
 * them, and a membership-gated video is covered the same way by an active membership on
 * that specific channel. Checked as a fallback, after the per-video entitlement lookup
 * finds nothing, so a video that's both individually owned *and* subscription/membership-
 * gated still reports the more specific reason. */
export async function checkRealEntitlement(
  accountId: string,
  videoId: string,
  profileId?: string | null,
): Promise<RealEntitlementResult> {
  // Lazily expires a rental on read rather than needing a scheduled job — same pattern
  // as videoPublishing.ts's activateScheduledVideos(), correct at this app's read-heavy
  // scale.
  await query(
    `update entitlements set status = 'expired'
     where status = 'active' and kind = 'rent' and expires_at <= now()
       and account_id = $1 and video_id = $2`,
    [accountId, videoId],
  );

  if (await isBlockedByProfileAgeRating(accountId, videoId, profileId)) {
    return { granted: false, ageGated: true };
  }

  const row = await queryOne<{ kind: CheckoutKind; expires_at: string | null }>(
    `select kind, expires_at from entitlements
     where account_id = $1 and video_id = $2 and status in ('completed', 'active')
     order by created_at desc limit 1`,
    [accountId, videoId],
  );
  if (row) return { granted: true, kind: row.kind, expiresAt: row.expires_at ?? undefined };

  const priceRow = await queryOne<{ access_models: string[]; channel_id: string }>(
    `select p.access_models, v.channel_id from video_pricing p
     join videos v on v.id = p.video_id
     where p.video_id = $1`,
    [videoId],
  );
  if (priceRow?.access_models.includes("subscription") && (await checkRealContentAccess(accountId))) {
    return { granted: true, kind: "subscription" };
  }
  // Channel memberships are retired going forward (no new checkout is offered — see
  // subscriptions.ts's header comment) but an existing member who already paid for one
  // keeps the access they bought; this is the only place that still checks it.
  if (
    priceRow?.access_models.includes("membership") &&
    (await checkRealChannelMembership(accountId, priceRow.channel_id))
  ) {
    return { granted: true, kind: "membership" };
  }

  return { granted: false };
}

export interface PurchaseRow {
  id: string;
  /** Null for a plan purchase (a subscription invoice) — nothing to link to. */
  videoId: string | null;
  videoTitle: string;
  kind: CheckoutKind | "subscription";
  amountMinor: number;
  currency: string;
  status: string;
  invoiceNumber: string;
  purchasedAt: string;
  expiresAt: string | null;
  /** Stripe's own hosted receipt/invoice page — null where none exists (e.g. a Stripe
   * API lookup failure shouldn't ever break the purchases list itself). */
  receiptUrl: string | null;
}

/** Best-effort — a receipt lookup failing (rate limit, a payment intent that never got
 * a charge) shouldn't take down the whole purchases list over one row's "Receipt"
 * button. */
async function getEntitlementReceiptUrl(paymentIntentId: string | null): Promise<string | null> {
  if (!paymentIntentId) return null;
  try {
    const intent = await getStripe().paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    });
    const charge = intent.latest_charge;
    return typeof charge === "string" ? null : (charge?.receipt_url ?? null);
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) return null;
    console.error("Failed to fetch entitlement receipt", paymentIntentId, err);
    return null;
  }
}

/** Merges legacy per-video entitlements (buy/rent/ppv — retired, kept for historical
 * accuracy, see 20260920000002_pricing_plans.sql) with real plan-subscription invoices
 * (the only purchase kind a real account can make going forward under the current
 * pricing model), newest first. */
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
    stripe_payment_intent_id: string | null;
  }>(
    `select e.id, e.video_id, v.title, e.kind, e.amount_minor, e.currency, e.status,
            e.invoice_number, e.created_at, e.expires_at, e.stripe_payment_intent_id
     from entitlements e
     join videos v on v.id = e.video_id
     where e.account_id = $1
     order by e.created_at desc`,
    [accountId],
  );
  const entitlementRows: PurchaseRow[] = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      videoId: row.video_id,
      videoTitle: row.title,
      kind: row.kind,
      amountMinor: row.amount_minor,
      currency: row.currency,
      status: row.status,
      invoiceNumber: row.invoice_number,
      // node-pg returns timestamptz columns as Date objects, not strings, despite this
      // row type's own annotation — normalized here since the merged sort below (with
      // listRealPlanPurchases()'s rows, which are real ISO strings) calls .localeCompare()
      // on this field directly, which throws on a raw Date once 2+ rows exist to compare.
      purchasedAt: new Date(row.created_at).toISOString(),
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      receiptUrl: await getEntitlementReceiptUrl(row.stripe_payment_intent_id),
    })),
  );

  const planRows: PurchaseRow[] = (await listRealPlanPurchases(accountId)).map((row) => ({
    id: row.id,
    videoId: null,
    videoTitle: row.planLabel,
    kind: "subscription",
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: "completed",
    invoiceNumber: row.invoiceNumber,
    purchasedAt: row.purchasedAt,
    expiresAt: null,
    receiptUrl: row.receiptUrl,
  }));

  return [...entitlementRows, ...planRows].sort((a, b) =>
    b.purchasedAt.localeCompare(a.purchasedAt),
  );
}

export interface RealRevenueTransaction {
  id: string;
  date: string;
  description: string;
  kind: "rental" | "purchase" | "ppv" | "membership" | "ad" | "tip";
  grossMinor: number;
  feeMinor: number;
  netMinor: number;
}

export interface RealRevenueSummary {
  currency: string;
  /** Net (creator-share) lifetime total — "earnings", not raw revenue. */
  lifetimeMinor: number;
  lifetimeGrossMinor: number;
  /** Still gross per stream — this is about revenue *composition*, not earnings. */
  byStream: Array<{ label: string; valueMinor: number; share: number }>;
  transactions: RealRevenueTransaction[];
}

const REVENUE_KIND_LABEL: Record<RevenueEntryKind, RealRevenueTransaction["kind"]> = {
  buy: "purchase",
  rent: "rental",
  ppv: "ppv",
  membership: "membership",
  ad: "ad",
  tip: "tip",
};
const REVENUE_STREAM_LABEL: Record<RevenueEntryKind, string> = {
  buy: "Purchases",
  rent: "Rentals",
  ppv: "Pay-per-view",
  membership: "Memberships",
  ad: "Advertising",
  tip: "Fan tips",
};

/** Real gross-and-net revenue for a channel — the full "revenue ledger with
 * configurable commission" bullet, now that commission rates are real too (see
 * commissions.ts). This intentionally sums raw minor units across currencies without
 * conversion — a known simplification that's harmless while every real transaction so
 * far has been the same currency, and a real fix (live FX rates) is its own scoped
 * piece of work, not incidental to this one. */
export async function getRealRevenueSummary(channelId: string): Promise<RealRevenueSummary> {
  const { entries, grossMinor, netMinor, currency } = await computeChannelNetRevenue(channelId);

  const byKind = new Map<RevenueEntryKind, number>();
  for (const entry of entries) {
    byKind.set(entry.kind, (byKind.get(entry.kind) ?? 0) + entry.grossMinor);
  }
  const byStream = Array.from(byKind.entries()).map(([kind, valueMinor]) => ({
    label: REVENUE_STREAM_LABEL[kind],
    valueMinor,
    share: grossMinor > 0 ? Math.round((valueMinor / grossMinor) * 100) : 0,
  }));

  const transactions: RealRevenueTransaction[] = entries.map((entry) => ({
    id: entry.id,
    date: entry.createdAt,
    description: `${entry.title} — ${REVENUE_KIND_LABEL[entry.kind]}`,
    kind: REVENUE_KIND_LABEL[entry.kind],
    grossMinor: entry.grossMinor,
    feeMinor: entry.feeMinor,
    netMinor: entry.netMinor,
  }));

  return { currency, lifetimeMinor: netMinor, lifetimeGrossMinor: grossMinor, byStream, transactions };
}
