/* =========================================================================
   MYHitch Nexus — mock API
   -------------------------------------------------------------------------
   Every function here is async and typed exactly as the eventual HTTP client
   would be. Components never touch ./store or ./data directly — they call
   these functions through the React Query hooks in ./hooks.ts.

   To go live: replace each body with a fetch() to the matching endpoint. The
   signatures and return types are the contract.
   ========================================================================= */

import { sleep } from "@/lib/utils";
import { buildAdminTrend, buildCampaignSeries, buildCreatorAnalytics, buildRevenueSummary } from "./data/analytics";
import { NOW, daysAhead } from "./data/videos";
import { nextId, persistLogin, recordAudit, store } from "./store";
import type {
  AdminCase,
  AdminDashboardSummary,
  AdminUserRow,
  AnalyticsRange,
  AppNotification,
  AuditLogEntry,
  BulkImportRow,
  Campaign,
  CampaignStatus,
  Category,
  Channel,
  ChatMessage,
  Comment,
  ContentStatus,
  ContentType,
  CreatorAnalytics,
  Entitlement,
  FeaturedContent,
  Lead,
  LiveEvent,
  MagazineArticle,
  ModerationAction,
  Money,
  ModerationItem,
  Organisation,
  PlatformConfigTables,
  Playlist,
  Poll,
  ProductLink,
  PurchaseRecord,
  Rating,
  RevenueSummary,
  SearchFilters,
  SearchResult,
  Series,
  SponsorshipListing,
  SponsorshipRewardType,
  Subscription,
  ThumbnailSuggestion,
  UploadSession,
  User,
  Video,
  VideoDraft,
  WatchProgress,
} from "./types";

/** Simulated network latency. Kept short so the UI stays pleasant to click. */
const LATENCY = { fast: 90, normal: 220, slow: 480 } as const;

async function latency(kind: keyof typeof LATENCY = "normal") {
  await sleep(LATENCY[kind]);
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/* ============================ Discovery ================================= */

// Live 2026-09-15 — real Postgres via GET /api/home/, fully replacing the mock version
// (no id to branch on, unlike getVideo/getChannel — this is a wholesale swap, same as
// getChannels()/searchVideos() before it). Personalizes "Continue watching" and "From
// channels you follow" for a signed-in real account server-side; a guest gets every
// other rail with those two simply omitted. See catalogue.ts's getFeaturedRails() for
// the query-by-query breakdown, including why "hero" is most-viewed rather than an
// editorial pick (no curated-featured flag exists in the real schema).
export async function getFeaturedContent(): Promise<FeaturedContent> {
  const res = await fetch("/api/home/");
  if (!res.ok) {
    throw new Error(`GET /api/home failed with ${res.status}`);
  }
  return (await res.json()) as FeaturedContent;
}

// Real Postgres rows use fresh uuids; every id/slug this mock module generates itself
// (store.videos, store.channels — "vid_xxx"/"ch_xxx") never looks like one. Route on
// that shape rather than trying real-then-catch-404, because the two "not found"
// reasons are different: a uuid genuinely missing from Postgres is a real 404, while a
// mock-shaped id is a caller from a page that hasn't been migrated to real data yet
// (the home rails, the vertical category pages, etc. — see
// docs/DEVELOPMENT-PLAN.md's P1 entry) and should still work against the mock store
// exactly as before. Remove this the day every caller of getVideo/getChannel/
// getChannelVideos has switched to real ids — at that point one branch of each function
// below is permanently dead code, not a decision to revisit.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function looksLikeRealId(id: string): boolean {
  return UUID_PATTERN.test(id);
}

export async function searchVideos(filters: SearchFilters = {}): Promise<SearchResult> {
  // Live 2026-09-14 — real Typesense-backed faceted search via GET /api/videos/. Page/
  // pageSize (this function's own contract) translate to limit/offset (the REST route's
  // convention) here, at the one boundary that needs to know about both.
  //
  // One disclosed, deliberate behaviour difference from the mock: the mock includes
  // "restricted"-status videos in search results alongside "published" ones; the real
  // index only ever contains "published" rows (scripts/index-catalogue.mjs). Being more
  // conservative about what counts as publicly discoverable is the safer default where
  // the two disagree, not an oversight — revisit once "restricted" has a real access
  // policy behind it rather than just a status label.
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 24;

  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.contentTypes?.length) params.set("contentTypes", filters.contentTypes.join(","));
  if (filters.categoryIds?.length) params.set("categoryIds", filters.categoryIds.join(","));
  if (filters.languages?.length) params.set("languages", filters.languages.join(","));
  if (filters.countries?.length) params.set("countries", filters.countries.join(","));
  if (filters.accessModels?.length) params.set("accessModels", filters.accessModels.join(","));
  if (filters.ageRatings?.length) params.set("ageRatings", filters.ageRatings.join(","));
  if (filters.minDurationSeconds != null) params.set("minDurationSeconds", String(filters.minDurationSeconds));
  if (filters.maxDurationSeconds != null) params.set("maxDurationSeconds", String(filters.maxDurationSeconds));
  if (filters.releaseYearFrom != null) params.set("releaseYearFrom", String(filters.releaseYearFrom));
  if (filters.releaseYearTo != null) params.set("releaseYearTo", String(filters.releaseYearTo));
  if (filters.hasSubtitles) params.set("hasSubtitles", "true");
  if (filters.freeOnly) params.set("freeOnly", "true");
  if (filters.channelId) params.set("channelId", filters.channelId);
  // "relevance" (the mock's default) has no real sort_by equivalent — Typesense's own
  // text-relevance ranking applies automatically when there's a query and no explicit
  // sort is sent, which is exactly the same behaviour.
  if (filters.sort && filters.sort !== "relevance") params.set("sort", filters.sort);
  params.set("limit", String(pageSize));
  params.set("offset", String((page - 1) * pageSize));

  const res = await fetch(`/api/videos/?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`GET /api/videos failed with ${res.status}`);
  }
  const data = (await res.json()) as {
    items: Video[];
    total: number;
    facets: SearchResult["facets"];
  };

  return { items: data.items, total: data.total, page, pageSize, facets: data.facets };
}

export async function getVideo(id: string): Promise<Video | null> {
  // Live 2026-09-14 for real ids only — see looksLikeRealId's comment above for why
  // this function is still two-branch. Real Postgres via GET /api/videos/{id}/,
  // matching by id or slug exactly like the mock branch below does. Video's full field
  // set (subtitles, audio tracks, qualities, complete pricing, rights, engagement
  // counters, series/season/episode as of 2026-09-17) is now at parity with the real
  // schema — the counters are a seeded snapshot from this same mock dataset, not yet
  // live-computed by a real analytics pipeline (SRS §6.9), and affiliateLinks is the
  // one still-unmodelled field (see docs/DEVELOPMENT-PLAN.md P1 entry for why).
  if (looksLikeRealId(id)) {
    const res = await fetch(`/api/videos/${encodeURIComponent(id)}/`);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`GET /api/videos/${id} failed with ${res.status}`);
    }
    return (await res.json()) as Video;
  }

  await latency("fast");
  const video = store.videos.find((item) => item.id === id || item.slug === id);
  return video ? clone(video) : null;
}

export async function getRelatedVideos(id: string, limit = 12): Promise<Video[]> {
  await latency("fast");
  const video = store.videos.find((item) => item.id === id);
  if (!video) return [];
  const scored = store.videos
    .filter((item) => item.id !== id && item.status === "published")
    .map((item) => {
      let score = 0;
      if (item.channelId === video.channelId) score += 6;
      if (item.contentType === video.contentType) score += 4;
      score += item.categoryIds.filter((c) => video.categoryIds.includes(c)).length * 3;
      score += item.tags.filter((t) => video.tags.includes(t)).length * 2;
      score += Math.min(3, item.views / 800_000);
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);
  return clone(scored.slice(0, limit).map((entry) => entry.item));
}

export async function getCategories(): Promise<Category[]> {
  // First mock-api function to "go live" per this file's own header comment: real
  // Postgres-backed categories exist now (supabase/migrations/20260914000003_catalogue.sql,
  // served by src/app/api/categories/route.ts) and Category's fields are at full parity
  // with what that endpoint returns, so this is a pure body swap — same signature, same
  // shape, no caller changes. Categories don't have the two-id-format problem
  // getVideo/getChannel/getChannelVideos do (see looksLikeRealId's comment above) —
  // slugs are the join key everywhere, and slugs are stable between mock and real data
  // since the real ones were seeded from this same mock source.
  const res = await fetch("/api/categories/");
  if (!res.ok) {
    throw new Error(`GET /api/categories failed with ${res.status}`);
  }
  const data = (await res.json()) as { items: Category[] };
  return data.items;
}

export async function getCategory(slug: string): Promise<Category | null> {
  // Was never swapped when getCategories() went live above — silently left reading the
  // stale mock store, whose fixed fake ids (`cat_brand_film`) can never match a real
  // video's indexed category uuid. That mismatch is why a category could show a real,
  // nonzero title count on /explore yet render nothing on its own detail page — a
  // id-format mismatch, not a caching or join-direction bug. Same real endpoint as
  // getCategories(), now with a single-item counterpart at GET /api/categories/{slug}/.
  const res = await fetch(`/api/categories/${encodeURIComponent(slug)}/`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GET /api/categories/${slug} failed with ${res.status}`);
  }
  return (await res.json()) as Category;
}

/* ============================= Channels ================================= */

export async function getChannel(id: string): Promise<Channel | null> {
  // Live 2026-09-14 for real ids only — see looksLikeRealId's comment above. Real
  // Postgres via GET /api/channels/{id}/, matching by id or handle exactly like the
  // mock branch below does. Full parity with Channel, including bannerGradient/
  // avatarGradient — found by clicking through the actual channel page, not static
  // review: they're indexed directly by a gradient-rendering component with no
  // fallback, so they turned out to be load-bearing UI rather than the cosmetic
  // placeholder-art mechanism they first looked like (see the migration comment in
  // supabase/migrations/20260914000007_channel_gradients.sql).
  if (looksLikeRealId(id)) {
    const res = await fetch(`/api/channels/${encodeURIComponent(id)}/`);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`GET /api/channels/${id} failed with ${res.status}`);
    }
    return (await res.json()) as Channel;
  }

  await latency("fast");
  const channel = store.channels.find((item) => item.id === id || item.handle === id);
  return channel ? clone(channel) : null;
}

export async function getChannels(): Promise<Channel[]> {
  // Live 2026-09-14 — real Postgres via GET /api/channels/.
  const res = await fetch("/api/channels/");
  if (!res.ok) {
    throw new Error(`GET /api/channels failed with ${res.status}`);
  }
  const data = (await res.json()) as { items: Channel[] };
  return data.items;
}

