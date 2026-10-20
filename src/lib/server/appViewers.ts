// Server-only. Nexus for viewers in the MYHitch mobile app: its movie catalogue, renting
// and buying with Stripe's native PaymentSheet, the viewer's rentals/purchases and their
// playback links — served to the MYHitch hub at /api/hub/app/... (the app calls
// /v1/nexus/app/...; contract: docs/api/nexus.md in the app repo).
//
// Everything reuses the website's own logic: the catalogue (catalogue.ts's
// listVideosForSale()), pricing and every refusal (commerce.ts's resolveVideoSale() —
// the creator's video_pricing, own video, already entitled), entitlements
// (fulfillPaymentIntent() writes the same `entitlements` rows Checkout does, so an app
// purchase shows on the website too) and playback (playbackAuthorization.ts).
//
// Who the viewer is: the hub's X-MYHitch-User. Nexus accounts are keyed by email
// (accounts.email is unique), so the app customer gets the Nexus account with their
// MYHitch email — created as a plain viewer the first time — and signing in to the
// website with that email shows the same rentals and purchases.
//
// Paying: a PaymentIntent (not Checkout) on a Stripe Customer tagged
// metadata.accountId, carrying the same { accountId, videoId, kind } metadata Checkout
// sessions do plus nexus_action = "app_video". It's fulfilled by the webhook
// (payment_intent.succeeded) and, so the app's read-back right after the sheet doesn't
// wait on webhook delivery, by GET purchases itself (reconcileAppPayments()), which also
// expires sheets left unpaid for 30 minutes.
import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { query, queryOne } from "./db";
import { hubKeyMatches, readHubAppUser } from "./hubAuth";
import { getVideoCreditsAndGenres, listVideosForSale, type VideoSummary } from "./catalogue";
import {
  APP_VIDEO_PAYMENT_ACTION,
  fulfillPaymentIntent,
  getStripe,
  grantFreeVideoEntitlement,
  resolveVideoSale,
  StripeNotConfiguredError,
} from "./commerce";
import { absoluteUrl } from "@/lib/utils";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The Stripe API version the app's Stripe SDK speaks — an ephemeral key must be minted
 * for the client's version, not this server's pinned one. */
export const APP_STRIPE_API_VERSION = "2024-06-20";

/** An unpaid sheet is given up (its PaymentIntent cancelled) after this long. */
const PENDING_TTL_SECONDS = 30 * 60;
/** How far back GET purchases looks for the viewer's in-flight app payments. */
const RECENT_PAYMENTS_SECONDS = 24 * 3600;
const UNPAID_STATUSES = new Set<Stripe.PaymentIntent.Status>([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
]);

export type AppKind = "rent" | "buy";

// ─── the hub, and who the viewer is ─────────────────────────────────────────

/** Null when the caller is the hub (its X-Api-Key), else the response to send. */
export function requireHub(request: NextRequest): NextResponse | null {
  // Not switched on: the hub turns this into the app's preview, like a missing route.
  if (!process.env.HUB_API_KEY) {
    return NextResponse.json({ error: "This isn't available yet.", code: "not_live" }, { status: 503 });
  }
  const key = request.headers.get("x-api-key");
  if (!key) return NextResponse.json({ error: "Missing X-Api-Key." }, { status: 401 });
  if (!hubKeyMatches(key)) return NextResponse.json({ error: "Invalid X-Api-Key." }, { status: 403 });
  return null;
}

export interface AppViewer {
  accountId: string;
  email: string;
  name: string;
  myhitchUserId: string;
}

/** The signed-in app customer's Nexus account (found by email, or created as a viewer),
 * or the response to send instead. */
