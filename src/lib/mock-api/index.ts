/* =========================================================================
   MYHitch Nexus — mock API
   -------------------------------------------------------------------------
   Every function here is async and typed exactly as the eventual HTTP client
   would be. Components never touch ./store or ./data directly — they call
   these functions through the React Query hooks in ./hooks.ts.

   To go live: replace each body with a fetch() to the matching endpoint. The
   signatures and return types are the contract.
   ========================================================================= */

import { pickGradient, sleep } from "@/lib/utils";
import { buildAdminTrend, buildCampaignSeries, buildCreatorAnalytics, buildRevenueSummary } from "./data/analytics";
import { NOW, daysAhead } from "./data/videos";
import { nextId, persistLogin, recordAudit, store } from "./store";
import type {
  AccessModel,
  AdminCase,
  AdminDashboardSummary,
  AdminFinanceSummary,
  AdminUserRow,
  AnalyticsRange,
  AppNotification,
  AuditLogEntry,
  BulkImportRow,
  Campaign,
  CampaignCreative,
  CampaignStatus,
  Category,
  Channel,
  ChatMessage,
  Comment,
  ContentStatus,
  ContentType,
  CreatorAnalytics,
  Entitlement,
  EntitlementReason,
  FeaturedContent,
  Lead,
  LiveEvent,
  MagazineArticle,
  MediaKind,
  ModerationAction,
  Money,
  ModerationItem,
  Organisation,
  PlatformAnalyticsSummary,
  PlatformConfigTables,
  PlaybackBlockReason,
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
  ViewerPlaylist,
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

  // A slug (not a UUID and not a mock "vid_" prefix) is ambiguous: the real catalogue
  // was seeded from this same mock dataset (scripts/index-catalogue.mjs), so most mock slugs also name a real, published,
  // purchasable video — e.g. "the-saltmarsh" is both a mock title and a real Postgres one
  // with real Stripe pricing behind it. Found live 2026-09-20: visiting a real video's
  // slug silently served the mock one instead, with no error, hiding an otherwise fully
  // working real purchase flow behind a fake preview. getVideoById() already matches by
  // slug and filters to status='published', so try the real catalogue first and only
  // fall back to mock on a genuine miss (a purely mock-only slug, or a real video that
  // isn't published yet).
  if (!id.startsWith("vid_")) {
    const realRes = await fetch(`/api/videos/${encodeURIComponent(id)}/`);
    if (realRes.ok) {
      return (await realRes.json()) as Video;
    }
  }

  await latency("fast");
  const video = store.videos.find((item) => item.id === id || item.slug === id);
  return video ? clone(video) : null;
}