// Live 2026-09-15 for real ids — PATCH /api/channels/{id}/, restricted server-side to the
// six real profile fields (name/handle/tagline/about/contactEmail/languages/country).
// avatarUrl/bannerUrl are deliberately never sent for a real channel — see the settings
// page, which disables those two controls there instead of letting them silently no-op
// (they're a browser-local blob: URL with nowhere real to persist to until P2's media
// pipeline exists).
export async function updateChannel(
  id: string,
  patch: Partial<Channel>,
): Promise<Channel> {
  if (looksLikeRealId(id)) {
    const res = await fetch(`/api/channels/${encodeURIComponent(id)}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `PATCH /api/channels/${id} failed with ${res.status}`);
    }
    return (await res.json()) as Channel;
  }

  await latency("fast");
  const channel = store.channels.find(
    (item) => item.id === id || item.handle === id,
  );
  if (!channel) throw new Error(`Channel not found: ${id}`);
  Object.assign(channel, patch);
  return clone(channel);
}

export async function getChannelVideos(
  channelId: string,
  opts: { includeUnpublished?: boolean } = {},
): Promise<Video[]> {
  // Live 2026-09-14 for the public (published-only) case; live 2026-09-17 for
  // includeUnpublished too, now that GET /api/channels/{id}/videos/ has a real
  // authenticated membership check to gate draft/pending/scheduled content behind (see
  // that route's own header comment) — Studio's and Business's own content lists no
  // longer fall back to mock data for a real channel.
  if (looksLikeRealId(channelId)) {
    const qs = opts.includeUnpublished ? "?includeUnpublished=true" : "";
    const res = await fetch(`/api/channels/${encodeURIComponent(channelId)}/videos/${qs}`);
    if (!res.ok) {
      throw new Error(`GET /api/channels/${channelId}/videos failed with ${res.status}`);
    }
    const data = (await res.json()) as { items: Video[] };
    return data.items;
  }

  await latency("fast");
  return clone(
    store.videos
      .filter(
        (video) =>
          video.channelId === channelId &&
          (opts.includeUnpublished || video.status === "published"),
      )
      .sort((a, b) => (b.publishedAt ?? "z").localeCompare(a.publishedAt ?? "z")),
  );
}

// Live 2026-09-15 — real channel_follows via /api/channels/{id}/follow, for real
// (Postgres) channels only — same looksLikeRealId split as getVideo()/getChannel()
// above. A mock channel's follow state stays purely local exactly as before.
export async function toggleFollow(channelId: string): Promise<boolean> {
  if (looksLikeRealId(channelId)) {
    const res = await fetch(`/api/channels/${channelId}/follow/`, { method: "POST" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not update your follow status.");
    }
    const data = (await res.json()) as { following: boolean };
    return data.following;
  }

  await latency("fast");
  // Guests have no per-viewer follow state in the mock layer (store.following is a
  // single shared seed, not per-session) — treat every guest toggle as a no-op "not
  // following" rather than silently mutating the signed-in demo user's seeded list.
  if (!store.loggedIn) return false;
  const index = store.following.indexOf(channelId);
  if (index >= 0) {
    store.following.splice(index, 1);
    return false;
  }
  store.following.push(channelId);
  return true;
}

export async function isFollowing(channelId: string): Promise<boolean> {
  if (looksLikeRealId(channelId)) {
    const res = await fetch(`/api/channels/${channelId}/follow/`);
    if (!res.ok) return false;
    const data = (await res.json()) as { following: boolean };
    return data.following;
  }

  // store.following is seeded as the signed-in demo user's follows (see
  // data/users.ts) — a guest (store.loggedIn === false) never follows anything by
  // default, so don't fall through to that shared seed for them.
  if (!store.loggedIn) return false;
  return store.following.includes(channelId);
}

/* ============================ Entitlement =============================== */

export async function getEntitlement(
  userId: string,
  videoId: string,
): Promise<Entitlement> {
  // Resolved via getVideo() — which already knows how to fetch a real (Postgres) video
  // — rather than store.videos.find() directly, which only ever sees mock ones. Found
  // by the geo-restriction e2e test: before this, every real video (reachable via
  // search/explore/the vertical category pages, all real since the searchVideos swap)
  // fell straight into the "video not found" branch below and showed the generic
  // "unavailable" screen no matter its actual rights or pricing. Real commerce
  // (purchases/subscriptions/rentals) is still P3 scope and doesn't exist yet, so a
  // real paid video correctly falls through to the paywall/preview state further down
  // rather than ever resolving "owned" — an honest gap, not a bug, until P3 lands.
  await latency("fast");
  const video = await getVideo(videoId);
  const country = store.requestCountry;

  if (!video) {
    return {
      videoId,
      userId,
      granted: false,
      reason: "none",
      blockReason: "unavailable",
      requestCountry: country,
    };
  }

  const base = { videoId, userId, requestCountry: country };

  // Owner always plays their own content, including drafts.
  if (store.user.channelId === video.channelId) {
    return { ...base, granted: true, reason: "owner" };
  }

  const { permittedCountries, blockedCountries } = video.rights;
  const geoBlocked =
    blockedCountries.includes(country) ||
    (permittedCountries.length > 0 && !permittedCountries.includes(country));
  if (geoBlocked) {
    return {
      ...base,
      granted: false,
      reason: "none",
      blockReason: "geo-restricted",
    };
  }

  if (video.status === "restricted" || video.status === "rejected") {
    return { ...base, granted: false, reason: "none", blockReason: "unavailable" };
  }

  const models = video.pricing.accessModels;
  if (models.includes("free")) return { ...base, granted: true, reason: "free" };
  if (models.includes("ad-supported"))
    return { ...base, granted: true, reason: "ad-supported" };

  const unlocked = store.unlocked[videoId];
  if (unlocked) {
    return {
      ...base,
      granted: true,
      reason: unlocked.kind === "rent" ? "rented" : unlocked.kind === "buy" ? "purchased" : "ticket",
      expiresAt: unlocked.expiresAt ?? undefined,
    };
  }

  // Real Stripe-backed entitlements (docs/DEVELOPMENT-PLAN.md's P3 first slice) — for a
  // real video and a real signed-in account, this is the actual "did they buy/rent/
  // unlock it" answer; store.purchases below can never contain a real video's id, so it
  // would otherwise just fall through to the honest preview state every real paid video
  // used to hit unconditionally.
  if (looksLikeRealId(videoId) && looksLikeRealId(userId)) {
    const res = await fetch(`/api/videos/${videoId}/entitlement/`);
    if (res.ok) {
      const real = (await res.json()) as {
        granted: boolean;
        kind?: "buy" | "rent" | "ppv" | "subscription";
        expiresAt?: string;
      };
      if (real.granted) {
        return {
          ...base,
          granted: true,
          reason:
            real.kind === "rent"
              ? "rented"
              : real.kind === "ppv"
                ? "ticket"
                : real.kind === "subscription"
                  ? "subscription"
                  : "purchased",
          expiresAt: real.expiresAt,
        };
      }
    }
  }

  const owned = store.purchases.find(
    (purchase) =>
      purchase.videoId === videoId &&
      (purchase.status === "completed" || purchase.status === "active"),
  );
  if (owned) {
    return {
      ...base,
      granted: true,
      reason: owned.kind === "rent" ? "rented" : owned.kind === "ppv" ? "ticket" : "purchased",
      expiresAt: owned.expiresAt ?? undefined,
    };
  }

  // store.subscriptions is a flat, session-global array with no video-id filtering at
  // all (unlike store.purchases/store.unlocked above, which are keyed by videoId and so
  // can never accidentally match a real video's uuid) — the seed data ships an always-
  // active mock "Nexus Premium" subscription (mock-api/data/users.ts), so without this
  // guard every real signed-in account would incorrectly show as Premium-entitled for
  // every real subscription-gated video, real subscription or not. Found live: a fresh
  // real account with no subscription showed "Included with Premium" on a real
  // subscription-only video before this fix.
  if (!looksLikeRealId(videoId)) {
    const hasPremium = store.subscriptions.some(
      (subscription) => subscription.kind === "platform" && subscription.status === "active",
    );
    if (models.includes("subscription") && hasPremium) {
      return { ...base, granted: true, reason: "subscription" };
    }

    const hasMembership = store.subscriptions.some(
      (subscription) =>
        subscription.kind === "channel-membership" &&
        subscription.channelId === video.channelId &&
        subscription.status === "active",
    );
    if (models.includes("membership") && hasMembership) {
      return { ...base, granted: true, reason: "membership" };
    }
  }

  // Paid, unowned: a short preview is allowed, then the paywall takes over.
  return {
    ...base,
    granted: false,
    reason: "preview",
    blockReason: "entitlement-required",
    previewSeconds: 120,
  };
}

/** Mock checkout for a mock video — see §12. Real videos redirect to a real Stripe
 * Checkout session instead (docs/DEVELOPMENT-PLAN.md's P3 first slice); the browser
 * navigates away, so this deliberately never resolves in that branch — there is no
 * synchronous "purchase complete" for a real payment, only a redirect back once Stripe
 * confirms it (see video-client.tsx's handling of the `?checkout=` return param). */
export async function purchaseAccess(
  videoId: string,
  kind: "buy" | "rent" | "ppv" | "ticket",
): Promise<PurchaseRecord> {
  if (looksLikeRealId(videoId)) {
    const res = await fetch(`/api/videos/${videoId}/checkout/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not start checkout.");
    }
    const { url } = (await res.json()) as { url: string };
    window.location.href = url;
    return new Promise<PurchaseRecord>(() => {});
  }

  await latency("slow");
  const video = store.videos.find((item) => item.id === videoId);
  const price =
    kind === "buy"
      ? video?.pricing.buyPrice
      : kind === "rent"
        ? video?.pricing.rentPrice
        : video?.pricing.ppvPrice;

  const windowHours = video?.pricing.rentalWindowHours ?? 48;
  const expiresAt =
    kind === "rent"
      ? new Date(Date.now() + windowHours * 3_600_000).toISOString()
      : null;

  store.unlocked[videoId] = { kind, expiresAt };

  const record: PurchaseRecord = {
    id: nextId("pur"),
    videoId,
    kind: kind === "ticket" ? "ppv" : kind,
    price: price ?? { amount: 0, currency: "GBP" },
    purchasedAt: new Date().toISOString(),
    expiresAt,
    status: kind === "rent" ? "active" : "completed",
    invoiceNumber: `NX-2026-${String(store.seq).padStart(6, "0")}`,
  };
  store.purchases = [record, ...store.purchases];

  store.notifications = [
    {
      id: nextId("ntf"),
      event: "purchase-receipt",
      title: `Receipt: ${video?.title ?? "Video"}`,
      body: `Invoice ${record.invoiceNumber}`,
      createdAt: record.purchasedAt,
      read: false,
      href: "/account/purchases",
    },
    ...store.notifications,
  ];

  return record;
}

/** Real Nexus Premium only (channelId omitted) for a real account — see
 * 20260918000002_subscriptions.sql's header comment on why channel memberships
 * (channelId passed) always stay mock: there's no real design for those to build
 * against. Same "redirects away, never resolves" shape as purchaseAccess()'s real
 * branch — a real subscription signup has no synchronous "subscribed" the way the mock
 * always did. */
export async function startSubscription(
  name: string,
  channelId?: string,
): Promise<Subscription> {
  if (!channelId && looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/subscriptions/checkout/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnPath: window.location.pathname }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not start checkout.");
    }
    const { url } = (await res.json()) as { url: string };
    window.location.href = url;
    return new Promise<Subscription>(() => {});
  }

  await latency("slow");
  const subscription: Subscription = {
    id: nextId("sub"),
    name,
    kind: channelId ? "channel-membership" : "platform",
    channelId,
    price: { amount: channelId ? 500 : 999, currency: "GBP" },
    interval: "monthly",
    status: "active",
    renewsAt: daysAhead(30),
    startedAt: new Date().toISOString(),
    benefits: channelId
      ? ["Members-only content", "Early access", "Members' chat"]
      : ["Ad-free viewing", "Included films and series", "Offline downloads"],
  };
  store.subscriptions = [subscription, ...store.subscriptions];
  return subscription;
}

export async function setRequestCountry(country: string): Promise<string> {
  store.requestCountry = country;
  return country;
}

export async function getRequestCountry(): Promise<string> {
  return store.requestCountry;
}

/* ============================== Playback ================================= */

