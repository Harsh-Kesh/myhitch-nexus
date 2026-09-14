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
  HomeRail,
  Lead,
  LiveEvent,
  ModerationAction,
  ModerationItem,
  Organisation,
  PlatformConfigTables,
  Playlist,
  Poll,
  ProductLink,
  PurchaseRecord,
  RevenueSummary,
  SearchFilters,
  SearchResult,
  Series,
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

export async function getFeaturedContent(): Promise<FeaturedContent> {
  await latency();
  const published = store.videos.filter((video) => video.status === "published");
  const byId = (id: string) => published.find((video) => video.id === id);

  const continueIds = store.watchProgress
    .filter((entry) => !entry.completed && byId(entry.videoId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((entry) => entry.videoId);

  const followedIds = published
    .filter((video) => store.following.includes(video.channelId))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .map((video) => video.id)
    .slice(0, 12);

  const byType = (type: ContentType, limit = 12) =>
    published
      .filter((video) => video.contentType === type)
      .sort((a, b) => b.views - a.views)
      .map((video) => video.id)
      .slice(0, limit);

  const rails: HomeRail[] = [
    ...(continueIds.length
      ? [
          {
            id: "rail_continue",
            title: "Continue watching",
            subtitle: "Picks up where you stopped, on any device",
            href: "/account/history",
            kind: "continue" as const,
            videoIds: continueIds.slice(0, 10),
          },
        ]
      : []),
    {
      id: "rail_live",
      title: "Live and upcoming",
      subtitle: "Streaming now, plus what is scheduled",
      href: "/live",
      kind: "live",
      videoIds: [],
    },
    {
      id: "rail_films",
      title: "Films & cinema",
      subtitle: "Rent, buy or watch with Premium",
      href: "/films",
      kind: "poster",
      videoIds: byType("film"),
    },
    ...(followedIds.length
      ? [
          {
            id: "rail_following",
            title: "From channels you follow",
            href: "/explore",
            kind: "wide" as const,
            videoIds: followedIds,
          },
        ]
      : []),
    {
      id: "rail_commercial",
      title: "Commercial & brand",
      subtitle: "Launch films, brand documentaries and product work",
      href: "/commercial",
      kind: "wide",
      videoIds: byType("commercial"),
    },
    {
      id: "rail_recommended",
      title: "Recommended for you",
      subtitle: "Based on what you have watched",
      href: "/explore",
      kind: "wide",
      videoIds: published
        .filter((video) => !continueIds.includes(video.id))
        .sort((a, b) => b.ratingAverage - a.ratingAverage)
        .map((video) => video.id)
        .slice(0, 12),
    },
    {
      id: "rail_education",
      title: "Education",
      subtitle: "Accredited courses, lectures and workplace training",
      href: "/education",
      kind: "wide",
      videoIds: byType("education"),
    },
    {
      id: "rail_news",
      title: "News & documentary",
      subtitle: "Bulletins and long-form investigations",
      href: "/news",
      kind: "wide",
      videoIds: [...byType("news", 6), ...byType("documentary", 6)],
    },
    {
      id: "rail_entertainment",
      title: "Entertainment",
      href: "/entertainment",
      kind: "wide",
      videoIds: byType("entertainment"),
    },
    {
      id: "rail_creators",
      title: "Creator uploads",
      href: "/explore?type=user-generated",
      kind: "wide",
      videoIds: byType("user-generated"),
    },
    {
      id: "rail_public",
      title: "Public, community & impact",
      subtitle: "Government, non-profit and tourism channels",
      href: "/explore?type=government",
      kind: "wide",
      videoIds: [
        ...byType("government", 4),
        ...byType("nonprofit", 4),
        ...byType("tourism", 4),
      ],
    },
  ];

  return {
    hero: [
      byId("vid_saltmarsh"),
      byId("vid_ledger_water"),
      byId("vid_helio_aurora"),
      byId("vid_orbit_session_14"),
    ].filter(Boolean) as Video[],
    rails: rails.filter((rail) => rail.kind === "live" || rail.videoIds.length > 0),
  };
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
  // counters) is now at parity with the real schema — the counters are a seeded
  // snapshot from this same mock dataset, not yet live-computed by a real analytics
  // pipeline (SRS §6.9), and affiliateLinks/seriesId are the two still-unmodelled
  // fields (see docs/DEVELOPMENT-PLAN.md P1 entry for why).
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
  await latency("fast");
  return clone(store.categories.find((category) => category.slug === slug) ?? null);
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

export async function updateChannel(
  id: string,
  patch: Partial<Channel>,
): Promise<Channel> {
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
  // Live 2026-09-14 for the public case, real ids only (see looksLikeRealId's comment
  // above) — GET /api/channels/{id}/videos/ has no concept of a caller identity yet
  // (Auth0 paused), so it can only ever serve published content, which is exactly what
  // every viewer-facing caller needs. Studio/Business pages pass
  // includeUnpublished:true to see their own drafts, which stays on mock until there's
  // a real authenticated owner check to gate it — serving draft content through an
  // unauthenticated route would be a real content-exposure bug, not a shortcut worth
  // taking for a quick swap.
  if (!opts.includeUnpublished && looksLikeRealId(channelId)) {
    const res = await fetch(`/api/channels/${encodeURIComponent(channelId)}/videos/`);
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

export async function toggleFollow(channelId: string): Promise<boolean> {
  await latency("fast");
  const index = store.following.indexOf(channelId);
  if (index >= 0) {
    store.following.splice(index, 1);
    return false;
  }
  store.following.push(channelId);
  return true;
}

export async function isFollowing(channelId: string): Promise<boolean> {
  return store.following.includes(channelId);
}

/* ============================ Entitlement =============================== */

export async function getEntitlement(
  userId: string,
  videoId: string,
): Promise<Entitlement> {
  await latency("fast");
  const video = store.videos.find((item) => item.id === videoId);
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

  // Paid, unowned: a short preview is allowed, then the paywall takes over.
  return {
    ...base,
    granted: false,
    reason: "preview",
    blockReason: "entitlement-required",
    previewSeconds: 120,
  };
}

/** Mock checkout. No payment provider is contacted — see §12. */
export async function purchaseAccess(
  videoId: string,
  kind: "buy" | "rent" | "ppv" | "ticket",
): Promise<PurchaseRecord> {
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

export async function startSubscription(
  name: string,
  channelId?: string,
): Promise<Subscription> {
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

export async function getWatchProgress(videoId: string): Promise<WatchProgress | null> {
  return store.watchProgress.find((entry) => entry.videoId === videoId) ?? null;
}

export async function saveWatchProgress(
  videoId: string,
  positionSeconds: number,
  durationSeconds: number,
): Promise<WatchProgress> {
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

export async function getContinueWatching(): Promise<
  Array<{ video: Video; progress: WatchProgress }>
> {
  await latency("fast");
  return store.watchProgress
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((progress) => ({
      progress,
      video: store.videos.find((video) => video.id === progress.videoId)!,
    }))
    .filter((entry) => Boolean(entry.video))
    .map((entry) => clone(entry));
}

/* =============================== Social ================================== */

export async function getComments(videoId: string): Promise<Comment[]> {
  await latency("fast");
  return clone(
    store.comments
      .filter((comment) => comment.videoId === videoId && comment.status !== "removed")
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.likes - a.likes),
  );
}

export async function postComment(videoId: string, body: string): Promise<Comment> {
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
  await latency("fast");
  const channelVideoIds = store.videos
    .filter((video) => video.channelId === channelId)
    .map((video) => video.id);
  return clone(
    store.comments.filter((comment) => channelVideoIds.includes(comment.videoId)),
  );
}

export async function rateVideo(videoId: string, stars: 1 | 2 | 3 | 4 | 5) {
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

export async function getMyRating(videoId: string) {
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

export async function toggleWatchlist(videoId: string): Promise<boolean> {
  await latency("fast");
  const index = store.watchlist.indexOf(videoId);
  if (index >= 0) {
    store.watchlist.splice(index, 1);
    return false;
  }
  store.watchlist.unshift(videoId);
  return true;
}

export async function getWatchlist(): Promise<Video[]> {
  await latency("fast");
  return clone(
    store.watchlist
      .map((id) => store.videos.find((video) => video.id === id))
      .filter(Boolean) as Video[],
  );
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

export async function publishDraft(draft: VideoDraft): Promise<Video> {
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
  await latency("fast");
  return clone(
    channelId
      ? store.series.filter((item) => item.channelId === channelId)
      : store.series,
  );
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
  await latency("fast");
  return clone(store.adminUsers);
}

export async function updateUserRole(
  userId: string,
  roles: User["roles"],
): Promise<void> {
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
  await latency("fast");
  return clone(store.organisations);
}

export async function updateOrganisationStatus(
  orgId: string,
  status: Organisation["verificationStatus"],
  reason: string,
): Promise<Organisation | null> {
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
  await latency("fast");
  return clone(store.config);
}

export async function addCategory(
  payload: Omit<Category, "id" | "videoCount">,
): Promise<Category> {
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

export async function getCurrentUser(): Promise<User | null> {
  await latency("fast");
  if (!store.loggedIn) return null;
  return clone(store.user);
}

export async function updateUser(patch: Partial<User>): Promise<User> {
  await latency("fast");
  Object.assign(store.user, patch);
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
  await latency("fast");
  return clone(store.purchases);
}

export async function getSubscriptions(): Promise<Subscription[]> {
  await latency("fast");
  return clone(store.subscriptions);
}

export async function cancelSubscription(id: string): Promise<Subscription | null> {
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

export async function register(payload: {
  name: string;
  email: string;
  role: User["activeRole"];
  country: string;
}): Promise<{ userId: string; verificationRequired: true }> {
  await latency("slow");
  store.user = {
    ...store.user,
    name: payload.name,
    email: payload.email,
    country: payload.country,
    activeRole: payload.role,
    roles: Array.from(new Set([...store.user.roles, payload.role])),
    emailVerified: false,
    mobileVerified: false,
  };
  return { userId: store.user.id, verificationRequired: true };
}

/** Mock OTP. The code is always 000000 and is shown in the UI on purpose. */
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

export async function login(email: string): Promise<User> {
  await latency();
  store.user.email = email || store.user.email;
  store.loggedIn = true;
  persistLogin(true);
  return clone(store.user);
}

export async function logout(): Promise<void> {
  await latency("fast");
  store.loggedIn = false;
  persistLogin(false);
}

export { NOW };