export async function requireHubViewer(
  request: NextRequest,
): Promise<{ viewer: AppViewer; response?: undefined } | { viewer?: undefined; response: NextResponse }> {
  const keyError = requireHub(request);
  if (keyError) return { response: keyError };
  const user = readHubAppUser(request.headers.get("x-myhitch-user"));
  if (!user) {
    return { response: NextResponse.json({ error: "Log in to MYHitch first." }, { status: 401 }) };
  }
  if (!user.email) {
    return {
      response: NextResponse.json(
        { error: "Add an email address to your MYHitch account to rent or buy movies." },
        { status: 403 },
      ),
    };
  }
  const name = user.name || user.email.split("@")[0];

  let account = await queryOne<{ id: string; status: string }>(
    `select id, status from accounts where lower(email) = $1 limit 1`,
    [user.email],
  );
  if (!account) {
    account = await queryOne<{ id: string; status: string }>(
      `insert into accounts (email, full_name) values ($1, $2)
       on conflict (email) do nothing
       returning id, status`,
      [user.email, name],
    );
    if (account) {
      await query(
        `insert into account_roles (account_id, role, verified)
         values ($1, 'viewer', true)
         on conflict (account_id, role) do nothing`,
        [account.id],
      );
    } else {
      // Created by a parallel request a moment ago.
      account = await queryOne<{ id: string; status: string }>(
        `select id, status from accounts where lower(email) = $1 limit 1`,
        [user.email],
      );
    }
  }
  if (!account) {
    return { response: NextResponse.json({ error: "Could not open your Nexus account." }, { status: 500 }) };
  }
  if (account.status === "suspended" || account.status === "closed") {
    return {
      response: NextResponse.json({ error: "This Nexus account can't be used right now." }, { status: 403 }),
    };
  }
  return { viewer: { accountId: account.id, email: user.email, name, myhitchUserId: user.id } };
}

// ─── movies ─────────────────────────────────────────────────────────────────

export interface AppMovie {
  id: string;
  title: string;
  genre: string;
  year: number | null;
  durationMinutes: number;
  rating: number;
  director: string;
  cast: string[];
  synopsis: string;
  posterUrl: string | null;
  rentPrice: number | null;
  buyPrice: number | null;
  currency: "AUD";
  rentalHours: number;
}

const GENRES: Array<[string, RegExp]> = [
  ["sciFi", /sci[\s_-]?fi|science[\s_-]?fiction/i],
  ["action", /action|thriller|adventure/i],
  ["comedy", /comed|funny/i],
  ["drama", /drama/i],
];

/** The app knows action / drama / sciFi / comedy; anything else is passed through as the
 * first category (the app shows it as a drama). */
function genreOf(hints: string[], contentType: string): string {
  for (const hint of hints) {
    for (const [genre, pattern] of GENRES) if (pattern.test(hint)) return genre;
  }
  return hints[0] ?? contentType;
}

function yearOf(...values: unknown[]): number | null {
  for (const value of values) {
    if (!value) continue;
    // pg hands timestamptz back as a Date, `date` as "YYYY-MM-DD" (db.ts).
    const year = new Date(value as string | Date).getUTCFullYear();
    if (Number.isFinite(year)) return year;
  }
  return null;
}

/** A price the app can show and charge: offered by the creator, set, and in AUD (the
 * app's only currency — a price in another currency isn't offered in the app). */
function appPrice(offered: boolean, price: { amount: number; currency: string } | null): number | null {
  if (!offered || !price || price.currency.toUpperCase() !== "AUD") return null;
  return price.amount / 100;
}

function toAppMovie(video: VideoSummary, extras: { credits: Array<{ role: string; name: string }>; genreHints: string[] } | undefined): AppMovie | null {
  const models = video.pricing.accessModels;
  const rentPrice = appPrice(models.includes("rent"), video.pricing.rentPrice);
  const buyPrice = appPrice(models.includes("buy"), video.pricing.buyPrice);
  if (rentPrice == null && buyPrice == null) return null;
  const credits = extras?.credits ?? [];
  return {
    id: video.id,
    title: video.title,
    genre: genreOf(extras?.genreHints ?? [], video.contentType),
    year: yearOf(video.releaseDate, video.publishedAt),
    durationMinutes: Math.round((video.durationSeconds ?? 0) / 60),
    // Nexus ratings are 1-5 stars; the app shows out of 10.
    rating: Math.round((video.ratingAverage || 0) * 20) / 10,
    director: credits.find((c) => /director/i.test(c.role))?.name ?? "",
    cast: credits.filter((c) => /cast|actor|actress|star/i.test(c.role)).map((c) => c.name).slice(0, 12),
    synopsis: video.synopsis ?? "",
    posterUrl: absoluteUrl(video.thumbnailUrl) ?? null,
    rentPrice,
    buyPrice,
    currency: "AUD",
    rentalHours: video.pricing.rentalWindowHours ?? 48,
  };
}