// Live 2026-09-15 — real watch_progress via /api/videos/{id}/progress, for real videos
// only — same looksLikeRealId split as getComments()/rateVideo() above. durationSeconds
// comes back from the video's own row server-side (watch_progress doesn't store one),
// so the caller-supplied durationSeconds argument is only used on the mock branch.
export async function getWatchProgress(videoId: string): Promise<WatchProgress | null> {
  if (looksLikeRealId(videoId)) {
    const res = await fetch(`/api/videos/${videoId}/progress/`);
    if (!res.ok) return null;
    const data = (await res.json()) as { progress: WatchProgress | null };
    return data.progress;
  }

  return store.watchProgress.find((entry) => entry.videoId === videoId) ?? null;
}

export async function saveWatchProgress(
  videoId: string,
  positionSeconds: number,
  durationSeconds: number,
): Promise<WatchProgress> {
  if (looksLikeRealId(videoId)) {
    const res = await fetch(`/api/videos/${videoId}/progress/`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionSeconds }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not save your watch progress.");
    }
    return (await res.json()) as WatchProgress;
  }

  const existing = store.watchProgress.find((entry) => entry.videoId === videoId);
  const record: WatchProgress = {
    videoId,
    positionSeconds,
    durationSeconds,
    updatedAt: new Date().toISOString(),
    completed: durationSeconds > 0 && positionSeconds / durationSeconds > 0.95,
  };
  if (existing) Object.assign(existing, record);
  else store.watchProgress = [record, ...store.watchProgress];
  return record;
}

// Merges the two sources the same way getWatchlist() does: real entries (watch_progress,
// resolved to full VideoSummary rows, cast to Video the same way searchVideos() already
// does) and whatever mock-shaped video ids are still in the local store.
export async function getContinueWatching(): Promise<
  Array<{ video: Video; progress: WatchProgress }>
> {
  const [real, mock] = await Promise.all([
    fetch("/api/continue-watching/")
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => (data as { items: Array<{ video: Video; progress: WatchProgress }> }).items)
      .catch(() => [] as Array<{ video: Video; progress: WatchProgress }>),
    (async () => {
      await latency("fast");
      return clone(
        store.watchProgress
          .filter((entry) => !looksLikeRealId(entry.videoId))
          .map((progress) => ({
            progress,
            video: store.videos.find((video) => video.id === progress.videoId)!,
          }))
          .filter((entry) => Boolean(entry.video)),
      );
    })(),
  ]);
  return [...mock, ...real].sort((a, b) => b.progress.updatedAt.localeCompare(a.progress.updatedAt));
}

/* =============================== Social ================================== */

// Live 2026-09-15 — real comments (video_comments, joined to accounts for the author
// fields) via /api/videos/{id}/comments, for real (Postgres) videos. A mock-shaped video
// id (still-mock home rails/category pages — see looksLikeRealId's comment above) has no
// row in the real `videos` table for a comment to reference, so it stays on the mock
// store exactly as before; the two branches never mix within one video's thread.
export async function getComments(videoId: string): Promise<Comment[]> {
  if (looksLikeRealId(videoId)) {
    const res = await fetch(`/api/videos/${videoId}/comments/`);
    if (!res.ok) throw new Error(`GET .../comments failed with ${res.status}`);
    const data = (await res.json()) as { items: Comment[] };
    return data.items;
  }

  await latency("fast");
  return clone(
    store.comments
      .filter((comment) => comment.videoId === videoId && comment.status !== "removed")
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.likes - a.likes),
  );
}

export async function postComment(videoId: string, body: string): Promise<Comment> {
  if (looksLikeRealId(videoId)) {
    const res = await fetch(`/api/videos/${videoId}/comments/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not post your comment.");
    }
    return (await res.json()) as Comment;
  }

  await latency();
  const comment: Comment = {
    id: nextId("cmt"),
    videoId,
    authorName: store.user.name,
    authorHandle: store.user.handle,
    authorGradient: store.user.avatarGradient,
    body,
    createdAt: new Date().toISOString(),
    likes: 0,
    pinned: false,
    heartedByCreator: false,
    status: "published",
    replies: [],
  };
  store.comments = [comment, ...store.comments];
  const video = store.videos.find((item) => item.id === videoId);
  if (video) video.commentCount += 1;
  return clone(comment);
}

export async function replyToComment(
  commentId: string,
  body: string,
): Promise<Comment | null> {
  if (looksLikeRealId(commentId)) {
    const res = await fetch(`/api/comments/${commentId}/replies/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not post your reply.");
    }
    return (await res.json()) as Comment;
  }

  await latency();
  const comment = store.comments.find((item) => item.id === commentId);
  if (!comment) return null;
  comment.replies = [
    ...comment.replies,
    {
      id: nextId("rep"),
      authorName: store.user.name,
      authorHandle: store.user.handle,
      authorGradient: store.user.avatarGradient,
      body,
      createdAt: new Date().toISOString(),
      likes: 0,
      pinned: false,
      heartedByCreator: false,
      status: "published",
    },
  ];
  return clone(comment);
}

export async function moderateComment(
  commentId: string,
  action: "publish" | "hold" | "remove" | "pin" | "heart",
): Promise<Comment | null> {
  if (looksLikeRealId(commentId)) {
    const res = await fetch(`/api/studio/comments/${commentId}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) return null;
    return (await res.json()) as Comment;
  }

  await latency("fast");
  const comment = store.comments.find((item) => item.id === commentId);
  if (!comment) return null;
  if (action === "publish") comment.status = "published";
  if (action === "hold") comment.status = "held";
  if (action === "remove") comment.status = "removed";
  if (action === "pin") comment.pinned = !comment.pinned;
  if (action === "heart") comment.heartedByCreator = !comment.heartedByCreator;
  recordAudit({
    actor: store.user.name,
    actorRole: "creator",
    action: `comment.${action}`,
    targetType: "comment",
    targetId: commentId,
    reason: "Channel moderation action",
    severity: action === "remove" ? "warning" : "info",
  });
  return clone(comment);
}

export async function getModerationComments(channelId: string): Promise<Comment[]> {
  if (looksLikeRealId(channelId)) {
    const res = await fetch(`/api/studio/comments/?channelId=${encodeURIComponent(channelId)}`);
    if (!res.ok) {
      throw new Error(`GET /api/studio/comments failed with ${res.status}`);
    }
    const data = (await res.json()) as { items: Comment[] };
    return data.items;
  }

  await latency("fast");
  const channelVideoIds = store.videos
    .filter((video) => video.channelId === channelId)
    .map((video) => video.id);
  return clone(
    store.comments.filter((comment) => channelVideoIds.includes(comment.videoId)),
  );
}

// Live 2026-09-15 — real ratings (video_ratings, upserted; videos.rating_average/
// rating_count recomputed from the real rows) via /api/videos/{id}/rating, for real
// videos only — same looksLikeRealId split as getComments() above.
export async function rateVideo(
  videoId: string,
  stars: 1 | 2 | 3 | 4 | 5,
): Promise<{ videoId: string; stars: number }> {
  if (looksLikeRealId(videoId)) {
    const res = await fetch(`/api/videos/${videoId}/rating/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stars }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not save your rating.");
    }
    return (await res.json()) as { videoId: string; stars: number };
  }

  await latency("fast");
  const existing = store.ratings.find(
    (rating) => rating.videoId === videoId && rating.userId === store.user.id,
  );
  if (existing) existing.stars = stars;
  else
    store.ratings.push({
      videoId,
      userId: store.user.id,
      stars,
      createdAt: new Date().toISOString(),
    });

  const video = store.videos.find((item) => item.id === videoId);
  if (video) {
    const total = video.ratingAverage * video.ratingCount + stars;
    video.ratingCount += existing ? 0 : 1;
    video.ratingAverage = Number((total / Math.max(video.ratingCount, 1)).toFixed(2));
  }
  return { videoId, stars };
}

export async function getMyRating(videoId: string): Promise<Pick<Rating, "stars"> | null> {
  if (looksLikeRealId(videoId)) {
    const res = await fetch(`/api/videos/${videoId}/rating/`);
    if (!res.ok) return null;
    const data = (await res.json()) as { stars: number | null };
    return data.stars == null ? null : { stars: data.stars as Rating["stars"] };
  }

  return (
    store.ratings.find(
      (rating) => rating.videoId === videoId && rating.userId === store.user.id,
    ) ?? null
  );
}

export async function likeVideo(videoId: string) {
  const video = store.videos.find((item) => item.id === videoId);
  if (video) video.likes += 1;
  return video ? clone(video) : null;
}

// Live 2026-09-15 — real watchlist_items via /api/videos/{id}/watchlist, for real videos
// only — same looksLikeRealId split as getComments()/rateVideo() above. A guest's or a
// mock-video's toggle stays purely local, exactly as before.
export async function toggleWatchlist(videoId: string): Promise<boolean> {
  if (looksLikeRealId(videoId)) {
    const res = await fetch(`/api/videos/${videoId}/watchlist/`, { method: "POST" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not update your watchlist.");
    }
    const data = (await res.json()) as { inWatchlist: boolean };
    return data.inWatchlist;
  }

  await latency("fast");
  const index = store.watchlist.indexOf(videoId);
  if (index >= 0) {
    store.watchlist.splice(index, 1);
    return false;
  }
  store.watchlist.unshift(videoId);
  return true;
}

// Merges the two sources a watchlist can now draw from: real entries (watchlist_items,
// resolved to full VideoSummary rows by the API — cast to Video the same way
// searchVideos() already does, since VideoSummary carries everything VideoCard/VideoGrid
// actually read) and whatever mock-shaped ids are still in the local store. A single
// account's watchlist can genuinely contain both while the site is mid-migration.
export async function getWatchlist(): Promise<Video[]> {
  const [real, mock] = await Promise.all([
    fetch("/api/watchlist/")
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => (data as { items: Video[] }).items)
      .catch(() => [] as Video[]),
    (async () => {
      await latency("fast");
      return clone(
        store.watchlist
          .filter((id) => !looksLikeRealId(id))
          .map((id) => store.videos.find((video) => video.id === id))
          .filter(Boolean) as Video[],
      );
    })(),
  ]);
  return [...mock, ...real];
}

/* ================================ Live =================================== */

export async function getLiveEvents(status?: LiveEvent["status"]): Promise<LiveEvent[]> {
  await latency("fast");
  const events = status
    ? store.liveEvents.filter((event) => event.status === status)
    : store.liveEvents;
  const order: Record<LiveEvent["status"], number> = {
    live: 0,
    upcoming: 1,
    ended: 2,
    replay: 3,
    cancelled: 4,
  };
  return clone(
    [...events].sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        a.scheduledStart.localeCompare(b.scheduledStart),
    ),
  );
}

export async function getLiveEvent(id: string): Promise<LiveEvent | null> {
  await latency("fast");
  return clone(store.liveEvents.find((event) => event.id === id) ?? null);
}

export async function getChannelLiveEvents(channelId: string): Promise<LiveEvent[]> {
  await latency("fast");
  return clone(store.liveEvents.filter((event) => event.channelId === channelId));
}

export async function createLiveEvent(
  payload: Omit<
    LiveEvent,
    "id" | "streamKey" | "ingestUrl" | "viewerCount" | "peakViewers" | "replayVideoId" | "replayPublished" | "actualStart" | "endedAt"
  >,
): Promise<LiveEvent> {
  await latency("slow");
  const event: LiveEvent = {
    ...payload,
    id: nextId("live"),
    streamKey: generateStreamKey(),
    ingestUrl: "rtmp://ingest.mock.nexus/live",
    viewerCount: 0,
    peakViewers: 0,
    actualStart: null,
    endedAt: null,
    replayVideoId: null,
    replayPublished: false,
  };
  store.liveEvents = [event, ...store.liveEvents];
  recordAudit({
    actor: store.user.name,
    actorRole: "creator",
    action: "live.scheduled",
    targetType: "live_event",
    targetId: event.id,
    reason: `Scheduled "${event.title}" (${event.accessType}).`,
    severity: "info",
  });
  return clone(event);
}