export async function getRelatedVideos(id: string, limit = 12): Promise<Video[]> {
  // 1. If this is a real video ID or slug, try querying the real catalogue
  if (!id.startsWith("vid_")) {
    try {
      const videoRes = await fetch(`/api/videos/${encodeURIComponent(id)}/`);
      if (videoRes.ok) {
        const video = (await videoRes.json()) as Video;
        const searchRes = await fetch(
          `/api/videos?limit=${limit + 1}${video.channelId ? `&channelId=${encodeURIComponent(video.channelId)}` : ""}`,
        );
        if (searchRes.ok) {
          const data = (await searchRes.json()) as { items?: Video[] };
          const items = Array.isArray(data.items) ? data.items : [];
          // A real, genuinely empty result (this channel has no other videos yet) must
          // return empty, not fall through to the mock catalogue below — same "real empty
          // result discarded for a fake fallback" bug already found and fixed twice
          // elsewhere (getChatMessages/getPolls) — `.length > 0` used to gate this exactly
          // the same way, so a real video with no real related videos yet showed
          // fabricated mock titles in its "related" rail instead of an honest empty one.
          return items.filter((v) => v.id !== id).slice(0, limit);
        }
      }
    } catch {
      // Fall through to store fallback
    }
  }

  await latency("fast");
  const video = store.videos.find((item) => item.id === id || item.slug === id);
  if (!video) {
    // If video not in mock store, return published videos as fallback so the rail is never empty
    return clone(
      store.videos
        .filter((item) => item.status === "published" && item.id !== id)
        .slice(0, limit),
    );
  }
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

// GET /api/channels/{id} and /api/channels both return catalogue.ts's ChannelDetail
// shape, which is honest that handle/tagline/about/country/contactEmail/avatarUrl/
// bannerUrl can be null (a channel that never filled them in — the common case for a
// freshly-registered creator) — but the client Channel type declares them required
// strings, and both call sites below used to `as Channel` the raw JSON straight through
// with no mapping. That let a genuine null slip past the type system: rendering it (e.g.
// channel-settings' `${tagline.length}/80` character counter) crashed the whole page
// with "Cannot read properties of null" the moment a channel had any of these fields
// unset. Found live 2026-09-21 on a fresh creator account's own channel settings page.
function mapRealChannel(raw: {
  id: string;
  handle: string | null;
  name: string;
  kind: string;
  tagline: string | null;
  about: string | null;
  verified: boolean;
  country: string | null;
  languages: string[] | null;
  followers: number;
  totalViews: number;
  videoCount: number;
  joinedAt: string;
  bannerGradient: [string, string];
  avatarGradient: [string, string];
  avatarUrl: string | null;
  bannerUrl: string | null;
  links: Array<{ label: string; href: string }> | null;
  verificationStatus: Channel["verificationStatus"];
  contactEmail: string | null;
}): Channel {
  return {
    id: raw.id,
    handle: raw.handle ?? "",
    name: raw.name,
    kind: raw.kind as Channel["kind"],
    tagline: raw.tagline ?? "",
    about: raw.about ?? "",
    verified: raw.verified,
    country: raw.country ?? "",
    languages: raw.languages ?? [],
    followers: raw.followers,
    totalViews: raw.totalViews,
    videoCount: raw.videoCount,
    joinedAt: raw.joinedAt,
    bannerGradient: raw.bannerGradient,
    avatarGradient: raw.avatarGradient,
    avatarUrl: raw.avatarUrl ?? undefined,
    bannerUrl: raw.bannerUrl ?? undefined,
    links: raw.links ?? [],
    verificationStatus: raw.verificationStatus,
    contactEmail: raw.contactEmail ?? "",
  };
}

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
    return mapRealChannel(await res.json());
  }

  // A handle (not a UUID and not a mock "ch_" prefix) might name a real channel.
  if (!id.startsWith("ch_")) {
    const realRes = await fetch(`/api/channels/${encodeURIComponent(id)}/`);
    if (realRes.ok) {
      return mapRealChannel(await realRes.json());
    }
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
  const data = (await res.json()) as { items: Parameters<typeof mapRealChannel>[0][] };
  return data.items.map(mapRealChannel);
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
    return mapRealChannel(await res.json());
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

  // Real videos: every gate (owner/geo/age/free/ad-supported/payment) is now enforced
  // server-side, in one place (playbackAuthorization.ts's authorizeVideoAccess(), behind
  // this route) — for every caller, signed in or not. This used to only be true for the
  // one case that goes through a real payment; owner/geo/age/free/ad-supported below were
  // read straight from client-side mock store state (store.user.channelId,
  // store.requestCountry, store.user.profiles) for a real video too, which a client could
  // simply spoof. Everything from here down the function is mock-store logic that stays
  // exactly as it was, but only for a mock video now.
  if (looksLikeRealId(videoId)) {
    const profileParam = looksLikeRealId(store.user.activeProfileId ?? "")
      ? `?profileId=${encodeURIComponent(store.user.activeProfileId!)}`
      : "";
    const res = await fetch(`/api/videos/${videoId}/entitlement/${profileParam}`);
    if (res.ok) {
      const real = (await res.json()) as {
        granted: boolean;
        reason?: EntitlementReason;
        blockReason?: PlaybackBlockReason;
        expiresAt?: string;
      };
      if (!real.granted) {
        return { ...base, granted: false, reason: "none", blockReason: real.blockReason ?? "unavailable" };
      }
      return { ...base, granted: true, reason: real.reason ?? "purchased", expiresAt: real.expiresAt };
    }
    // The real gate is unreachable — the same honest "unavailable" state the not-found
    // branch above uses, rather than falling into the mock logic below with real video
    // data (exactly the bug this branch exists to close).
    return { ...base, granted: false, reason: "none", blockReason: "unavailable" };
  }

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

  // Parental & profile-based age restriction guard (Nexus Family Tier)
  const activeProfile = store.user.profiles?.find((p) => p.id === store.user.activeProfileId);
  const profileMax = activeProfile?.maxAgeRating;
  const parentalMax = store.user.parentalControls?.enabled
    ? store.user.parentalControls.maxAgeRating
    : null;
  const effectiveMaxRating = profileMax || parentalMax;

  if (effectiveMaxRating && video.rights?.ageRating) {
    const RATING_WEIGHT: Record<string, number> = {
      U: 0,
      ALL: 0,
      PG: 1,
      "12": 2,
      TEEN: 2,
      "15": 3,
      "18": 4,
      "18+": 4,
    };
    const videoWeight = RATING_WEIGHT[video.rights.ageRating] ?? 0;
    const maxWeight = RATING_WEIGHT[effectiveMaxRating] ?? 4;
    if (videoWeight > maxWeight) {
      return {
        ...base,
        granted: false,
        reason: "none",
        blockReason: "age-gate",
      };
    }
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
    if (
      (models.includes("subscription") ||
        models.includes("rent") ||
        models.includes("buy")) &&
      hasPremium
    ) {
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

/** Real Nexus Premium (channelId omitted) and real channel memberships (channelId is a
 * real channel's id) both redirect to a real Stripe Checkout session; a mock channelId
 * (or a fully mock account) falls through to the simulated subscription below — a real
 * subscription signup has no synchronous "subscribed" the way the mock always did. */
const MOCK_PLAN_PRICE: Record<"premium" | "family" | "business", { month: number; year?: number }> = {
  premium: { month: 999, year: 9900 },
  family: { month: 1499 },
  business: { month: 2900, year: 29000 },
};

/** Channel memberships are retired — see subscriptions.ts's header comment — so this now
 * only ever starts one of the three paid platform plans. `interval` defaults to monthly;
 * Family has no yearly option in the pricing model, same restriction the real checkout
 * route enforces. */
export async function startSubscription(
  plan: "premium" | "family" | "business",
  interval: "month" | "year" = "month",
): Promise<Subscription> {
  // store.loggedIn matters here, not just looksLikeRealId(store.user.id) alone — a
  // signed-out visitor's store never resets store.user back off its default seeded mock
  // identity (usr_viewer), so without this a guest could reach the mock branch below and
  // see a real-looking "Premium activated" toast without Stripe, or any real account,
  // ever being involved. Callers should already be gating this behind a signed-in check
  // of their own (see video-client.tsx's/plans-client.tsx's requireSignIn/currentUser
  // guards) — this is defense in depth, not the only check.
  if (store.loggedIn && looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/subscriptions/checkout/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, interval, returnPath: window.location.pathname }),
    });
    if (res.ok) {
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
      return new Promise<Subscription>(() => {});
    }
    // If Stripe is not configured on this environment (e.g. local dev, test runner),
    // fall through to the mock subscription so the UI and tests continue to work.
    if (res.status !== 503) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not start checkout.");
    }
  }

  await latency("slow");
  const display = PLAN_DISPLAY[plan];
  const amount = MOCK_PLAN_PRICE[plan][interval] ?? MOCK_PLAN_PRICE[plan].month;
  const subscription: Subscription = {
    id: nextId("sub"),
    name: display.name,
    kind: "platform",
    price: { amount, currency: "GBP" },
    interval: interval === "year" ? "annual" : "monthly",
    status: "active",
    renewsAt: daysAhead(interval === "year" ? 365 : 30),
    startedAt: new Date().toISOString(),
    benefits: display.benefits,
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
    const profileParam = looksLikeRealId(store.user.activeProfileId ?? "")
      ? `?profileId=${encodeURIComponent(store.user.activeProfileId!)}`
      : "";
    const res = await fetch(`/api/videos/${videoId}/progress/${profileParam}`);
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
    const profileId = looksLikeRealId(store.user.activeProfileId ?? "") ? store.user.activeProfileId : undefined;
    const res = await fetch(`/api/videos/${videoId}/progress/`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionSeconds, profileId }),
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
  const profileParam = looksLikeRealId(store.user.activeProfileId ?? "")
    ? `?profileId=${encodeURIComponent(store.user.activeProfileId!)}`
    : "";
  const [real, mock] = await Promise.all([
    fetch(`/api/continue-watching/${profileParam}`)
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

/** The Report button used to just show a toast on click — no reason, no details, and
 * nothing written anywhere for a real video, ever (see moderation.ts's reportVideo()'s
 * own header comment for the real 'reported' queue this now actually reaches). */
export async function reportVideo(videoId: string, reason: string, details?: string): Promise<void> {
  if (looksLikeRealId(videoId)) {
    const res = await fetch(`/api/videos/${videoId}/report/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, details }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not submit your report.");
    }
    return;
  }
  await latency("fast");
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
  // Guests have no per-viewer watchlist state in the mock layer (store.watchlist is a
  // single shared seed, not per-session) — treat every guest toggle as a no-op, same as
  // toggleFollow above, rather than silently mutating the signed-in demo user's list.
  if (!store.loggedIn) return false;
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
      // Same guest guard as isFollowing/toggleWatchlist above — store.watchlist is the
      // signed-in demo user's seeded list, not a per-session guest list.
      if (!store.loggedIn) return [] as Video[];
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

/* ============================ Viewer playlists ============================ */
// Real from day one (viewerPlaylists.ts) — a personal playlist never existed for a viewer
// to reach before this (found live, 2026-09-25: "how can I create a playlist, can't find
// it" — only the channel-side "series" concept and the Watchlist existed). No mock
// fallback branch, since there's no legacy shape to preserve.

async function playlistsFetch<T>(path: string, init?: RequestInit): Promise<T> {
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

export async function getMyPlaylists(videoId?: string): Promise<ViewerPlaylist[]> {
  const query = videoId ? `?videoId=${encodeURIComponent(videoId)}` : "";
  const data = await fetch(`/api/playlists/${query}`)
    .then((res) => (res.ok ? res.json() : { items: [] }))
    .then((d) => d as { items: ViewerPlaylist[] })
    .catch(() => ({ items: [] as ViewerPlaylist[] }));
  return data.items;
}

export async function getPlaylistDetail(
  playlistId: string,
): Promise<{ playlist: ViewerPlaylist; videos: Video[] } | null> {
  const res = await fetch(`/api/playlists/${playlistId}/`);
  if (!res.ok) return null;
  return res.json();
}

// Named createMyPlaylist/updateMyPlaylist, not createPlaylist/updatePlaylist — those
// names are already taken by the creator-side channel playlist ("series") feature further
// down this file; deletePlaylist/addVideoToPlaylist/removeVideoFromPlaylist don't collide.
export async function createMyPlaylist(input: {
  title: string;
  description?: string;
  visibility?: ViewerPlaylist["visibility"];
}): Promise<ViewerPlaylist> {
  const data = await playlistsFetch<{ playlist: ViewerPlaylist }>("/api/playlists/", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.playlist;
}

export async function updateMyPlaylist(
  playlistId: string,
  patch: { title?: string; description?: string; visibility?: ViewerPlaylist["visibility"] },
): Promise<void> {
  await playlistsFetch(`/api/playlists/${playlistId}/`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await playlistsFetch(`/api/playlists/${playlistId}/`, { method: "DELETE" });
}

export async function addVideoToPlaylist(playlistId: string, videoId: string): Promise<void> {
  await playlistsFetch(`/api/playlists/${playlistId}/videos/${videoId}/`, { method: "POST" });
}

export async function removeVideoFromPlaylist(playlistId: string, videoId: string): Promise<void> {
  await playlistsFetch(`/api/playlists/${playlistId}/videos/${videoId}/`, { method: "DELETE" });
}

/* ================================ Live =================================== */

// Real live_events rows (liveEvents.ts) carry only identity/ownership/lifecycle/access —
// no vendor exists for real ingest, so the display-only fields the mock LiveEvent shape
// still requires (streamKey/ingestUrl/posterGradient/viewerCount/...) are synthesized the
// same deterministic-placeholder way videoPublishing.ts's pickGradient() already does for
// a real video's poster. LiveSignalPendingSurface (already built) is what actually tells
// the viewer there's no real video signal — this mapping exists so the event's real
// identity, ownership and chat/poll access-mode (the parts that don't need a vendor) are
// reachable from the real UI at all, not to fake a stream that plays.
const REAL_STATUS_TO_MOCK: Record<string, LiveEvent["status"]> = {
  scheduled: "upcoming",
  live: "live",
  ended: "ended",
  cancelled: "cancelled",
};

interface RealLiveEventShape {
  id: string;
  channelId: string;
  title: string;
  description: string | null;
  status: "scheduled" | "live" | "ended" | "cancelled";
  accessType: LiveEvent["accessType"];
  scheduledStart: string | null;
  actualStart: string | null;
  endedAt: string | null;
  chatEnabled: boolean;
  createdAt: string;
}

function mapRealLiveEvent(real: RealLiveEventShape): LiveEvent {
  return {
    id: real.id,
    channelId: real.channelId,
    title: real.title,
    description: real.description ?? "",
    status: REAL_STATUS_TO_MOCK[real.status] ?? "upcoming",
    accessType: real.accessType,
    scheduledStart: real.scheduledStart ?? real.createdAt,
    actualStart: real.actualStart,
    endedAt: real.endedAt,
    timezone: "UTC",
    posterGradient: pickGradient(real.id),
    viewerCount: 0,
    peakViewers: 0,
    streamKey: "",
    ingestUrl: "",
    chatEnabled: real.chatEnabled,
    replayVideoId: null,
    replayPublished: false,
    categoryIds: [],
  };
}

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
  if (looksLikeRealId(id)) {
    const res = await fetch(`/api/live/events/${id}/`);
    if (!res.ok) return null;
    return mapRealLiveEvent(await res.json());
  }
  await latency("fast");
  return clone(store.liveEvents.find((event) => event.id === id) ?? null);
}

export async function getChannelLiveEvents(channelId: string): Promise<LiveEvent[]> {
  if (looksLikeRealId(channelId)) {
    const res = await fetch(`/api/live/events/?channelId=${encodeURIComponent(channelId)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { events: RealLiveEventShape[] };
    return data.events.map(mapRealLiveEvent);
  }
  await latency("fast");
  return clone(store.liveEvents.filter((event) => event.channelId === channelId));
}

export async function createLiveEvent(
  payload: Omit<
    LiveEvent,
    "id" | "streamKey" | "ingestUrl" | "viewerCount" | "peakViewers" | "replayVideoId" | "replayPublished" | "actualStart" | "endedAt"
  >,
): Promise<LiveEvent> {
  if (looksLikeRealId(payload.channelId)) {
    const res = await fetch("/api/live/events/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title,
        description: payload.description,
        accessType: payload.accessType,
        scheduledStart: payload.scheduledStart,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? "Failed to create live event");
    }
    const data = (await res.json()) as { event: RealLiveEventShape };
    return mapRealLiveEvent(data.event);
  }

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

export async function startLiveEvent(eventId: string): Promise<LiveEvent | null> {
  if (looksLikeRealId(eventId)) {
    const res = await fetch(`/api/live/events/${eventId}/start/`, { method: "POST" });
    if (!res.ok) return null;
    const data = (await res.json()) as { event: RealLiveEventShape };
    return mapRealLiveEvent(data.event);
  }
  await latency();
  const event = store.liveEvents.find((item) => item.id === eventId);
  if (!event) return null;
  event.status = "live";
  event.actualStart = new Date().toISOString();
  // Honest 0, not a fabricated number — there is no real viewer-presence tracking behind
  // this event (no real live-events backend exists at all yet), so any non-zero count
  // here would be a made-up figure shown as fact across the homepage, live listing, the
  // event page, channel pages, the studio dashboard and even the admin live panel.
  event.viewerCount = 0;
  event.peakViewers = 0;
  recordAudit({
    actor: store.user.name,
    actorRole: "creator",
    action: "live.started",
    targetType: "live_event",
    targetId: eventId,
    reason: `Started live broadcast for "${event.title}".`,
    severity: "info",
  });
  return clone(event);
}

export async function endLiveEvent(eventId: string): Promise<LiveEvent | null> {
  if (looksLikeRealId(eventId)) {
    const res = await fetch(`/api/live/events/${eventId}/end/`, { method: "POST" });
    if (!res.ok) return null;
    const data = (await res.json()) as { event: RealLiveEventShape };
    return mapRealLiveEvent(data.event);
  }
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
  try {
    const res = await fetch(`/api/live/${eventId}/chat`);
    if (res.ok) {
      const data = await res.json();
      // A real (possibly genuinely empty) result must never fall through to the mock
      // seed messages below — `.length > 0` used to gate that fallthrough, so a live
      // event with real but zero chat messages silently showed fabricated seed-persona
      // conversation instead of an honest empty state. Found live: sent a real chat
      // message, then saw three messages from personas that never said anything, none of
      // them the one just sent — the real (correctly empty) response was being discarded.
      if (Array.isArray(data.messages)) {
        return data.messages.map((m: {
          id: string;
          streamId: string;
          authorName: string;
          authorAvatarUrl: string | null;
          message: string;
          createdAt: string;
          authorRole: "viewer" | "creator" | "moderator" | "subscriber";
        }) => ({
          id: m.id,
          liveEventId: m.streamId,
          authorName: m.authorName,
          authorAvatarUrl: m.authorAvatarUrl,
          authorGradient: ["#6366f1", "#4338ca"],
          body: m.message,
          sentAt: m.createdAt,
          role: m.authorRole,
          status: "visible",
        }));
      }
    }
  } catch {
    // Network or SSR fallback to in-memory store
  }
  return clone(
    store.chatMessages.filter((message) => message.liveEventId === eventId),
  );
}

export async function sendChatMessage(
  eventId: string,
  body: string,
): Promise<ChatMessage> {
  try {
    const res = await fetch(`/api/live/${eventId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: body }),
    });
    if (res.ok) {
      const data = await res.json();
      const m = data.message;
      const chatMsg: ChatMessage = {
        id: m.id,
        liveEventId: m.streamId,
        authorName: m.authorName,
        authorAvatarUrl: m.authorAvatarUrl,
        authorGradient: store.user.avatarGradient,
        body: m.message,
        sentAt: m.createdAt,
        role: m.authorRole,
        status: "visible",
      };
      store.chatMessages = [...store.chatMessages, chatMsg];
      return chatMsg;
    }
  } catch {
    // Fallback to in-memory store
  }
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
  try {
    const res = await fetch(`/api/live/${eventId}/poll`);
    if (res.ok) {
      const data = await res.json();
      // A successful real response with no active poll (data.poll === null, the honest,
      // common case) must return an empty list, not fall through to fake seed polls —
      // same class of bug as getChatMessages()'s identical fix just above.
      if (!data.poll) return [];
      const p = data.poll;
      const realPoll: Poll = {
        id: p.id,
        liveEventId: p.streamId,
        question: p.question,
        options: (p.options as { text: string; votes: number }[]).map((opt, idx: number) => ({
          id: `opt_${idx}`,
          label: opt.text,
          votes: opt.votes,
        })),
        status: p.status === "active" ? "open" : "closed",
      };
      return [realPoll];
    }
  } catch {
    // Fallback to store
  }
  return clone(store.polls.filter((poll) => poll.liveEventId === eventId));
}

export async function votePoll(eventId: string, pollId: string, optionId: string): Promise<Poll | null> {
  const optionIndex = parseInt(optionId.replace("opt_", ""), 10);
  if (!isNaN(optionIndex)) {
    try {
      // Was pointed at the literal path "/api/live/stream/poll" (a URL that doesn't
      // exist — the real route is /api/live/[id]/poll), so every vote 404'd and silently
      // fell back to the local-only store below. The real, correctly-built server-side
      // vote aggregation in liveChat.ts was unreachable from the shipped UI because of
      // this one wrong path.
      const res = await fetch(`/api/live/${eventId}/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "vote", pollId, optionIndex }),
      });
      if (res.ok) {
        const data = await res.json();
        const p = data.poll;
        return {
          id: p.id,
          liveEventId: p.streamId,
          question: p.question,
          options: (p.options as { text: string; votes: number }[]).map((opt, idx: number) => ({
            id: `opt_${idx}`,
            label: opt.text,
            votes: opt.votes,
          })),
          status: p.status === "active" ? "open" : "closed",
        };
      }
    } catch {
      // Fallback
    }
  }
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
  kind: MediaKind = "video",
): Promise<{ path: string; signedUrl: string; maxBytes: number }> {
  const res = await fetch("/api/studio/uploads/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelId, fileName, fileSizeBytes, kind }),
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
        kind: draft.kind,
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
    kind: draft.kind,
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

/** Real for a real channel — see src/lib/server/analytics.ts's header for exactly what's
 * real (views/watch time/completion/retention/revenue/country/device/language, all
 * derived from the existing watch_progress heartbeat, real request headers and the real
 * revenue ledger) and what stays honestly empty (traffic sources, ad performance,
 * subscribers lost — no real data source exists for any of them yet). Same
 * `CreatorAnalytics` shape either way; countries/devices/languages come back as an empty
 * array either when there's genuinely no data source (never true for a real channel) or
 * when FR-6.9.6's privacy suppression withheld it for too small an audience — the UI
 * distinguishes those via `isRealChannel` plus the range's view count, not this field. */
export async function getCreatorAnalytics(
  channelId: string,
  range: AnalyticsRange = "28d",
): Promise<CreatorAnalytics> {
  if (looksLikeRealId(channelId)) {
    const res = await fetch(
      `/api/studio/analytics/?channelId=${encodeURIComponent(channelId)}&range=${encodeURIComponent(range)}`,
    );
    if (!res.ok) throw new Error(`GET /api/studio/analytics failed with ${res.status}`);
    const real = (await res.json()) as {
      channelId: string;
      range: AnalyticsRange;
      currency: string;
      totals: {
        views: number;
        uniqueViewers: number;
        watchTimeSeconds: number;
        completionRate: number;
        averageViewDuration: number;
        subscribersGained: number;
        revenueMinor: number;
      };
      deltas: { views: number | null; watchTime: number | null; revenue: number | null; uniqueViewers: number | null };
      timeSeries: Array<{ date: string; views: number; watchHours: number; uniqueViewers: number; revenueMinor: number }>;
      retention: Array<{ percent: number; audience: number }>;
      topVideos: Array<{ videoId: string; title: string; views: number; watchHours: number; completionRate: number }>;
      revenueByContent: Array<{ videoId: string; title: string; revenueMinor: number; views: number; model: string }>;
      countries: Array<{ label: string; value: number; share: number }>;
      devices: Array<{ label: string; value: number; share: number }>;
      languages: Array<{ label: string; value: number; share: number }>;
    };
    return {
      channelId: real.channelId,
      range: real.range,
      totals: {
        views: real.totals.views,
        uniqueViewers: real.totals.uniqueViewers,
        watchTimeSeconds: real.totals.watchTimeSeconds,
        completionRate: real.totals.completionRate,
        averageViewDuration: real.totals.averageViewDuration,
        subscribersGained: real.totals.subscribersGained,
        subscribersLost: 0,
        revenue: { amount: real.totals.revenueMinor, currency: real.currency as Money["currency"] },
      },
      deltas: real.deltas,
      timeSeries: real.timeSeries.map((point) => ({
        date: point.date,
        views: point.views,
        watchHours: point.watchHours,
        uniqueViewers: point.uniqueViewers,
        revenue: point.revenueMinor,
      })),
      retention: real.retention,
      trafficSources: [],
      countries: real.countries,
      languages: real.languages,
      devices: real.devices,
      revenueByContent: real.revenueByContent.map((row) => ({
        videoId: row.videoId,
        title: row.title,
        revenue: row.revenueMinor,
        views: row.views,
        model: row.model as AccessModel,
      })),
      adPerformance: { impressions: 0, fillRate: 0, ecpm: 0, revenue: 0 },
      topVideos: real.topVideos,
    };
  }

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
  if (looksLikeRealId(campaignId)) {
    const res = await fetch(`/api/campaigns/${campaignId}/series/?days=${days}`);
    if (!res.ok) throw new Error(`GET /api/campaigns/${campaignId}/series failed with ${res.status}`);
    const { series } = (await res.json()) as {
      series: Array<{ date: string; impressions: number; completedViews: number; clicks: number; conversions: number; spendMinor: number }>;
    };
    return series.map((point) => ({
      date: point.date,
      impressions: point.impressions,
      completedViews: point.completedViews,
      clicks: point.clicks,
      conversions: point.conversions,
      spend: point.spendMinor,
    }));
  }

  await latency("fast");
  return buildCampaignSeries(campaignId, days);
}

/* ============================= Advertising =============================== */

// Real creative assets don't carry a colour — every existing card (admin/ads,
// business/campaigns/new) renders a gradient swatch, so a real creative is given one
// deterministically (by id) rather than reworking that rendering for a thumbnail it
// doesn't have yet.
const REAL_CREATIVE_GRADIENTS: Array<[string, string]> = [
  ["#0E4C5E", "#04141B"],
  ["#5C2A14", "#170A05"],
  ["#123A2E", "#05120E"],
  ["#2A1B4D", "#0B1020"],
  ["#4A2A38", "#150A0F"],
];

function gradientForId(id: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return REAL_CREATIVE_GRADIENTS[hash % REAL_CREATIVE_GRADIENTS.length];
}

interface RealCampaignCreative {
  id: string;
  name: string;
  format: CampaignCreative["format"];
  durationSeconds: number;
  assetUrl: string | null;
  clickThroughUrl: string | null;
  status: CampaignCreative["status"];
}

interface RealCampaign {
  id: string;
  advertiserOrgId: string;
  advertiserName: string;
  name: string;
  objective: Campaign["objective"];
  status: CampaignStatus;
  budgetMinor: number;
  dailyCapMinor: number;
  cpmMinor: number;
  currency: string;
  spendMinor: number;
  startDate: string;
  endDate: string;
  targeting: Campaign["targeting"];
  placements: string[];
  frequencyCap: Campaign["frequencyCap"];
  brandSafety: Campaign["brandSafety"];
  creatives: RealCampaignCreative[];
  metrics: { impressions: number; completedViews: number; clicks: number; ctr: number; conversions: number; cpmMinor: number };
  createdAt: string;
  submittedAt: string | null;
}

function mapRealCampaign(raw: RealCampaign): Campaign {
  const currency = raw.currency as Money["currency"];
  return {
    id: raw.id,
    advertiserId: raw.advertiserOrgId,
    advertiserName: raw.advertiserName,
    name: raw.name,
    objective: raw.objective,
    status: raw.status,
    budget: { amount: raw.budgetMinor, currency },
    dailyCap: { amount: raw.dailyCapMinor, currency },
    spend: { amount: raw.spendMinor, currency },
    cpm: { amount: raw.cpmMinor, currency },
    startDate: raw.startDate,
    endDate: raw.endDate,
    targeting: raw.targeting,
    creatives: raw.creatives.map((c) => ({
      id: c.id,
      name: c.name,
      format: c.format,
      durationSeconds: c.durationSeconds,
      gradient: gradientForId(c.id),
      clickThroughLabel: "Learn more",
      assetUrl: c.assetUrl,
      clickThroughUrl: c.clickThroughUrl,
      status: c.status,
    })),
    placements: raw.placements,
    frequencyCap: raw.frequencyCap,
    brandSafety: raw.brandSafety,
    metrics: {
      impressions: raw.metrics.impressions,
      completedViews: raw.metrics.completedViews,
      clicks: raw.metrics.clicks,
      ctr: raw.metrics.ctr,
      conversions: raw.metrics.conversions,
      cpm: raw.metrics.cpmMinor,
    },
    createdAt: raw.createdAt,
    submittedAt: raw.submittedAt,
  };
}

export async function getCampaigns(advertiserId?: string): Promise<Campaign[]> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch("/api/campaigns/");
    if (!res.ok) throw new Error(`GET /api/campaigns failed with ${res.status}`);
    const { campaigns } = (await res.json()) as { campaigns: RealCampaign[] };
    return campaigns.map(mapRealCampaign);
  }

  await latency("fast");
  return clone(
    advertiserId
      ? store.campaigns.filter((campaign) => campaign.advertiserId === advertiserId)
      : store.campaigns,
  );
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  if (looksLikeRealId(id)) {
    const res = await fetch(`/api/campaigns/${id}/`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET /api/campaigns/${id} failed with ${res.status}`);
    const { campaign } = (await res.json()) as { campaign: RealCampaign };
    return mapRealCampaign(campaign);
  }

  await latency("fast");
  return clone(store.campaigns.find((campaign) => campaign.id === id) ?? null);
}

/** Creates the real campaign row only — a real creative's actual file has to be
 * uploaded separately (see uploadCampaignCreative() below) since this payload's
 * `creatives` are already-built display objects with no File attached; the wizard calls
 * this first to get a real campaignId, then uploads any staged creatives against it. */
export async function createCampaign(
  payload: Omit<Campaign, "id" | "status" | "spend" | "metrics" | "createdAt" | "submittedAt">,
): Promise<Campaign> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch("/api/campaigns/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payload.name,
        objective: payload.objective,
        budgetMinor: payload.budget.amount,
        dailyCapMinor: payload.dailyCap.amount,
        cpmMinor: payload.cpm.amount,
        startDate: payload.startDate,
        endDate: payload.endDate,
        targeting: payload.targeting,
        placements: payload.placements,
        frequencyCap: payload.frequencyCap,
        brandSafety: payload.brandSafety,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Failed to create the campaign (${res.status}).`);
    }
    const { id } = (await res.json()) as { id: string };
    const created = await getCampaign(id);
    if (!created) throw new Error("Campaign created but could not be re-fetched.");
    return created;
  }

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
  if (looksLikeRealId(id)) {
    const res = await fetch(`/api/campaigns/${id}/status/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Failed to update the campaign (${res.status}).`);
    }
    return getCampaign(id);
  }

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