async function toAppMovies(videos: VideoSummary[]): Promise<AppMovie[]> {
  const extras = await getVideoCreditsAndGenres(videos.map((v) => v.id));
  return videos.map((v) => toAppMovie(v, extras.get(v.id))).filter((m): m is AppMovie => m != null);
}

/** Every movie that can be rented or bought in the app, newest first. */
export async function listAppMovies(): Promise<AppMovie[]> {
  return toAppMovies(await listVideosForSale({ limit: 200 }));
}

/** One movie, or null when it doesn't exist or can't be rented or bought. */
export async function getAppMovie(id: string): Promise<AppMovie | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const [movie] = await toAppMovies(await listVideosForSale({ ids: [id], limit: 1 }));
  return movie ?? null;
}

// ─── renting / buying ───────────────────────────────────────────────────────

/** The Stripe Customer this viewer pays as (tagged metadata.accountId, found by email —
 * the same tagging the app's plan subscriptions use), or null. */
async function findViewerCustomer(viewer: AppViewer): Promise<string | null> {
  const customers = await getStripe().customers.list({ email: viewer.email, limit: 100 });
  return customers.data.find((c) => c.metadata?.accountId === viewer.accountId)?.id ?? null;
}

async function ensureViewerCustomer(viewer: AppViewer): Promise<string> {
  const existing = await findViewerCustomer(viewer);
  if (existing) return existing;
  const created = await getStripe().customers.create({
    email: viewer.email,
    name: viewer.name,
    metadata: { accountId: viewer.accountId, myhitchUserId: viewer.myhitchUserId },
  });
  return created.id;
}

async function recentAppPayments(customerId: string, accountId: string): Promise<Stripe.PaymentIntent[]> {
  const list = await getStripe().paymentIntents.list({
    customer: customerId,
    limit: 50,
    created: { gte: Math.floor(Date.now() / 1000) - RECENT_PAYMENTS_SECONDS },
  });
  return list.data.filter(
    (pi) => pi.metadata?.nexus_action === APP_VIDEO_PAYMENT_ACTION && pi.metadata?.accountId === accountId,
  );
}

async function cancelQuietly(id: string): Promise<void> {
  try {
    await getStripe().paymentIntents.cancel(id);
  } catch (err) {
    console.error("Could not cancel an unpaid app payment", id, err);
  }
}

export type AppCheckoutResult =
  | { outcome: "payment"; clientSecret: string; customerId: string; ephemeralKey: string; paymentIntentId: string }
  | { outcome: "free" }
  | { outcome: "not_found" }
  | { outcome: "not_for_sale" }
  | { outcome: "own_video" }
  | { outcome: "already_entitled" }
  | { outcome: "payment_in_progress" };

/** Starts renting/buying `videoId` for the viewer: prices it from the creator's own
 * video_pricing (never from the app), refuses what the website refuses, then creates a
 * fresh PaymentIntent — cancelling any earlier sheet for the same movie that was never
 * paid — plus an ephemeral key for the PaymentSheet. */
export async function startAppCheckout(viewer: AppViewer, videoId: string, kind: AppKind): Promise<AppCheckoutResult> {
  const movie = await getAppMovie(videoId);
  if (!movie) return { outcome: "not_found" };

  const sale = await resolveVideoSale(viewer.accountId, movie.id, kind);
  if (sale.outcome === "video_not_found") return { outcome: "not_found" };
  if (sale.outcome === "own_video") return { outcome: "own_video" };
  if (sale.outcome === "already_entitled") return { outcome: "already_entitled" };
  if (sale.outcome !== "ok") return { outcome: "not_for_sale" };
  // What the app shows is what's charged: only an AUD price is offered in the app.
  if (sale.currency.toUpperCase() !== "AUD" || (kind === "rent" ? movie.rentPrice : movie.buyPrice) == null) {
    return { outcome: "not_for_sale" };
  }

  if (sale.amountMinor === 0) {
    await grantFreeVideoEntitlement(viewer.accountId, movie.id, kind, `free_${randomUUID()}`);
    return { outcome: "free" };
  }

  const stripe = getStripe();
  const customerId = await ensureViewerCustomer(viewer);
  for (const pi of await recentAppPayments(customerId, viewer.accountId)) {
    if (pi.metadata.videoId !== movie.id) continue;
    if (pi.status === "succeeded") {
      // Paid, but neither the webhook nor a read-back has recorded it yet.
      if (await fulfillPaymentIntent(pi)) return { outcome: "already_entitled" };
    } else if (pi.status === "processing") {
      return { outcome: "payment_in_progress" };
    } else if (UNPAID_STATUSES.has(pi.status)) {
      await cancelQuietly(pi.id);
    }
  }

  const intent = await stripe.paymentIntents.create({
    amount: sale.amountMinor,
    currency: "aud",
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    description: `${sale.title} — ${kind === "rent" ? "Rental" : "Purchase"}`,
    metadata: {
      nexus_action: APP_VIDEO_PAYMENT_ACTION,
      accountId: viewer.accountId,
      videoId: movie.id,
      kind,
      myhitchUserId: viewer.myhitchUserId,
    },
  });
  if (!intent.client_secret) throw new Error("Stripe did not return a PaymentIntent client secret.");
  const key = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: APP_STRIPE_API_VERSION });
  if (!key.secret) throw new Error("Stripe returned an ephemeral key without a secret.");
  return {
    outcome: "payment",
    clientSecret: intent.client_secret,
    customerId,
    ephemeralKey: key.secret,
    paymentIntentId: intent.id,
  };
}