export function generateStreamKey(): string {
  const seq = (store.seq += 1);
  const block = (offset: number) =>
    ((seq * 2654435761 + offset * 40503) % 65536).toString(16).padStart(4, "0");
  return `nx_live_${block(1)}-${block(2)}-${block(3)}-${block(4)}`;
}

export async function regenerateStreamKey(eventId: string): Promise<string | null> {
  await latency();
  const event = store.liveEvents.find((item) => item.id === eventId);
  if (!event) return null;
  event.streamKey = generateStreamKey();
  recordAudit({
    actor: store.user.name,
    actorRole: "creator",
    action: "live.stream_key_regenerated",
    targetType: "live_event",
    targetId: eventId,
    reason: "Stream key rotated by the channel owner.",
    severity: "notice",
  });
  return event.streamKey;
}

export async function publishReplay(eventId: string): Promise<LiveEvent | null> {
  await latency("slow");
  const event = store.liveEvents.find((item) => item.id === eventId);
  if (!event) return null;

  const replay: Video = {
    ...store.videos[0],
    id: nextId("vid"),
    slug: `${eventId}-replay`,
    title: `${event.title} — replay`,
    synopsis: `Full replay of the live stream broadcast on ${new Date(
      event.actualStart ?? event.scheduledStart,
    ).toLocaleDateString("en-GB")}.`,
    channelId: event.channelId,
    contentType: "live",
    categoryIds: event.categoryIds,
    tags: ["replay", "live"],
    status: "published",
    posterGradient: event.posterGradient,
    durationSeconds: 5_400,
    publishedAt: new Date().toISOString(),
    releaseDate: new Date().toISOString().slice(0, 10),
    scheduledFor: null,
    views: 0,
    uniqueViewers: 0,
    likes: 0,
    ratingCount: 0,
    ratingAverage: 0,
    commentCount: 0,
    watchTimeSeconds: 0,
    completionRate: 0,
    pricing: { accessModels: ["free"] },
  };

  store.videos = [replay, ...store.videos];
  event.replayVideoId = replay.id;
  event.replayPublished = true;
  event.status = "replay";

  recordAudit({
    actor: store.user.name,
    actorRole: "creator",
    action: "live.replay_published",
    targetType: "live_event",
    targetId: eventId,
    reason: "Replay published to the channel archive.",
    severity: "info",
  });
  return clone(event);
}

export async function endLiveEvent(eventId: string): Promise<LiveEvent | null> {
  await latency();
  const event = store.liveEvents.find((item) => item.id === eventId);
  if (!event) return null;
  event.status = "ended";
  event.endedAt = new Date().toISOString();
  event.peakViewers = Math.max(event.peakViewers, event.viewerCount);
  event.viewerCount = 0;
  return clone(event);
}

export async function getChatMessages(eventId: string): Promise<ChatMessage[]> {
  return clone(
    store.chatMessages.filter((message) => message.liveEventId === eventId),
  );
}

export async function sendChatMessage(
  eventId: string,
  body: string,
): Promise<ChatMessage> {
  const message: ChatMessage = {
    id: nextId("chat"),
    liveEventId: eventId,
    authorName: store.user.name,
    authorGradient: store.user.avatarGradient,
    body,
    sentAt: new Date().toISOString(),
    role: "viewer",
    status: "visible",
  };
  store.chatMessages = [...store.chatMessages, message];
  return clone(message);
}

export async function moderateChatMessage(
  messageId: string,
  action: "hold" | "remove" | "restore",
): Promise<ChatMessage | null> {
  const message = store.chatMessages.find((item) => item.id === messageId);
  if (!message) return null;
  message.status = action === "restore" ? "visible" : action === "hold" ? "held" : "removed";
  return clone(message);
}

export async function getPolls(eventId: string): Promise<Poll[]> {
  return clone(store.polls.filter((poll) => poll.liveEventId === eventId));
}

export async function votePoll(pollId: string, optionId: string): Promise<Poll | null> {
  const poll = store.polls.find((item) => item.id === pollId);
  if (!poll) return null;
  const option = poll.options.find((item) => item.id === optionId);
  if (option) option.votes += 1;
  return clone(poll);
}

/* ============================== Uploads ================================== */

const CHUNKS = 40;

export async function createUploadSession(
  fileName: string,
  fileSizeBytes: number,
): Promise<UploadSession> {
  await latency("fast");
  const session: UploadSession = {
    id: nextId("ups"),
    fileName,
    fileSizeBytes,
    uploadedBytes: 0,
    phase: "uploading",
    chunkIndex: 0,
    totalChunks: CHUNKS,
    createdAt: new Date().toISOString(),
  };
  store.uploadSessions[session.id] = session;
  return clone(session);
}

/**
 * Advances the mock transfer by one chunk. Chunk 17 of the first attempt fails
 * on purpose so the resumable/retry UI has a real state to render — the retry
 * then succeeds from the last good chunk rather than restarting.
 */
export async function advanceUpload(sessionId: string): Promise<UploadSession | null> {
  const session = store.uploadSessions[sessionId];
  if (!session) return null;
  await sleep(120);

  if (session.phase !== "uploading") return clone(session);

  const failAt = 17;
  const alreadyFailedOnce = Boolean(
    (session as UploadSession & { _retried?: boolean })._retried,
  );

  if (session.chunkIndex === failAt && !alreadyFailedOnce) {
    session.phase = "failed";
    session.error =
      "Connection interrupted at chunk 17 of 40. The upload can resume from the last completed chunk.";
    return clone(session);
  }

  session.chunkIndex += 1;
  session.uploadedBytes = Math.round(
    (session.chunkIndex / session.totalChunks) * session.fileSizeBytes,
  );

  if (session.chunkIndex >= session.totalChunks) {
    session.phase = "processing";
    session.uploadedBytes = session.fileSizeBytes;
    // Mock transcode/analysis delay before the wizard can continue.
    setTimeout(() => {
      const current = store.uploadSessions[sessionId];
      if (current && current.phase === "processing") current.phase = "complete";
    }, 1_600);
  }
  return clone(session);
}

export async function pauseUpload(sessionId: string): Promise<UploadSession | null> {
  const session = store.uploadSessions[sessionId];
  if (!session) return null;
  if (session.phase === "uploading") session.phase = "paused";
  return clone(session);
}

export async function resumeUpload(sessionId: string): Promise<UploadSession | null> {
  const session = store.uploadSessions[sessionId] as
    | (UploadSession & { _retried?: boolean })
    | undefined;
  if (!session) return null;
  if (session.phase === "failed") session._retried = true;
  session.phase = "uploading";
  session.error = undefined;
  return clone(session);
}

export async function getUploadSession(sessionId: string): Promise<UploadSession | null> {
  const session = store.uploadSessions[sessionId];
  return session ? clone(session) : null;
}

export async function getThumbnailSuggestions(
  sessionId: string,
): Promise<ThumbnailSuggestion[]> {
  await latency("slow");
  const palettes: Array<[string, string]> = [
    ["#2E5B4A", "#0A1712"],
    ["#5C2A14", "#170A05"],
    ["#1B3A5C", "#06101B"],
    ["#3E1638", "#120610"],
  ];
  return palettes.map((gradient, index) => ({
    id: `${sessionId}_thumb_${index + 1}`,
    label: `Auto suggestion ${index + 1}`,
    gradient,
    timestampSeconds: 42 + index * 217,
    score: Number((0.94 - index * 0.11).toFixed(2)),
  }));
}

/* ------------------------- Real upload (2026-09-16) ------------------------ */
// Real for a real channel only — see docs/DEVELOPMENT-PLAN.md's P2 entry. No mock
// counterpart branch here (unlike most of this file): these functions are only ever
// called from the wizard's real-channel path, which is gated by looksLikeRealId at the
// call site, not internally.

export async function createStudioUploadUrl(
  channelId: string,
  fileName: string,
  fileSizeBytes: number,
): Promise<{ path: string; signedUrl: string; maxBytes: number }> {
  const res = await fetch("/api/studio/uploads/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId, fileName, fileSizeBytes }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to create an upload URL (${res.status}).`);
  }
  return res.json();
}

/** Raw XHR (not fetch) specifically for `upload.onprogress` — this is the one place in
 * the app that needs real byte-level upload progress. Replicates
 * @supabase/storage-js's own `uploadToSignedUrl` request shape exactly (PUT, an
 * `x-upsert` header, the file under an empty-string FormData key) so the browser talks
 * to the signed URL directly without needing the SDK (or its API key) client-side. */
export function uploadMasterFile(
  signedUrl: string,
  file: File,
  onProgress?: (loadedBytes: number, totalBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}.`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
    const formData = new FormData();
    formData.append("cacheControl", "3600");
    formData.append("", file);
    xhr.send(formData);
  });
}

export async function uploadThumbnailFile(channelId: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append("channelId", channelId);
  formData.append("file", file);
  const res = await fetch("/api/studio/thumbnails/", { method: "POST", body: formData });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to upload the thumbnail (${res.status}).`);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

export interface SuggestedThumbnail {
  url: string;
  timestampSeconds: number;
}

/** Real for a real channel (2026-09-17) — extracts actual frames from the uploaded
 * master via ffmpeg, replacing the wizard's previously mocked "suggested frames". */
export async function getSuggestedThumbnails(
  channelId: string,
  masterAssetPath: string,
): Promise<SuggestedThumbnail[]> {
  const res = await fetch("/api/studio/uploads/suggested-thumbnails/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId, masterAssetPath }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to generate suggested thumbnails (${res.status}).`);
  }
  const data = (await res.json()) as { items: SuggestedThumbnail[] };
  return data.items;
}

/** Real for a real channel (2026-09-16, docs/DEVELOPMENT-PLAN.md's P2 entry) — the
 * write path that was 100% mock since this project began. `draft.uploadSessionId`
 * doubles as the real master-asset storage path in the real branch (set by the wizard's
 * real upload step, see createStudioUploadUrl/uploadMasterFile below) rather than a mock
 * session id — same field, different meaning per branch, avoiding a parallel type.
 * Return type is deliberately narrower than `Video`: getVideoById() only resolves
 * *published* videos, so a draft/pending video has nothing to re-fetch, and the wizard's
 * only actual use of the result is `.status` for its toast copy. */