/** Real-only (no mock branch: a mock campaign's creatives are already fully built by
 * createCampaign()'s payload, gradient and all — there's nothing to upload). Two-step
 * signed-upload-URL flow, identical shape to createStudioUploadUrl()/uploadMasterFile()
 * for a video master: create the creative row + signed URL, then PUT the real file to it. */
export async function uploadCampaignCreative(
  campaignId: string,
  input: {
    name: string;
    format: CampaignCreative["format"];
    durationSeconds: number;
    clickThroughUrl: string | null;
    file: File;
  },
): Promise<void> {
  const res = await fetch(`/api/campaigns/${campaignId}/creatives/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      format: input.format,
      durationSeconds: input.durationSeconds,
      clickThroughUrl: input.clickThroughUrl,
      fileName: input.file.name,
      fileSizeBytes: input.file.size,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to create an upload URL for "${input.name}" (${res.status}).`);
  }
  const { signedUrl } = (await res.json()) as { signedUrl: string };
  await uploadMasterFile(signedUrl, input.file);
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
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/admin/summary/`);
    if (!res.ok) throw new Error(`GET /api/admin/summary failed with ${res.status}`);
    return (await res.json()) as AdminDashboardSummary;
  }

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

/** Real for a real admin (2026-09-24) — the /admin/finance page's real backing, replacing
 * the previous mock buildPayouts()/revenueMix fabrication. No real admin session is ever
 * unreal (requireRole() in admin/layout.tsx gates the whole section server-side against a
 * real Postgres-backed session), so the mock branch below is a placeholder that should
 * never actually be reached in practice. */
export async function getAdminFinance(): Promise<AdminFinanceSummary> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/admin/finance/`);
    if (!res.ok) throw new Error(`GET /api/admin/finance failed with ${res.status}`);
    return (await res.json()) as AdminFinanceSummary;
  }

  await latency();
  return {
    platform: { commission30dMinor: 0, payoutsDueMinor: 0, currency: "GBP" },
    trend: [],
    revenueByStream: [],
    organizations: [],
    failedPayoutCount: 0,
  };
}