// ─── purchases ──────────────────────────────────────────────────────────────

export interface AppPurchase {
  id: string;
  movieId: string;
  kind: AppKind;
  status: "pending" | "paid" | "failed" | "refunded";
  purchasedAt: string;
  expiresAt: string | null;
}

function intentPurchase(pi: Stripe.PaymentIntent, status: "pending" | "failed"): AppPurchase {
  return {
    id: pi.id,
    movieId: pi.metadata.videoId ?? "",
    kind: pi.metadata.kind === "buy" ? "buy" : "rent",
    status,
    purchasedAt: new Date(pi.created * 1000).toISOString(),
    expiresAt: null,
  };
}

/** The viewer's recent app payments that haven't become an entitlement: a paid one is
 * fulfilled here and then (as an entitlement) not returned; an unpaid one comes back
 * `pending`, or — left unpaid past 30 minutes, its PaymentIntent cancelled — `failed`. */
async function reconcileAppPayments(viewer: AppViewer): Promise<AppPurchase[]> {
  const customerId = await findViewerCustomer(viewer);
  if (!customerId) return [];
  const now = Math.floor(Date.now() / 1000);
  const out: AppPurchase[] = [];
  for (const pi of await recentAppPayments(customerId, viewer.accountId)) {
    if (pi.status === "succeeded") {
      await fulfillPaymentIntent(pi);
    } else if (pi.status === "canceled") {
      out.push(intentPurchase(pi, "failed"));
    } else if (UNPAID_STATUSES.has(pi.status) && now - pi.created > PENDING_TTL_SECONDS) {
      await cancelQuietly(pi.id);
      out.push(intentPurchase(pi, "failed"));
    } else {
      out.push(intentPurchase(pi, "pending"));
    }
  }
  return out;
}

/** The viewer's rentals and purchases (expired rentals included, as `paid` with their
 * past expiresAt), newest first, with in-flight app payments ahead of them. */
export async function listAppPurchases(viewer: AppViewer): Promise<AppPurchase[]> {
  let inFlight: AppPurchase[] = [];
  try {
    inFlight = await reconcileAppPayments(viewer);
  } catch (err) {
    // Best effort — the webhook still records every payment; the list itself must load.
    if (!(err instanceof StripeNotConfiguredError)) {
      console.error("Could not read the viewer's app payments from Stripe", err);
    }
  }

  await query(
    `update entitlements set status = 'expired'
     where status = 'active' and kind = 'rent' and expires_at <= now() and account_id = $1`,
    [viewer.accountId],
  );
  const rows = await query<{
    id: string;
    video_id: string;
    kind: AppKind;
    status: string;
    created_at: string | Date;
    expires_at: string | Date | null;
  }>(
    `select id, video_id, kind, status, created_at, expires_at from entitlements
     where account_id = $1 and kind in ('rent', 'buy')
     order by created_at desc`,
    [viewer.accountId],
  );
  return [
    ...inFlight,
    ...rows.map((row) => ({
      id: row.id,
      movieId: row.video_id,
      kind: row.kind,
      status: row.status === "refunded" ? ("refunded" as const) : ("paid" as const),
      purchasedAt: new Date(row.created_at).toISOString(),
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    })),
  ];
}