export async function publishDraft(
  draft: VideoDraft,
): Promise<{ id: string; slug: string; status: string }> {
  if (looksLikeRealId(store.user.channelId ?? "")) {
    const res = await fetch("/api/studio/videos/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: store.user.channelId,
        masterAssetPath: draft.uploadSessionId,
        title: draft.title,
        description: draft.description,
        contentType: draft.contentType,
        categoryIds: draft.categoryIds,
        tags: draft.tags,
        participants: draft.participants,
        productionCompany: draft.productionCompany || null,
        releaseDate: draft.releaseDate || null,
        language: draft.language,
        country: draft.country,
        customThumbnailUrl: draft.customThumbnailUrl ?? null,
        subtitles: draft.subtitles.map((track) => ({
          language: track.language,
          languageCode: track.languageCode,
          kind: track.kind,
        })),
        rights: draft.rights,
        pricing: draft.pricing,
        status: draft.status,
        scheduledFor: draft.scheduledFor,
        seriesId: draft.seriesId || null,
        seasonNumber: draft.seasonNumber ?? null,
        episodeNumber: draft.episodeNumber ?? null,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Failed to publish (${res.status}).`);
    }
    return res.json();
  }

  await latency("slow");
  const session = store.uploadSessions[draft.uploadSessionId];
  const now = new Date().toISOString();

  // Anything sponsored or age-rated above PG goes to human review first —
  // this is what makes Draft → Pending Review → Published observable.
  const needsReview =
    draft.pricing.sponsored ||
    draft.rights.ageRating === "18" ||
    draft.rights.contentLabels.length > 0;

  const status: ContentStatus =
    draft.status === "published" && needsReview ? "pending" : draft.status;

  const video: Video = {
    id: nextId("vid"),
    slug: draft.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled",
    title: draft.title || "Untitled upload",
    synopsis: draft.description,
    channelId: store.user.channelId ?? "ch_mara",
    contentType: draft.contentType,
    categoryIds: draft.categoryIds,
    tags: draft.tags,
    status,
    posterGradient: ["#33373F", "#0D0E11"],
    durationSeconds: 1_284,
    releaseDate: draft.releaseDate,
    publishedAt: status === "published" ? now : null,
    scheduledFor: draft.scheduledFor,
    language: draft.language,
    languageCode: draft.language.slice(0, 2).toLowerCase(),
    country: draft.country,
    productionCompany: draft.productionCompany,
    credits: draft.participants.map((name) => ({ role: "Participant", name })),
    subtitles: draft.subtitles,
    audioTracks: [{ id: "aud_en_original", language: draft.language, languageCode: "en", kind: "original" }],
    qualities: [
      { id: "q_1080", label: "1080p", height: 1080, bitrateKbps: 6000 },
      { id: "q_720", label: "720p", height: 720, bitrateKbps: 3000 },
      { id: "q_480", label: "480p", height: 480, bitrateKbps: 1200 },
    ],
    hasAudioDescription: draft.audioDescription,
    pricing: draft.pricing,
    rights: draft.rights,
    views: 0,
    uniqueViewers: 0,
    likes: 0,
    ratingAverage: 0,
    ratingCount: 0,
    commentCount: 0,
    watchTimeSeconds: 0,
    completionRate: 0,
    seriesId: draft.seriesId ?? undefined,
    seasonNumber: draft.seasonNumber ?? undefined,
    episodeNumber: draft.episodeNumber ?? undefined,
    trailerAvailable: false,
    sampleSrc: "/media/sample-1.mp4",
    watermarkEnabled: false,
  };

  store.videos = [video, ...store.videos];

  for (const playlistId of draft.playlistIds) {
    const playlist = store.playlists.find((item) => item.id === playlistId);
    if (playlist) {
      playlist.videoIds = [video.id, ...playlist.videoIds];
      playlist.updatedAt = now;
    }
  }

  if (status === "pending") {
    store.moderationQueue = [
      {
        id: nextId("mod"),
        kind: "content",
        targetId: video.id,
        title: video.title,
        channelId: video.channelId,
        submittedAt: now,
        priority: "normal",
        queue: "pending-review",
        reportReasons: [],
        reportCount: 0,
        status: "open",
        assignedTo: null,
        notes: draft.pricing.sponsored
          ? "Auto-flagged: paid partnership declared at upload."
          : "Auto-flagged: age rating or content label requires review.",
      },
      ...store.moderationQueue,
    ];
  }

  recordAudit({
    actor: store.user.name,
    actorRole: "creator",
    action: status === "published" ? "content.published" : `content.${status}`,
    targetType: "video",
    targetId: video.id,
    reason: `"${video.title}" submitted from the upload wizard.`,
    severity: "info",
  });

  if (session) session.phase = "complete";
  return clone(video);
}

export async function updateVideoStatus(
  videoId: string,
  status: ContentStatus,
): Promise<Video | null> {
  if (looksLikeRealId(videoId)) {
    const res = await fetch(`/api/studio/videos/${videoId}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not update the video's status.");
    }
    return (await res.json()) as Video;
  }

  await latency();
  const video = store.videos.find((item) => item.id === videoId);
  if (!video) return null;
  video.status = status;
  if (status === "published" && !video.publishedAt) {
    video.publishedAt = new Date().toISOString();
  }
  recordAudit({
    actor: store.user.name,
    actorRole: "creator",
    action: `content.${status}`,
    targetType: "video",
    targetId: videoId,
    reason: `Status changed to ${status} from Creator Studio.`,
    severity: "info",
  });
  return clone(video);
}

export async function deleteVideo(videoId: string): Promise<boolean> {
  await latency();
  store.videos = store.videos.filter((video) => video.id !== videoId);
  return true;
}

export async function validateBulkImport(rowCount = 12): Promise<BulkImportRow[]> {
  await latency("slow");
  const types: ContentType[] = ["film", "documentary", "education", "commercial", "entertainment"];
  return Array.from({ length: rowCount }, (_, index) => {
    const status: BulkImportRow["status"] =
      index === 3 ? "error" : index === 7 || index === 10 ? "warning" : "ready";
    return {
      id: `row_${index + 1}`,
      fileName: `NL_MASTER_${String(index + 1).padStart(3, "0")}_PRORES.mov`,
      title: [
        "The Saltmarsh (theatrical)",
        "Paper Kingdom (director's cut)",
        "Riverkeeper 4K restoration",
        "Untitled",
        "Low Tide",
        "Glasshouse teaser",
        "Northlight showreel 2026",
        "Archive interview — Penn",
        "Behind the scenes: Saltmarsh",
        "Riverkeeper commentary track",
        "Festival Q&A — Kestrel",
        "Trailer pack (all titles)",
      ][index] ?? `Asset ${index + 1}`,
      contentType: types[index % types.length],
      language: index % 4 === 0 ? "Welsh" : "English",
      releaseDate: `2026-0${(index % 9) + 1}-14`,
      ageRating: index % 5 === 0 ? "15" : "PG",
      accessModel: index % 3 === 0 ? "rent" : index % 3 === 1 ? "free" : "buy",
      status,
      message:
        status === "error"
          ? "Title is required and no rights holder is declared."
          : status === "warning"
            ? "No subtitle track supplied — auto-transcription will be queued."
            : undefined,
    };
  });
}

/* ============================= Collections =============================== */

export async function getPlaylists(channelId: string): Promise<Playlist[]> {
  await latency("fast");
  return clone(store.playlists.filter((playlist) => playlist.channelId === channelId));
}

export async function getPlaylist(id: string): Promise<Playlist | null> {
  await latency("fast");
  return clone(store.playlists.find((playlist) => playlist.id === id) ?? null);
}

export async function createPlaylist(
  payload: Pick<Playlist, "channelId" | "title" | "description" | "visibility">,
): Promise<Playlist> {
  await latency();
  const playlist: Playlist = {
    ...payload,
    id: nextId("pl"),
    videoIds: [],
    updatedAt: new Date().toISOString(),
    posterGradient: ["#33373F", "#0D0E11"],
  };
  store.playlists = [playlist, ...store.playlists];
  return clone(playlist);
}

export async function updatePlaylist(
  id: string,
  patch: Partial<Playlist>,
): Promise<Playlist | null> {
  await latency("fast");
  const playlist = store.playlists.find((item) => item.id === id);
  if (!playlist) return null;
  Object.assign(playlist, patch, { updatedAt: new Date().toISOString() });
  return clone(playlist);
}

export async function getSeries(channelId?: string): Promise<Series[]> {
  if (channelId && looksLikeRealId(channelId)) {
    const data = await verificationFetch<{ items: RealSeriesSummary[] }>(
      `/api/studio/series/?channelId=${encodeURIComponent(channelId)}`,
    );
    // Real series aren't backed by the mock Series shape (no seasons/episodeIds array —
    // real episodes are read from `videos.series_id` directly, see series.ts) — the
    // studio Series tab and upload wizard picker only ever need id/title from this list.
    return data.items.map((item) => ({
      id: item.id,
      channelId: item.channelId,
      title: item.title,
      description: item.description ?? "",
      seasons: [],
      posterGradient: item.posterGradient,
      thumbnailUrl: undefined,
    }));
  }
  await latency("fast");
  return clone(
    channelId
      ? store.series.filter((item) => item.channelId === channelId)
      : store.series,
  );
}

export interface RealSeriesSummary {
  id: string;
  channelId: string;
  title: string;
  description: string | null;
  posterGradient: [string, string];
  episodeCount: number;
  createdAt: string;
}

/** Real for a real channel (2026-09-17) — the Studio "Playlists & series" page's actual
 * create-series action; no mock counterpart (mock series are fixed seed data). */
export async function createSeries(
  channelId: string,
  title: string,
  description: string,
): Promise<RealSeriesSummary> {
  return verificationFetch<RealSeriesSummary>("/api/studio/series/", {
    method: "POST",
    body: JSON.stringify({ channelId, title, description }),
  });
}

export interface RealSeriesEpisode {
  id: string;
  slug: string;
  title: string;
  thumbnailUrl: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
}

export interface RealSeriesDetail extends RealSeriesSummary {
  episodes: RealSeriesEpisode[];
}

/** Real, public (2026-09-17) — episodes come from `videos.series_id` directly, not a
 * mock-style `seasons[].episodeIds` array, so this is a distinct shape/call from
 * getSeries() above rather than reusing it. */
export async function getSeriesDetail(seriesId: string): Promise<RealSeriesDetail> {
  return verificationFetch<RealSeriesDetail>(`/api/series/${encodeURIComponent(seriesId)}/`);
}

/* ============================== Analytics ================================ */

export async function getCreatorAnalytics(
  channelId: string,
  range: AnalyticsRange = "28d",
): Promise<CreatorAnalytics> {
  await latency();
  return buildCreatorAnalytics(channelId, range);
}

export async function getRevenueSummary(channelId: string): Promise<RevenueSummary> {
  if (looksLikeRealId(channelId)) {
    const res = await fetch(`/api/studio/revenue/?channelId=${encodeURIComponent(channelId)}`);
    if (!res.ok) throw new Error(`GET /api/studio/revenue failed with ${res.status}`);
    const real = (await res.json()) as {
      currency: string;
      lifetimeMinor: number;
      byStream: Array<{ label: string; valueMinor: number; share: number }>;
      transactions: Array<{
        id: string;
        date: string;
        description: string;
        kind: "rental" | "purchase" | "ppv";
        grossMinor: number;
      }>;
    };
    // available/pending/nextPayoutDate are honestly empty — no real payout system
    // exists yet (P4, needs Stripe Connect + bank-account KYC, a separate vendor
    // decision). studio/revenue/page.tsx shows this state plainly rather than
    // fabricating a balance or a payout date.
    return {
      channelId,
      currency: real.currency as Money["currency"],
      available: 0,
      pending: 0,
      lifetime: real.lifetimeMinor,
      nextPayoutDate: "",
      byStream: real.byStream.map((slice) => ({
        label: slice.label,
        value: slice.valueMinor,
        share: slice.share,
      })),
      transactions: real.transactions.map((txn) => ({
        id: txn.id,
        date: txn.date,
        description: txn.description,
        kind: txn.kind,
        gross: txn.grossMinor,
        fee: 0,
        net: txn.grossMinor,
      })),
    };
  }

  await latency();
  return buildRevenueSummary(channelId);
}

export async function getCampaignSeries(campaignId: string, days = 28) {
  await latency("fast");
  return buildCampaignSeries(campaignId, days);
}

/* ============================= Advertising =============================== */