/** Real for a real admin (2026-09-24) — the /admin/analytics page's real backing. Same
 * "mock branch is a placeholder, never actually reached" reasoning as getAdminFinance()
 * above — every real /admin session is already real by construction. */
export async function getAdminAnalytics(range: AnalyticsRange = "28d"): Promise<PlatformAnalyticsSummary> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/admin/analytics/?range=${range}`);
    if (!res.ok) throw new Error(`GET /api/admin/analytics failed with ${res.status}`);
    return (await res.json()) as PlatformAnalyticsSummary;
  }

  await latency();
  return {
    range,
    totals: { views: 0, uniqueViewers: 0, watchTimeSeconds: 0, completionRate: 0, averageViewDuration: 0 },
    deltas: { views: null, watchTime: null, uniqueViewers: null },
    timeSeries: [],
    topVideos: [],
    topChannels: [],
    countries: [],
    devices: [],
    languages: [],
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

export type CreateAdminUserResult =
  | { outcome: "success"; id: string; tempPassword: string }
  | { outcome: "email_taken" };

export async function createAdminUser(input: {
  email: string;
  fullName: string;
  roles: User["roles"];
}): Promise<CreateAdminUserResult> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/admin/users/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.status === 409) return { outcome: "email_taken" };
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `POST /api/admin/users failed with ${res.status}`);
    }
    const data = (await res.json()) as { id: string; tempPassword: string };
    return { outcome: "success", id: data.id, tempPassword: data.tempPassword };
  }

  await latency("fast");
  if (store.adminUsers.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
    return { outcome: "email_taken" };
  }
  const id = nextId("usr");
  store.adminUsers.unshift({
    id,
    name: input.fullName,
    email: input.email,
    roles: input.roles,
    status: "active",
    country: "—",
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    flags: 0,
    mustChangePassword: true,
  });
  recordAudit({
    actor: store.user.name,
    actorRole: "admin",
    action: "user.created",
    targetType: "user",
    targetId: id,
    reason: `Created directly with roles: ${input.roles.join(", ")}.`,
    severity: "notice",
  });
  // Mock action — this made-up password isn't real credentials for a real login, same
  // "mock" honesty as every other admin config-table write against a mock session.
  return { outcome: "success", id, tempPassword: "MOCK-0000-0000-0000" };
}

export async function setPassword(newPassword: string): Promise<void> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/auth/set-password/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `POST /api/auth/set-password failed with ${res.status}`);
    }
    store.user.mustChangePassword = false;
    return;
  }

  await latency("fast");
  store.user.mustChangePassword = false;
}

export async function updateUserRole(
  userId: string,
  roles: User["roles"],
  reason: string,
): Promise<void> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/admin/users/${userId}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles, reason }),
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
    reason: `Roles set to: ${roles.join(", ")}. ${reason}`,
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

const COMMISSION_SCOPE_LABEL: Record<string, string> = {
  purchase_rental: "Rental & purchase",
  ppv: "Pay-per-view events",
  membership: "Channel memberships",
};

export async function getPlatformConfig(): Promise<PlatformConfigTables> {
  if (looksLikeRealId(store.user.id)) {
    // Categories and commissions are real now — the remaining five tables have no
    // backing table yet (no real consumer reads pricing rules/taxes/currencies/payout
    // rules today; building real CRUD for tables nothing uses would be speculative, not
    // a genuine gap — see docs/DEVELOPMENT-PLAN.md's 2026-09-17 admin-screens entry), so
    // they stay the mock seed for now, merged alongside the real ones.
    // Cached onto store.config so updateConfigTable()'s diff below has a last-known-real
    // state to compare a "Featured"/commission-rate change against, not the stale mock
    // seed. Advertising/affiliate scopes are dropped entirely for a real admin — neither
    // real ads nor real commerce-affiliate links exist, so a rate for either would be
    // configuring something that can never actually apply to a real transaction.
    store.config.categories = await getCategories();
    const res = await fetch(`/api/admin/commissions/`);
    if (res.ok) {
      const data = (await res.json()) as {
        items: Array<{ id: string; scope: string; platformSharePct: number; effectiveFrom: string }>;
      };
      // listCommissionRates() returns full history (needed to apply the right rate to
      // past transactions) — the settings table only ever shows the current rate per
      // scope, same as the mock always did.
      const latestByScope = new Map<string, (typeof data.items)[number]>();
      for (const item of data.items) {
        const existing = latestByScope.get(item.scope);
        if (!existing || new Date(item.effectiveFrom) > new Date(existing.effectiveFrom)) {
          latestByScope.set(item.scope, item);
        }
      }
      store.config.commissions = Array.from(latestByScope.values()).map((item) => ({
        id: item.id,
        scope: COMMISSION_SCOPE_LABEL[item.scope] ?? item.scope,
        scopeKey: item.scope,
        platformShare: item.platformSharePct,
        creatorShare: 100 - item.platformSharePct,
        effectiveFrom: item.effectiveFrom,
      }));
    }
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

  // Real admin, "commissions" table: same one-row-at-a-time diff, comparing
  // platformShare (the only field the settings UI's edit action can change) against
  // the previous real rows.
  if (looksLikeRealId(store.user.id) && table === "commissions") {
    type CommissionRow = PlatformConfigTables["commissions"][number];
    const previous = store.config.commissions;
    const changed = (rows as CommissionRow[]).filter((row) => {
      const before = previous.find((item) => item.id === row.id);
      return before && before.platformShare !== row.platformShare && row.scopeKey;
    });
    await Promise.all(
      changed.map((row) =>
        fetch(`/api/admin/commissions/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: row.scopeKey, platformSharePct: row.platformShare }),
        }),
      ),
    );
    // A rate change is a genuinely new row (new id, new effectiveFrom) — refetch rather
    // than trust the client-constructed `rows` as the new real state.
    const config = await getPlatformConfig();
    return config.commissions as PlatformConfigTables[K];
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
  mustChangePassword: boolean;
}