export async function getCampaigns(advertiserId?: string): Promise<Campaign[]> {
  await latency("fast");
  return clone(
    advertiserId
      ? store.campaigns.filter((campaign) => campaign.advertiserId === advertiserId)
      : store.campaigns,
  );
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  await latency("fast");
  return clone(store.campaigns.find((campaign) => campaign.id === id) ?? null);
}

export async function createCampaign(
  payload: Omit<Campaign, "id" | "status" | "spend" | "metrics" | "createdAt" | "submittedAt">,
): Promise<Campaign> {
  await latency("slow");
  const now = new Date().toISOString();
  const campaign: Campaign = {
    ...payload,
    id: nextId("cmp"),
    status: "pending",
    spend: { amount: 0, currency: payload.budget.currency },
    metrics: {
      impressions: 0,
      completedViews: 0,
      clicks: 0,
      ctr: 0,
      conversions: 0,
      cpm: 0,
    },
    createdAt: now,
    submittedAt: now,
  };
  store.campaigns = [campaign, ...store.campaigns];

  // Submitted campaigns land in the admin queue — acceptance criterion §14.3.
  store.moderationQueue = [
    {
      id: nextId("mod"),
      kind: "campaign",
      targetId: campaign.id,
      title: `Campaign approval — ${campaign.name}`,
      channelId: campaign.advertiserId,
      submittedAt: now,
      priority: "normal",
      queue: "pending-review",
      reportReasons: [],
      reportCount: 0,
      status: "open",
      assignedTo: null,
      notes: `${campaign.creatives.length} creative(s) pending. Objective: ${campaign.objective}. Budget ${(campaign.budget.amount / 100).toFixed(2)} ${campaign.budget.currency}.`,
    },
    ...store.moderationQueue,
  ];

  recordAudit({
    actor: campaign.advertiserName,
    actorRole: "advertiser",
    action: "campaign.submitted",
    targetType: "campaign",
    targetId: campaign.id,
    reason: `"${campaign.name}" submitted for approval.`,
    severity: "info",
  });

  return clone(campaign);
}

export async function updateCampaignStatus(
  id: string,
  status: CampaignStatus,
  reason = "",
): Promise<Campaign | null> {
  await latency();
  const campaign = store.campaigns.find((item) => item.id === id);
  if (!campaign) return null;
  campaign.status = status;
  recordAudit({
    actor: store.user.name,
    actorRole: "admin",
    action: `campaign.${status}`,
    targetType: "campaign",
    targetId: id,
    reason: reason || `Campaign status set to ${status}.`,
    severity: status === "rejected" ? "warning" : "info",
  });
  return clone(campaign);
}

export async function getLeads(channelId: string): Promise<Lead[]> {
  await latency("fast");
  return clone(store.leads.filter((lead) => lead.channelId === channelId));
}

export async function updateLeadStatus(
  id: string,
  status: Lead["status"],
): Promise<Lead | null> {
  await latency("fast");
  const lead = store.leads.find((item) => item.id === id);
  if (!lead) return null;
  lead.status = status;
  return clone(lead);
}

export async function getProductLinks(channelId: string): Promise<ProductLink[]> {
  await latency("fast");
  return clone(store.productLinks.filter((link) => link.channelId === channelId));
}

export async function createProductLink(
  payload: Omit<ProductLink, "id" | "clicks" | "conversions">,
): Promise<ProductLink> {
  await latency();
  const link: ProductLink = { ...payload, id: nextId("plk"), clicks: 0, conversions: 0 };
  store.productLinks = [link, ...store.productLinks];
  return clone(link);
}

/* ================================ Admin ================================== */

export async function getAdminSummary(): Promise<AdminDashboardSummary> {
  await latency();
  const open = store.moderationQueue.filter((item) => item.status === "open");
  return {
    pendingContent: open.filter((item) => item.queue === "pending-review").length,
    reportedContent: open.filter((item) => item.queue === "reported").length,
    copyrightClaims: open.filter((item) => item.queue === "copyright").length,
    liveIncidents: open.filter((item) => item.queue === "live-incident").length,
    verificationQueue: open.filter((item) => item.queue === "verification").length,
    campaignsAwaitingApproval: store.campaigns.filter((c) => c.status === "pending").length,
    activeLiveEvents: store.liveEvents.filter((event) => event.status === "live").length,
    totalUsers: store.adminUsers.length,
    revenue30d: { amount: 184_920_00, currency: "GBP" },
    payoutsDue: { amount: 42_180_00, currency: "GBP" },
    trend: buildAdminTrend(30),
  };
}

export async function getModerationQueue(
  queue?: ModerationItem["queue"],
): Promise<ModerationItem[]> {
  if (looksLikeRealId(store.user.id)) {
    const qs = queue ? `?queue=${encodeURIComponent(queue)}` : "";
    const res = await fetch(`/api/admin/moderation/${qs}`);
    if (!res.ok) throw new Error(`GET /api/admin/moderation failed with ${res.status}`);
    const data = (await res.json()) as { items: ModerationItem[] };
    return data.items;
  }

  await latency("fast");
  const items = queue
    ? store.moderationQueue.filter((item) => item.queue === queue)
    : store.moderationQueue;
  const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
  return clone(
    [...items].sort(
      (a, b) =>
        Number(a.status !== "open") - Number(b.status !== "open") ||
        priorityOrder[a.priority] - priorityOrder[b.priority] ||
        a.submittedAt.localeCompare(b.submittedAt),
    ),
  );
}

export const MODERATION_ACTION_LABELS: Record<ModerationAction, string> = {
  approve: "Approve",
  reject: "Reject",
  "request-changes": "Request changes",
  restrict: "Restrict",
  demonetise: "Demonetise",
  "geo-block": "Geo-block",
  "age-restrict": "Age-restrict",
  suspend: "Suspend account",
  remove: "Remove",
};

export async function actionModerationItem(
  itemId: string,
  action: ModerationAction,
  reason: string,
): Promise<{ item: ModerationItem; audit: AuditLogEntry } | null> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/admin/moderation/${itemId}/action/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { audit: { id: string; targetId: string } };
    // Only `audit.id`/`audit.targetId` are ever read by a caller (the reviews page's
    // toast) — `item` here is a placeholder to satisfy the shared mock/real return type,
    // never rendered.
    return {
      item: {
        id: itemId,
        kind: "content",
        targetId: data.audit.targetId,
        title: "",
        channelId: "",
        submittedAt: new Date().toISOString(),
        priority: "normal",
        queue: "pending-review",
        reportReasons: [],
        reportCount: 0,
        status: "actioned",
        assignedTo: null,
        notes: "",
      },
      audit: {
        id: data.audit.id,
        actor: store.user.name,
        actorRole: "admin",
        action: `moderation.${action.replace("-", "_")}`,
        targetType: "content",
        targetId: data.audit.targetId,
        reason,
        createdAt: new Date().toISOString(),
        ip: "",
        severity: "info",
      },
    };
  }

  await latency();
  const item = store.moderationQueue.find((entry) => entry.id === itemId);
  if (!item) return null;

  item.status =
    action === "request-changes" ? "escalated" : action === "approve" ? "actioned" : "actioned";
  item.assignedTo = item.assignedTo ?? "You";
  item.notes = reason ? `${item.notes}\n\nDecision: ${reason}` : item.notes;

  // Apply the decision to the underlying record so the effect is visible
  // wherever that record is displayed.
  const video = store.videos.find((entry) => entry.id === item.targetId);
  if (video) {
    if (action === "approve") {
      video.status = "published";
      video.publishedAt = video.publishedAt ?? new Date().toISOString();
    }
    if (action === "reject") video.status = "rejected";
    if (action === "restrict" || action === "geo-block") video.status = "restricted";
    if (action === "remove") video.status = "archived";
    if (action === "age-restrict") video.rights.ageRating = "18";
    if (action === "demonetise") {
      video.pricing = { ...video.pricing, accessModels: ["free"] };
    }
    if (action === "geo-block") {
      video.rights.blockedCountries = Array.from(
        new Set([...video.rights.blockedCountries, "GB"]),
      );
    }
  }

  const campaign = store.campaigns.find((entry) => entry.id === item.targetId);
  if (campaign) {
    if (action === "approve") campaign.status = "active";
    if (action === "reject") campaign.status = "rejected";
  }

  const organisation = store.organisations.find(
    (entry) => entry.channelId === item.targetId || entry.id === item.targetId,
  );
  if (organisation && item.queue === "verification") {
    if (action === "approve") organisation.verificationStatus = "verified";
    if (action === "reject") organisation.verificationStatus = "rejected";
    const channel = store.channels.find((entry) => entry.id === organisation.channelId);
    if (channel && action === "approve") {
      channel.verificationStatus = "verified";
      channel.verified = true;
    }
  }

  const comment = store.comments.find((entry) => entry.id === item.targetId);
  if (comment && (action === "remove" || action === "reject")) comment.status = "removed";
  if (comment && action === "approve") comment.status = "published";

  const audit = recordAudit({
    actor: store.user.name,
    actorRole: "admin",
    action: `moderation.${action.replace("-", "_")}`,
    targetType: item.kind,
    targetId: item.targetId,
    reason: reason || `${MODERATION_ACTION_LABELS[action]} applied from the moderation queue.`,
    severity:
      action === "approve" ? "info" : action === "suspend" || action === "remove" ? "critical" : "warning",
  });

  return { item: clone(item), audit: clone(audit) };
}

export async function getAuditLog(filters: {
  actor?: string;
  severity?: AuditLogEntry["severity"];
  targetType?: string;
  query?: string;
} = {}): Promise<AuditLogEntry[]> {
  if (looksLikeRealId(store.user.id)) {
    const params = new URLSearchParams();
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.targetType) params.set("targetType", filters.targetType);
    if (filters.query) params.set("query", filters.query);
    const qs = params.toString();
    const res = await fetch(`/api/admin/audit-log/${qs ? `?${qs}` : ""}`);
    if (!res.ok) throw new Error(`GET /api/admin/audit-log failed with ${res.status}`);
    const data = (await res.json()) as { items: AuditLogEntry[] };
    // filters.actor has no real column to match against (actor_account_id, not a name)
    // and no caller passes it today — applied client-side if it ever does.
    return filters.actor ? data.items.filter((entry) => entry.actor === filters.actor) : data.items;
  }

  await latency("fast");
  return clone(
    store.auditLog.filter((entry) => {
      if (filters.actor && entry.actor !== filters.actor) return false;
      if (filters.severity && entry.severity !== filters.severity) return false;
      if (filters.targetType && entry.targetType !== filters.targetType) return false;
      if (filters.query) {
        const haystack =
          `${entry.action} ${entry.actor} ${entry.reason} ${entry.targetId}`.toLowerCase();
        if (!haystack.includes(filters.query.toLowerCase())) return false;
      }
      return true;
    }),
  );
}

export async function getAdminUsers() {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/admin/users/`);
    if (!res.ok) throw new Error(`GET /api/admin/users failed with ${res.status}`);
    const data = (await res.json()) as { items: AdminUserRow[] };
    return data.items;
  }

  await latency("fast");
  return clone(store.adminUsers);
}

export async function updateUserRole(
  userId: string,
  roles: User["roles"],
): Promise<void> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/admin/users/${userId}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles }),
    });
    if (!res.ok) throw new Error(`PATCH /api/admin/users/${userId} failed with ${res.status}`);
    return;
  }

  await latency("fast");
  const row = store.adminUsers.find((entry) => entry.id === userId);
  if (row) row.roles = roles;
  recordAudit({
    actor: store.user.name,
    actorRole: "admin",
    action: "user.roles_updated",
    targetType: "user",
    targetId: userId,
    reason: `Roles set to: ${roles.join(", ")}.`,
    severity: "notice",
  });
}

export async function updateUserStatus(
  userId: string,
  status: User["status"],
  reason: string,
): Promise<void> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/admin/users/${userId}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason }),
    });
    if (!res.ok) throw new Error(`PATCH /api/admin/users/${userId} failed with ${res.status}`);
    return;
  }

  await latency("fast");
  const row = store.adminUsers.find((entry) => entry.id === userId);
  if (row) row.status = status;
  recordAudit({
    actor: store.user.name,
    actorRole: "admin",
    action: `user.${status}`,
    targetType: "user",
    targetId: userId,
    reason,
    severity: status === "suspended" ? "critical" : "notice",
  });
}

export async function getOrganisations(): Promise<Organisation[]> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/admin/organisations/`);
    if (!res.ok) throw new Error(`GET /api/admin/organisations failed with ${res.status}`);
    const data = (await res.json()) as { items: Organisation[] };
    return data.items;
  }

  await latency("fast");
  return clone(store.organisations);
}

export async function updateOrganisationStatus(
  orgId: string,
  status: Organisation["verificationStatus"],
  reason: string,
): Promise<Organisation | null> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/admin/organisations/${orgId}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason }),
    });
    if (!res.ok) return null;
    // Only ok/error is read by the caller (admin/organisations/page.tsx invalidates
    // qk.organisations and refetches rather than using the return value) — refetch the
    // one row rather than the whole list for a lighter round trip.
    const refreshed = await fetch(`/api/admin/organisations/`);
    const data = (await refreshed.json()) as { items: Organisation[] };
    return data.items.find((org) => org.id === orgId) ?? null;
  }

  await latency();
  const org = store.organisations.find((entry) => entry.id === orgId);
  if (!org) return null;
  org.verificationStatus = status;
  org.timeline = [
    ...org.timeline.filter((step) => step.state !== "pending"),
    {
      id: nextId("tl"),
      label: status === "verified" ? "Verified" : "Verification rejected",
      at: new Date().toISOString(),
      actor: store.user.name,
      state: status === "verified" ? "done" : "failed",
    },
  ];
  const channel = store.channels.find((entry) => entry.id === org.channelId);
  if (channel) {
    channel.verificationStatus = status;
    channel.verified = status === "verified";
  }
  recordAudit({
    actor: store.user.name,
    actorRole: "admin",
    action: `organisation.${status}`,
    targetType: "organisation",
    targetId: orgId,
    reason,
    severity: status === "rejected" ? "warning" : "info",
  });
  return clone(org);
}

export async function getCases(): Promise<AdminCase[]> {
  await latency("fast");
  return clone(store.adminCases);
}

export async function addCaseNote(
  caseId: string,
  body: string,
  kind: "note" | "escalation" | "resolution",
): Promise<AdminCase | null> {
  await latency("fast");
  const item = store.adminCases.find((entry) => entry.id === caseId);
  if (!item) return null;
  item.notes = [
    ...item.notes,
    {
      id: nextId("note"),
      caseId,
      author: store.user.name,
      body,
      createdAt: new Date().toISOString(),
      kind,
    },
  ];
  if (kind === "escalation") item.status = "escalated";
  if (kind === "resolution") item.status = "resolved";
  recordAudit({
    actor: store.user.name,
    actorRole: "admin",
    action: `case.${kind}`,
    targetType: "case",
    targetId: caseId,
    reason: body.slice(0, 160),
    severity: kind === "escalation" ? "warning" : "info",
  });
  return clone(item);
}

export async function getPlatformConfig(): Promise<PlatformConfigTables> {
  if (looksLikeRealId(store.user.id)) {
    // Categories are already fully real (see getCategories() above) — the other six
    // tables have no backing table yet (no real consumer reads pricing rules/
    // commissions/taxes/currencies/payout rules today; building real CRUD for tables
    // nothing uses would be speculative, not a genuine gap — see
    // docs/DEVELOPMENT-PLAN.md's 2026-09-17 admin-screens entry), so they stay the mock
    // seed for now, merged alongside the real categories.
    // Cached onto store.config so updateConfigTable()'s diff below has a last-known-real
    // state to compare a "Featured" toggle against, not the stale mock seed.
    store.config.categories = await getCategories();
    return clone(store.config);
  }

  await latency("fast");
  return clone(store.config);
}

export async function addCategory(
  payload: Omit<Category, "id" | "videoCount">,
): Promise<Category> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/admin/categories/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not add the category.");
    }
    return (await res.json()) as Category;
  }

  await latency();
  const category: Category = { ...payload, id: nextId("cat"), videoCount: 0 };
  store.config.categories = [...store.config.categories, category];
  store.categories = [...store.categories, category];
  recordAudit({
    actor: store.user.name,
    actorRole: "admin",
    action: "config.category_created",
    targetType: "category",
    targetId: category.id,
    reason: `Category "${category.name}" added from platform settings.`,
    severity: "info",
  });
  return clone(category);
}