// Overlays the real identity fields (from Postgres, via the session cookie) onto the
// otherwise-still-mock store.user — profiles, notification/privacy settings, parental
// controls etc. have nowhere real to live yet and stay exactly as the in-memory store
// seeds them. See src/lib/server/session.ts and docs/DEVELOPMENT-PLAN.md §9 (blocker #2)
// for why identity/sessions are real today but not yet Auth0-backed.
function applyRealAccount(account: RealAccount): void {
  // store.watchlist/store.following start life pre-populated with the demo persona's own
  // seeded entries (data/users.ts) — fine for the mock-only demo experience, but every
  // real account was getting those same seeded entries merged into its own real
  // watchlist/follows (getWatchlist()/toggleFollow() below only guarded the signed-out
  // case, not "signed in as a real account that isn't the demo persona"). Found live
  // 2026-09-20: a real account's Watchlist page showed titles it never added. Reset both
  // arrays the first time THIS specific real identity is applied in this store instance
  // (not on every call — a real account's own same-session mock-video toggles, which
  // have nowhere real to persist, should survive a later currentUser refetch).
  if (store.user.id !== account.id) {
    store.watchlist = [];
    store.following = [];
    // Same leak, worse: getContinueWatching()'s mock branch merged store.watchProgress's
    // seeded demo entries into every account's watch history unconditionally — not even
    // gated on store.loggedIn like watchlist/following were.
    store.watchProgress = [];
    // checkEntitlement() already guards store.subscriptions' always-active seeded
    // Premium/membership against granting fake access to a *real* video (see that
    // function's own comment on the incident this caused) — but a mock video's
    // entitlement check has no such guard, so a real account still saw Mara's seeded
    // channel membership unlock any mock video gated on that channel, for free, without
    // ever joining it. Resetting here closes that the same way as the arrays above.
    store.subscriptions = [];
  }

  store.user.id = account.id;
  store.user.email = account.email;
  store.user.name = account.fullName;
  // handle/avatarUrl/channelId must be reset, not just conditionally set — the store's
  // baseline is the mock demo persona's own data (data/users.ts's currentUser), so any
  // real account without its own handle/avatar/channel (the common case — most accounts
  // never set a custom handle or upload a photo) kept showing Mara Solace's handle,
  // avatar image and channel instead of correctly showing "none". Found live 2026-09-21:
  // a real viewer account with no avatar showed the mock demo's own avatar file
  // (/images/avatars/usr_viewer.svg) — its initials, not the real account's. name/email
  // above already do this correctly (plain assignment, no `if`); this brings these three
  // in line with that same always-authoritative pattern.
  store.user.handle = account.handle ?? "";
  store.user.avatarUrl = account.avatarUrl ?? undefined;
  store.user.channelId = account.channelId ?? undefined;
  if (account.country) store.user.country = account.country;
  if (account.preferredLanguage) store.user.language = account.preferredLanguage;
  if (account.roles.length > 0) {
    store.user.roles = account.roles as User["roles"];
    if (!store.user.roles.includes(store.user.activeRole)) {
      store.user.activeRole = store.user.roles[0];
    }
  }
  store.user.mustChangePassword = account.mustChangePassword;

  // Household viewer profiles (FR-6.2.6) have a real table but nothing reads/writes it
  // for real yet — same "not a genuine gap, just not wired" category as the five admin
  // config tables. Left unhandled here, every real account showed the mock seed's own
  // household ("Mara", "Jonah", "Immy", "Kids") in the profile switcher and used
  // whichever of them was "active" for the header avatar's name/initials — so a fresh
  // real signed-up account saw someone else's family and someone else's initials.
  // Found live 2026-09-20. Until real profile CRUD exists, every real account gets
  // exactly one profile: itself — never the demo seed's fictional household, and never
  // a real user's data pretending to be from a source it isn't.
  const selfProfileId = `real-self-${account.id}`;
  store.user.profiles = [
    {
      id: selfProfileId,
      name: account.fullName,
      kind: "adult",
      avatarGradient: store.user.avatarGradient,
      avatarUrl: account.avatarUrl ?? undefined,
      maxAgeRating: "18",
      language: account.preferredLanguage ?? store.user.language,
    },
  ];
  store.user.activeProfileId = selfProfileId;
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

  if (looksLikeRealId(data.account.id)) {
    try {
      const pRes = await fetch("/api/account/profiles");
      if (pRes.ok) {
        const pData = (await pRes.json()) as {
          profiles: Array<{
            id: string;
            name: string;
            avatarUrl: string | null;
            isKids: boolean;
            maturityRating: "ALL" | "PG" | "TEEN" | "18+";
            hasPinSet: boolean;
          }>;
        };
        // A real (possibly genuinely empty) profiles list must replace the seeded mock
        // demo profiles, not leave them in place — `pData.profiles.length > 0` used to gate
        // this assignment, so any real account with zero real profiles (most accounts —
        // profiles are an opt-in Family Tier feature) kept showing the mock seed's fake
        // demo family members in its profile switcher instead of an honest "no profiles
        // yet" state. Same "real empty result discarded for a mock fallback" bug pattern
        // already found and fixed twice elsewhere (getChatMessages/getPolls).
        if (Array.isArray(pData.profiles)) {
          const profileGradients: Array<[string, string]> = [
            ["#5B8DEF", "#243F80"],
            ["#38A8E0", "#175E85"],
            ["#34C77B", "#12694A"],
            ["#9B7BF0", "#5B3BB0"],
            ["#EC6AA8", "#9D2C6B"],
            ["#E5A83B", "#96661A"],
          ];
          store.user.profiles = pData.profiles.map((p, idx) => ({
            id: p.id,
            name: p.name,
            kind: p.isKids ? "child" : p.maturityRating === "TEEN" ? "teen" : "adult",
            avatarGradient: profileGradients[idx % profileGradients.length] ?? ["#5B8DEF", "#243F80"],
            avatarUrl: p.avatarUrl ?? undefined,
            maxAgeRating: p.maturityRating === "ALL" ? "U" : p.maturityRating === "PG" ? "PG" : p.maturityRating === "TEEN" ? "12" : "18",
            language: store.user.language,
            hasPinSet: p.hasPinSet,
            isKids: p.isKids,
          }));
          store.user.activeProfileId = store.user.profiles.some((p) => p.id === store.user.activeProfileId)
            ? store.user.activeProfileId
            : store.user.profiles[0]?.id;
        }
      }
    } catch {
      // Keep default self profile on error
    }
  }

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

/** The real check goes to the server (profilePin.ts) — the PIN itself never lived
 * client-side for a real account to begin with, so there's nothing to compare locally.
 * Mock/demo profiles keep the old local compare against `profile.pinCode`, consistent
 * with the rest of this file's mock branches never enforcing real security. */
export async function verifyProfilePin(profileId: string, pin: string): Promise<boolean> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/account/profiles/${profileId}/verify-pin/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Failed to verify PIN (${res.status}).`);
    }
    const data = (await res.json()) as { correct: boolean };
    return data.correct;
  }
  await latency("fast");
  const profile = store.user.profiles?.find((p) => p.id === profileId);
  return Boolean(profile?.pinCode && profile.pinCode === pin);
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
        videoId: string | null;
        videoTitle: string;
        kind: "buy" | "rent" | "ppv" | "subscription";
        amountMinor: number;
        currency: string;
        status: PurchaseRecord["status"];
        invoiceNumber: string;
        purchasedAt: string;
        expiresAt: string | null;
        receiptUrl: string | null;
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
      receiptUrl: item.receiptUrl,
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

const PLAN_DISPLAY: Record<string, { name: string; benefits: string[] }> = {
  premium: {
    name: "Nexus Premium",
    benefits: [
      "Ad-free MYHitch content",
      "All videos, music & live streams",
      "Background play (audio)",
      "Premium content bundles",
      "Downloads (where available)",
      "Enhanced video quality",
      "Early access to new features",
      "Priority support",
    ],
  },
  family: {
    name: "Nexus Family",
    benefits: [
      "All Premium benefits",
      "Up to 5 family profiles",
      "Parental controls",
      "Profile-based recommendations",
      "Safe viewing settings",
      "Family watchlists",
      "Ad-free MYHitch content",
      "Priority support",
    ],
  },
  business: {
    name: "Nexus Business",
    benefits: [
      "Verified business channel",
      "Commercial video campaigns",
      "Product & service links",
      "Campaign analytics",
      "Lead generation tools",
      "Employee access (up to 5)",
      "Integration with MYHitch platforms",
      "Priority business support",
    ],
  },
};

export async function getSubscriptions(): Promise<Subscription[]> {
  if (looksLikeRealId(store.user.id)) {
    const res = await fetch(`/api/subscriptions/`);
    if (!res.ok) throw new Error(`GET /api/subscriptions failed with ${res.status}`);
    const data = (await res.json()) as {
      items: Array<{
        id: string;
        plan: "premium" | "family" | "business";
        billingInterval: "month" | "year";
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
      name: PLAN_DISPLAY[item.plan]?.name ?? "Nexus Premium",
      plan: item.plan,
      kind: "platform",
      price: { amount: item.priceMinor, currency: item.currency as Money["currency"] },
      interval: item.billingInterval === "year" ? "annual" : "monthly",
      status: REAL_SUBSCRIPTION_STATUS[item.status] ?? "active",
      renewsAt: item.currentPeriodEnd ?? "",
      startedAt: item.createdAt,
      benefits: PLAN_DISPLAY[item.plan]?.benefits ?? [],
      cancelAtPeriodEnd: item.cancelAtPeriodEnd,
    }));
  }

  // A guest (store.loggedIn === false) must never see the seeded demo persona's mock
  // subscriptions — store.user stays pre-populated with that persona at all times (see
  // store.ts's seed()), so looksLikeRealId(store.user.id) alone doesn't distinguish "a
  // real signed-in account" from "nobody signed in yet." Found live: /plans showed an
  // anonymous visitor an "Active Plan"/"Current Plan" badge on Nexus Premium — the exact
  // same guard watchlist/following/watch-history already use, just missing here.
  if (!store.loggedIn) return [];

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
  acceptedTerms: boolean;
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
  if (looksLikeRealId(organizationId)) {
    return verificationFetch<OrganizationVerification>(
      `/api/studio/organization/verification/?organizationId=${encodeURIComponent(organizationId)}`,
    );
  }
  const channel = store.channels.find((c) => c.id === organizationId || c.handle === organizationId);
  return {
    organizationId,
    legalEntityName: "Nexus Enterprise Demo Pty Ltd",
    tradingName: null,
    abn: "51 824 753 556",
    acn: null,
    entityType: "Company",
    gstRegistered: true,
    businessRegistrationDate: null,
    countryOfRegistration: "AU",
    registeredAddress: null,
    principalAddress: null,
    operatingLocations: null,
    addressSameAsRegistered: true,
    contactFullName: null,
    contactPosition: null,
    contactEmail: null,
    contactMobile: null,
    authorisedPersonName: null,
    authorisedPersonPosition: null,
    industry: null,
    businessDescription: null,
    website: null,
    platforms: [],
    productsServices: null,
    informationAccurate: false,
    authorityConfirmed: false,
    termsAccepted: false,
    privacyAccepted: false,
    abnLookupCheckedAt: null,
    abnLookupStatus: null,
    abnLookupEntityName: null,
    abnLookupEntityType: null,
    abnLookupGstEffectiveFrom: null,
    abnLookupState: null,
    abnLookupPostcode: null,
    submittedAt: null,
    status: channel?.verificationStatus ?? "unverified",
  };
}

export async function saveOrganizationVerificationDraft(
  organizationId: string,
  draft: OrganizationVerificationDraft,
): Promise<void> {
  if (looksLikeRealId(organizationId)) {
    await verificationFetch("/api/studio/organization/verification/", {
      method: "PATCH",
      body: JSON.stringify({ organizationId, ...draft }),
    });
  }
}

export async function runOrganizationAbnLookup(organizationId: string, abn: string): Promise<AbnLookupResult> {
  if (looksLikeRealId(organizationId)) {
    return verificationFetch<AbnLookupResult>("/api/studio/organization/verification/abn-lookup/", {
      method: "POST",
      body: JSON.stringify({ organizationId, abn }),
    });
  }
  return {
    found: true,
    message: "Active ABN Found",
    abn: abn || "51 824 753 556",
    abnStatus: "Active",
    abnStatusEffectiveFrom: "2020-07-01",
    acn: "",
    entityName: "Nexus Enterprise Demo Pty Ltd",
    entityTypeCode: "IND",
    entityTypeName: "Australian Private Company",
    gstEffectiveFrom: "2020-07-01",
    addressState: "NSW",
    addressPostcode: "2000",
  };
}

export async function getVerificationDocuments(organizationId: string): Promise<VerificationDocument[]> {
  if (looksLikeRealId(organizationId)) {
    const data = await verificationFetch<{ items: VerificationDocument[] }>(
      `/api/studio/organization/verification/documents/?organizationId=${encodeURIComponent(organizationId)}`,
    );
    return data.items;
  }
  return [];
}

export async function uploadVerificationDocument(
  organizationId: string,
  documentType: "business_registration" | "licence" | "insurance" | "other",
  file: File,
): Promise<{ id: string; fileName: string }> {
  if (looksLikeRealId(organizationId)) {
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
  return { id: `doc_${Date.now()}`, fileName: file.name };
}

export async function submitOrganizationVerification(organizationId: string): Promise<void> {
  if (looksLikeRealId(organizationId)) {
    await verificationFetch("/api/studio/organization/verification/submit/", {
      method: "POST",
      body: JSON.stringify({ organizationId }),
    });
  }
  const channel = store.channels.find((c) => c.id === organizationId || c.handle === organizationId);
  if (channel) {
    channel.verificationStatus = "verified";
    channel.verified = true;
  }
}

export { NOW };