export async function updateConfigTable<K extends keyof PlatformConfigTables>(
  table: K,
  rows: PlatformConfigTables[K],
): Promise<PlatformConfigTables[K]> {
  // Real admin, "categories" table only: /admin/settings only ever mutates this table's
  // `featured` switch, one row at a time — diff against the previous rows (still cached
  // in store.config from getPlatformConfig()'s real branch above) to find which row(s)
  // changed, rather than needing a bulk-update endpoint for a table with no other real
  // write shape today.
  if (looksLikeRealId(store.user.id) && table === "categories") {
    const previous = store.config.categories;
    const changed = (rows as Category[]).filter((row) => {
      const before = previous.find((item) => item.id === row.id);
      return before && before.featured !== row.featured;
    });
    await Promise.all(
      changed.map((row) =>
        fetch(`/api/admin/categories/${row.id}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ featured: row.featured }),
        }),
      ),
    );
    store.config.categories = rows as Category[];
    return clone(rows);
  }

  await latency("fast");
  store.config[table] = rows;
  recordAudit({
    actor: store.user.name,
    actorRole: "admin",
    action: `config.${String(table)}_updated`,
    targetType: "config_table",
    targetId: String(table),
    reason: `${String(table)} table updated from platform settings.`,
    severity: "notice",
  });
  return clone(rows);
}

/* ============================== Account ================================== */

interface RealAccount {
  id: string;
  email: string;
  fullName: string;
  handle: string | null;
  avatarUrl: string | null;
  country: string | null;
  preferredLanguage: string | null;
  roles: string[];
  channelId: string | null;
}

// Overlays the real identity fields (from Postgres, via the session cookie) onto the
// otherwise-still-mock store.user — profiles, notification/privacy settings, parental
// controls etc. have nowhere real to live yet and stay exactly as the in-memory store
// seeds them. See src/lib/server/session.ts and docs/DEVELOPMENT-PLAN.md §9 (blocker #2)
// for why identity/sessions are real today but not yet Auth0-backed.
function applyRealAccount(account: RealAccount): void {
  store.user.id = account.id;
  store.user.email = account.email;
  store.user.name = account.fullName;
  if (account.handle) store.user.handle = account.handle;
  if (account.avatarUrl) store.user.avatarUrl = account.avatarUrl;
  if (account.country) store.user.country = account.country;
  if (account.preferredLanguage) store.user.language = account.preferredLanguage;
  if (account.channelId) store.user.channelId = account.channelId;
  if (account.roles.length > 0) {
    store.user.roles = account.roles as User["roles"];
    if (!store.user.roles.includes(store.user.activeRole)) {
      store.user.activeRole = store.user.roles[0];
    }
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const res = await fetch("/api/auth/me");
  const data = (await res.json()) as { account: RealAccount | null };

  if (!data.account) {
    store.loggedIn = false;
    persistLogin(false);
    return null;
  }

  applyRealAccount(data.account);
  store.loggedIn = true;
  persistLogin(true);
  return clone(store.user);
}

const REAL_ACCOUNT_FIELDS = ["name", "email", "handle", "country", "language"] as const;

// Live 2026-09-15 for the five real profile fields, for a real (Postgres-backed) account
// only — PATCH /api/auth/me/. Everything else on User (privacy, notificationPreferences,
// parentalControls, profiles, activeProfileId, avatarUrl, ...) has nowhere real to live yet
// (see applyRealAccount's header) and always stays local-only, for mock and real accounts
// alike — same split as updateChannel()'s avatarUrl/bannerUrl exclusion, and for the same
// reason where it's avatarUrl here too.
export async function updateUser(patch: Partial<User>): Promise<User> {
  await latency("fast");
  Object.assign(store.user, patch);

  if (looksLikeRealId(store.user.id)) {
    const realPatch: Partial<Record<(typeof REAL_ACCOUNT_FIELDS)[number], unknown>> = {};
    for (const key of REAL_ACCOUNT_FIELDS) {
      if (key in patch) realPatch[key] = patch[key];
    }
    if (Object.keys(realPatch).length > 0) {
      const res = await fetch("/api/auth/me/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(realPatch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `PATCH /api/auth/me failed with ${res.status}`);
      }
      const data = (await res.json()) as { account: RealAccount | null };
      if (data.account) applyRealAccount(data.account);
    }
  }

  return clone(store.user);
}

export async function switchProfile(profileId: string): Promise<User> {
  await latency("fast");
  store.user.activeProfileId = profileId;
  return clone(store.user);
}

export async function setActiveRole(role: User["activeRole"]): Promise<User> {
  store.user.activeRole = role;
  return clone(store.user);
}

export async function getPurchases(): Promise<PurchaseRecord[]> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/purchases/`);
    if (!res.ok) throw new Error(`GET /api/purchases failed with ${res.status}`);
    const data = (await res.json()) as {
      items: Array<{
        id: string;
        videoId: string;
        videoTitle: string;
        kind: "buy" | "rent" | "ppv";
        amountMinor: number;
        currency: string;
        status: PurchaseRecord["status"];
        invoiceNumber: string;
        purchasedAt: string;
        expiresAt: string | null;
      }>;
    };
    return data.items.map((item) => ({
      id: item.id,
      videoId: item.videoId,
      videoTitle: item.videoTitle,
      kind: item.kind,
      price: { amount: item.amountMinor, currency: item.currency as Money["currency"] },
      purchasedAt: item.purchasedAt,
      expiresAt: item.expiresAt,
      status: item.status,
      invoiceNumber: item.invoiceNumber,
    }));
  }

  await latency("fast");
  return clone(store.purchases);
}

const REAL_SUBSCRIPTION_STATUS: Record<string, Subscription["status"]> = {
  active: "active",
  past_due: "past-due",
  cancelled: "cancelled",
  incomplete: "past-due",
};

export async function getSubscriptions(): Promise<Subscription[]> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/subscriptions/`);
    if (!res.ok) throw new Error(`GET /api/subscriptions failed with ${res.status}`);
    const data = (await res.json()) as {
      items: Array<{
        id: string;
        status: string;
        priceMinor: number;
        currency: string;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
        createdAt: string;
      }>;
    };
    return data.items.map((item) => ({
      id: item.id,
      name: "Nexus Premium",
      kind: "platform",
      price: { amount: item.priceMinor, currency: item.currency as Money["currency"] },
      interval: "monthly",
      status: REAL_SUBSCRIPTION_STATUS[item.status] ?? "active",
      renewsAt: item.currentPeriodEnd ?? "",
      startedAt: item.createdAt,
      benefits: ["Ad-free viewing", "Included films and series", "Offline downloads"],
      cancelAtPeriodEnd: item.cancelAtPeriodEnd,
    }));
  }

  await latency("fast");
  return clone(store.subscriptions);
}

export async function cancelSubscription(id: string): Promise<Subscription | null> {
  if (looksLikeRealId(id)) {
    const res = await fetch(`/api/subscriptions/${id}/cancel/`, { method: "POST" });
    if (!res.ok) return null;
    const data = (await res.json()) as { currentPeriodEnd: string | null };
    return {
      id,
      name: "Nexus Premium",
      kind: "platform",
      price: { amount: 0, currency: "GBP" },
      interval: "monthly",
      status: "active",
      renewsAt: data.currentPeriodEnd ?? "",
      startedAt: "",
      benefits: [],
      cancelAtPeriodEnd: true,
    };
  }

  await latency();
  const subscription = store.subscriptions.find((item) => item.id === id);
  if (!subscription) return null;
  subscription.status = "cancelled";
  return clone(subscription);
}

export async function getNotifications(): Promise<AppNotification[]> {
  await latency("fast");
  return clone(store.notifications);
}

export async function markNotificationRead(id: string): Promise<void> {
  const notification = store.notifications.find((item) => item.id === id);
  if (notification) notification.read = true;
}

export async function markAllNotificationsRead(): Promise<void> {
  store.notifications.forEach((notification) => {
    notification.read = true;
  });
}

/* ------------------------------- Auth ---------------------------------- */

// Live 2026-09-15 — real account creation + session issuance via POST /api/auth/register
// (src/lib/server/localPassword.ts + session.ts), a temporary local-password front door
// standing in for Auth0 while shared-tenant access is blocked (docs/DEVELOPMENT-PLAN.md
// §9, blocker #2). Deliberately narrow: this covers identity/session/roles only, not the
// rest of the registration wizard's steps (org verification documents, MFA enrollment,
// mobile OTP) — those still need P2's document storage, real Auth0 MFA and an SMS
// provider respectively, so they stay exactly the cosmetic mock UI they already were.
export async function register(payload: {
  name: string;
  email: string;
  password: string;
  role: User["activeRole"];
  country: string;
}): Promise<{ userId: string; verificationRequired: true }> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Could not create your account.");
  }
  const data = (await res.json()) as { userId: string; verificationRequired: true };

  store.user = {
    ...store.user,
    id: data.userId,
    name: payload.name,
    email: payload.email,
    country: payload.country,
    activeRole: payload.role,
    roles: Array.from(new Set([...store.user.roles, payload.role])),
    emailVerified: false,
    mobileVerified: false,
  };
  store.loggedIn = true;
  persistLogin(true);
  return data;
}

/** Mock OTP. The code is always 000000 and is shown in the UI on purpose. Still mock —
 * see register()'s comment above on why: no SMS/email provider exists yet to send a real
 * one, and this was never blocking anything real either way. */
export const MOCK_OTP = "000000";

export async function verifyOtp(code: string): Promise<{ ok: boolean; message?: string }> {
  await latency();
  if (code.replace(/\s/g, "") !== MOCK_OTP) {
    return { ok: false, message: "That code is not correct. Use 000000 for this demo." };
  }
  store.user.emailVerified = true;
  store.user.mobileVerified = true;
  return { ok: true };
}

// Live 2026-09-15 — real credential check + session issuance via POST /api/auth/login.
// Same temporary-local-password caveat as register() above.
export async function login(payload: {
  email: string;
  password: string;
  remember?: boolean;
}): Promise<User> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Could not sign you in.");
  }
  const data = (await res.json()) as { account: RealAccount };

  applyRealAccount(data.account);
  store.loggedIn = true;
  persistLogin(true);
  return clone(store.user);
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {
    // Best-effort: even if the network call fails, the client still forgets the
    // session below — worst case a still-valid server-side session outlives this tab,
    // which expires on its own (session.ts's expiry) rather than leaking access.
  });
  store.loggedIn = false;
  persistLogin(false);
}

/* ------------------------------ Magazine -------------------------------- */
// Always real — no mock predecessor. Authoring-only: Nexus composes an article and
// submits it to MYHitch Lens (a separate platform); there is no Nexus-hosted public
// magazine or admin review — see docs/DEVELOPMENT-PLAN.md's 2026-09-16 correction entry
// and src/lib/server/lensIntegration.ts.
async function magazineFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${path} failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getMyMagazineArticles(): Promise<MagazineArticle[]> {
  const data = await magazineFetch<{ items: MagazineArticle[] }>("/api/magazine/articles/");
  return data.items;
}

export async function createMagazineArticle(payload: {
  aboutTitle: string;
  videoId?: string | null;
  title: string;
  dek?: string;
}): Promise<MagazineArticle> {
  return magazineFetch<MagazineArticle>("/api/magazine/articles/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getMagazineArticle(id: string): Promise<MagazineArticle> {
  return magazineFetch<MagazineArticle>(`/api/magazine/articles/${id}/`);
}

export async function updateMagazineArticle(
  id: string,
  patch: { title?: string; dek?: string | null; bodyHtml?: string; aboutTitle?: string },
): Promise<MagazineArticle> {
  return magazineFetch<MagazineArticle>(`/api/magazine/articles/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function submitMagazineArticle(id: string): Promise<MagazineArticle> {
  return magazineFetch<MagazineArticle>(`/api/magazine/articles/${id}/submit/`, { method: "POST" });
}

export async function withdrawMagazineArticle(id: string): Promise<MagazineArticle> {
  return magazineFetch<MagazineArticle>(`/api/magazine/articles/${id}/withdraw/`, { method: "POST" });
}

/* --------------------------- Sponsorship ("Exchange Hub") ---------------- */
// Always real, same as Magazine above — no mock predecessor exists for this feature.
// Authoring-only: Exchange Hub itself lives on MYHitch Connect (a separate platform);
// there is no Nexus-hosted public listing page, admin review, or sponsor inquiry inbox —
// see docs/DEVELOPMENT-PLAN.md's 2026-09-16 correction entry.
async function sponsorshipFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${path} failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getMySponsorshipListings(): Promise<SponsorshipListing[]> {
  const data = await sponsorshipFetch<{ items: SponsorshipListing[] }>("/api/sponsorship/listings/");
  return data.items;
}

export async function createSponsorshipListing(payload: {
  videoId?: string | null;
  projectName: string;
}): Promise<SponsorshipListing> {
  return sponsorshipFetch<SponsorshipListing>("/api/sponsorship/listings/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSponsorshipListing(id: string): Promise<SponsorshipListing> {
  return sponsorshipFetch<SponsorshipListing>(`/api/sponsorship/listings/${id}/`);
}

export async function updateSponsorshipListing(
  id: string,
  patch: { projectName?: string; pitchHtml?: string; videoId?: string | null; rewardTypes?: SponsorshipRewardType[] },
): Promise<SponsorshipListing> {
  return sponsorshipFetch<SponsorshipListing>(`/api/sponsorship/listings/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function submitSponsorshipListing(id: string): Promise<SponsorshipListing> {
  return sponsorshipFetch<SponsorshipListing>(`/api/sponsorship/listings/${id}/submit/`, { method: "POST" });
}

export async function withdrawSponsorshipListing(id: string): Promise<SponsorshipListing> {
  return sponsorshipFetch<SponsorshipListing>(`/api/sponsorship/listings/${id}/withdraw/`, { method: "POST" });
}

/* ---------------- Organisation verification (2026-09-17) ------------------ */
// Real for a real organisation only — no mock counterpart. The free half of
// docs/DEVELOPMENT-PLAN.md's 2026-09-17 entry: ABN Lookup, documents and the
// declaration/submission gate. ID verification, bank validation and risk screening are
// deliberately not built here (paid vendors, not yet approved).

export interface OrganizationVerification {
  organizationId: string;
  legalEntityName: string | null;
  tradingName: string | null;
  abn: string | null;
  acn: string | null;
  entityType: string | null;
  gstRegistered: boolean | null;
  businessRegistrationDate: string | null;
  countryOfRegistration: string;
  registeredAddress: string | null;
  principalAddress: string | null;
  operatingLocations: string | null;
  addressSameAsRegistered: boolean;
  contactFullName: string | null;
  contactPosition: string | null;
  contactEmail: string | null;
  contactMobile: string | null;
  authorisedPersonName: string | null;
  authorisedPersonPosition: string | null;
  industry: string | null;
  businessDescription: string | null;
  website: string | null;
  platforms: string[];
  productsServices: string | null;
  informationAccurate: boolean;
  authorityConfirmed: boolean;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  abnLookupCheckedAt: string | null;
  abnLookupStatus: string | null;
  abnLookupEntityName: string | null;
  abnLookupEntityType: string | null;
  abnLookupGstEffectiveFrom: string | null;
  abnLookupState: string | null;
  abnLookupPostcode: string | null;
  submittedAt: string | null;
  status: string;
}

export type OrganizationVerificationDraft = Partial<
  Omit<
    OrganizationVerification,
    | "organizationId"
    | "abnLookupCheckedAt"
    | "abnLookupStatus"
    | "abnLookupEntityName"
    | "abnLookupEntityType"
    | "abnLookupGstEffectiveFrom"
    | "abnLookupState"
    | "abnLookupPostcode"
    | "submittedAt"
    | "status"
  >
>;

export interface AbnLookupResult {
  found: boolean;
  message: string;
  abn: string;
  abnStatus: string;
  abnStatusEffectiveFrom: string | null;
  acn: string;
  entityName: string;
  entityTypeCode: string;
  entityTypeName: string;
  gstEffectiveFrom: string | null;
  addressState: string;
  addressPostcode: string;
}

export interface VerificationDocument {
  id: string;
  documentType: string;
  fileName: string;
  uploadedAt: string;
  url: string;
}

async function verificationFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${path} failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getOrganizationVerification(organizationId: string): Promise<OrganizationVerification> {
  return verificationFetch<OrganizationVerification>(
    `/api/studio/organization/verification/?organizationId=${encodeURIComponent(organizationId)}`,
  );
}

export async function saveOrganizationVerificationDraft(
  organizationId: string,
  draft: OrganizationVerificationDraft,
): Promise<void> {
  await verificationFetch("/api/studio/organization/verification/", {
    method: "PATCH",
    body: JSON.stringify({ organizationId, ...draft }),
  });
}

export async function runOrganizationAbnLookup(organizationId: string, abn: string): Promise<AbnLookupResult> {
  return verificationFetch<AbnLookupResult>("/api/studio/organization/verification/abn-lookup/", {
    method: "POST",
    body: JSON.stringify({ organizationId, abn }),
  });
}

export async function getVerificationDocuments(organizationId: string): Promise<VerificationDocument[]> {
  const data = await verificationFetch<{ items: VerificationDocument[] }>(
    `/api/studio/organization/verification/documents/?organizationId=${encodeURIComponent(organizationId)}`,
  );
  return data.items;
}

export async function uploadVerificationDocument(
  organizationId: string,
  documentType: "business_registration" | "licence" | "insurance" | "other",
  file: File,
): Promise<{ id: string; fileName: string }> {
  const formData = new FormData();
  formData.append("organizationId", organizationId);
  formData.append("documentType", documentType);
  formData.append("file", file);
  const res = await fetch("/api/studio/organization/verification/documents/", { method: "POST", body: formData });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to upload the document (${res.status}).`);
  }
  return res.json();
}

export async function submitOrganizationVerification(organizationId: string): Promise<void> {
  await verificationFetch("/api/studio/organization/verification/submit/", {
    method: "POST",
    body: JSON.stringify({ organizationId }),
  });
}

export { NOW };
