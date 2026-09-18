// Server-only. Real Postgres-backed catalogue reads for the anonymous-friendly slice of
// SRS §6.1 (Discovery) — the part of Phase 1 that doesn't depend on the paused Auth0
// integration. Response shapes match src/lib/mock-api/types.ts field-for-field (camelCase,
// same property names) so that swapping a mock-api function's body to call these instead
// of the in-memory store is a pure body replacement, per the strangler-fig strategy in
// docs/DEVELOPMENT-PLAN.md §2 — no caller (hooks.ts, components) needs to change.
//
// searchVideos() is now backed by Typesense (self-hosted on Railway) for full faceted
// search — content type, category, language, country, access model, age rating, duration
// range and release-year range, per docs/openapi.yaml's `searchVideos` operation. Postgres
// remains the source of truth; scripts/index-catalogue.mjs is the one-way sync into the
// search index, run after seeding/migrating published-video data. Typesense returns
// ranked ids + total; this file hydrates the actual rows from Postgres afterward rather
// than trusting field values baked into the index, so a stale reindex never shows wrong
// data (only wrong ranking/recall until the next index run) — see getVideosByIds() below.
//
// counts like `followers`/`totalViews` on a channel are analytics-pipeline outputs that
// don't exist yet either — returned as 0 with a comment, not invented.
import "server-only";
import { query, queryOne } from "./db";
import { getTypesenseClient, VIDEOS_COLLECTION } from "./typesense";
import { activateScheduledVideos } from "./videoPublishing";

export interface VideoPricing {
  accessModels: string[];
  rentPrice: { amount: number; currency: string } | null;
  buyPrice: { amount: number; currency: string } | null;
  ppvPrice: { amount: number; currency: string } | null;
  rentalWindowHours: number | null;
  membershipTier: string | null;
  sponsored: boolean;
  sponsorName: string | null;
  // Not modelled in the real schema yet (P4/P7 commerce scope) — always empty rather
  // than omitted, so callers don't need an extra "is this field even present" branch.
  affiliateLinks: never[];
}

export interface VideoRights {
  declaredOwner: string;
  ownershipConfirmed: boolean;
  licenceStart: string | null;
  licenceEnd: string | null;
  permittedCountries: string[];
  blockedCountries: string[];
  ageRating: string;
  contentLabels: string[];
}

export interface VideoSummary {
  id: string;
  slug: string;
  title: string;
  synopsis: string | null;
  channelId: string;
  channelName: string;
  channelHandle: string | null;
  contentType: string;
  status: string;
  /** "awaiting_transcode" for a real upload with no playable stream yet (Mux isn't
   * wired up) — separate from `status`, which is editorial/publication state, not
   * playback readiness. "none" for every seeded video (nothing to process). */
  processingStatus: "none" | "awaiting_transcode";
  thumbnailUrl: string | null;
  // Found by actually clicking through the app, not by static review: VideoCard passes
  // this straight into <Poster gradient={...}>, which indexes it unconditionally with
  // no fallback — this is load-bearing UI, not decoration (see the migration comment in
  // 20260914000006_poster_gradient.sql).
  posterGradient: [string, string];
  durationSeconds: number;
  releaseDate: string | null;
  publishedAt: string | null;
  scheduledFor: string | null;
  language: string | null;
  country: string | null;
  pricing: VideoPricing;
  // VideoCard reads rights.blockedCountries/permittedCountries directly (also found by
  // clicking through, also unconditional) — every list item needs this, not just detail
  // pages, so it lives here rather than only on VideoDetail.
  rights: VideoRights;
  // Seeded snapshot values (docs/DEVELOPMENT-PLAN.md P1 entry, 2026-09-14) — not yet
  // live-computed by a real analytics pipeline (SRS §6.9, still to build). Real once
  // that pipeline exists; until then these came from the same prototype mock dataset
  // every other seeded field did, not invented.
  views: number;
  uniqueViewers: number;
  likes: number;
  ratingAverage: number;
  ratingCount: number;
  commentCount: number;
  watchTimeSeconds: number;
  completionRate: number;
}

interface VideoSummaryRow {
  id: string;
  slug: string;
  title: string;
  synopsis: string | null;
  channel_id: string;
  channel_name: string;
  channel_handle: string | null;
  content_type: string;
  status: string;
  processing_status: "none" | "awaiting_transcode";
  thumbnail_url: string | null;
  poster_gradient: [string, string];
  duration_seconds: number;
  release_date: string | null;
  published_at: string | null;
  scheduled_for: string | null;
  language: string | null;
  country: string | null;
  access_models: string[] | null;
  rent_price_minor: number | null;
  rent_price_currency: string | null;
  buy_price_minor: number | null;
  buy_price_currency: string | null;
  ppv_price_minor: number | null;
  ppv_price_currency: string | null;
  rental_window_hours: number | null;
  membership_tier: string | null;
  sponsored: boolean | null;
  sponsor_name: string | null;
  declared_owner: string | null;
  ownership_confirmed: boolean | null;
  licence_start: string | null;
  licence_end: string | null;
  permitted_countries: string[] | null;
  blocked_countries: string[] | null;
  age_rating: string | null;
  content_labels: string[] | null;
  views: string;
  unique_viewers: string;
  likes: string;
  rating_average: string;
  rating_count: number;
  comment_count: number;
  watch_time_seconds: string;
  completion_rate: string;
}

// Selected on every VideoSummary/VideoDetail query — pulled into one constant so the
// three call sites (search, detail, channel-videos) can't drift from each other. Joins
// pricing and rights directly rather than fetching them per-item, since search/
// channel-video lists return up to 100 rows and an N+1 round trip per item would be a
// real cost; getVideoById reuses this same join rather than issuing its own duplicate
// pricing/rights queries.
const VIDEO_SUMMARY_COLUMNS = `
  v.id, v.slug, v.title, v.synopsis, v.channel_id,
  o.name as channel_name, o.handle as channel_handle,
  v.content_type, v.status, v.processing_status, v.thumbnail_url, v.poster_gradient, v.duration_seconds,
  v.release_date, v.published_at, v.scheduled_for, v.language, v.country,
  v.views, v.unique_viewers, v.likes, v.rating_average, v.rating_count,
  v.comment_count, v.watch_time_seconds, v.completion_rate,
  p.access_models, p.rent_price_minor, p.rent_price_currency,
  p.buy_price_minor, p.buy_price_currency, p.ppv_price_minor, p.ppv_price_currency,
  p.rental_window_hours, p.membership_tier, p.sponsored, p.sponsor_name,
  r.declared_owner, r.ownership_confirmed, r.licence_start, r.licence_end,
  r.permitted_countries, r.blocked_countries, r.age_rating, r.content_labels
`;

const VIDEO_SUMMARY_JOINS = `
  join organizations o on o.id = v.channel_id
  left join video_pricing p on p.video_id = v.id
  left join video_rights r on r.video_id = v.id
`;

function mapVideoSummary(row: VideoSummaryRow): VideoSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    synopsis: row.synopsis,
    channelId: row.channel_id,
    channelName: row.channel_name,
    channelHandle: row.channel_handle,
    contentType: row.content_type,
    status: row.status,
    processingStatus: row.processing_status,
    thumbnailUrl: row.thumbnail_url,
    posterGradient: row.poster_gradient,
    durationSeconds: row.duration_seconds,
    releaseDate: row.release_date,
    publishedAt: row.published_at,
    scheduledFor: row.scheduled_for,
    language: row.language,
    country: row.country,
    pricing: {
      accessModels: row.access_models ?? ["free"],
      rentPrice: row.rent_price_minor != null ? { amount: row.rent_price_minor, currency: row.rent_price_currency ?? "GBP" } : null,
      buyPrice: row.buy_price_minor != null ? { amount: row.buy_price_minor, currency: row.buy_price_currency ?? "GBP" } : null,
      ppvPrice: row.ppv_price_minor != null ? { amount: row.ppv_price_minor, currency: row.ppv_price_currency ?? "GBP" } : null,
      rentalWindowHours: row.rental_window_hours,
      membershipTier: row.membership_tier,
      sponsored: row.sponsored ?? false,
      sponsorName: row.sponsor_name,
      affiliateLinks: [],
    },
    rights: {
      declaredOwner: row.declared_owner ?? "",
      ownershipConfirmed: row.ownership_confirmed ?? false,
      licenceStart: row.licence_start,
      licenceEnd: row.licence_end,
      permittedCountries: row.permitted_countries ?? [],
      blockedCountries: row.blocked_countries ?? [],
      ageRating: row.age_rating ?? "U",
      contentLabels: row.content_labels ?? [],
    },
    views: Number(row.views),
    uniqueViewers: Number(row.unique_viewers),
    likes: Number(row.likes),
    ratingAverage: Number(row.rating_average),
    ratingCount: row.rating_count,
    commentCount: row.comment_count,
    watchTimeSeconds: Number(row.watch_time_seconds),
    completionRate: Number(row.completion_rate),
  };
}

export interface SearchVideosParams {
  searchQuery?: string;
  contentTypes?: string[];
  categoryIds?: string[];
  languages?: string[];
  countries?: string[];
  accessModels?: string[];
  ageRatings?: string[];
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  releaseYearFrom?: number;
  releaseYearTo?: number;
  /** True if a video must have at least one subtitle/caption track (any language). */
  hasSubtitles?: boolean;
  /** True to restrict to free/ad-supported content only — shorthand for
   * accessModels:["free","ad-supported"], matching the mock's own freeOnly semantics. */
  freeOnly?: boolean;
  channelId?: string;
  /** "popular" sorts by the seeded `views` snapshot, "rating" by `rating_average` — real
   * columns now (2026-09-14 backfill), but still not live-computed by an analytics
   * pipeline (SRS §6.9, still to build). They'll stay accurate only as long as nothing
   * updates the underlying rows; that's fine for demo/seed content, not yet fine for
   * real usage. */
  sort?: "newest" | "duration" | "popular" | "rating";
  limit?: number;
  offset?: number;
}

export interface SearchFacetBucket {
  value: string;
  count: number;
}

export interface SearchVideosResult {
  items: VideoSummary[];
  total: number;
  limit: number;
  offset: number;
  facets: {
    contentTypes: SearchFacetBucket[];
    languages: SearchFacetBucket[];
    countries: SearchFacetBucket[];
    accessModels: SearchFacetBucket[];
  };
}

const FACET_FIELDS = ["content_type", "language", "country", "access_models"] as const;

function typesenseFilters(params: SearchVideosParams): string[] {
  const filters: string[] = [];
  const inList = (field: string, values?: string[]) => {
    if (values?.length) filters.push(`${field}:=[${values.map((v) => JSON.stringify(v)).join(",")}]`);
  };
  inList("content_type", params.contentTypes);
  inList("category_ids", params.categoryIds);
  inList("language", params.languages);
  inList("country", params.countries);
  inList("access_models", params.freeOnly ? ["free", "ad-supported"] : params.accessModels);
  inList("age_rating", params.ageRatings);
  if (params.minDurationSeconds !== undefined) filters.push(`duration_seconds:>=${params.minDurationSeconds}`);
  if (params.maxDurationSeconds !== undefined) filters.push(`duration_seconds:<=${params.maxDurationSeconds}`);
  if (params.releaseYearFrom !== undefined) filters.push(`release_year:>=${params.releaseYearFrom}`);
  if (params.releaseYearTo !== undefined) filters.push(`release_year:<=${params.releaseYearTo}`);
  if (params.hasSubtitles) filters.push("has_subtitles:=true");
  if (params.channelId) filters.push(`channel_id:=${JSON.stringify(params.channelId)}`);
  return filters;
}

function typesenseSortBy(sort: SearchVideosParams["sort"], hasQuery: boolean): string {
  switch (sort) {
    case "duration":
      return "duration_seconds:desc";
    case "popular":
      return "views:desc";
    case "rating":
      return "rating_average:desc";
    case "newest":
      return "published_at_ts:desc";
    default:
      // No explicit sort: Typesense's text-relevance ranking when there's a query,
      // otherwise newest first.
      return hasQuery ? "" : "published_at_ts:desc";
  }
}

/** Hydrates full VideoSummary rows from Postgres for a set of ids, preserving the order
 * `orderedIds` arrived in (Postgres's `= any(...)` does not guarantee row order). */
async function getVideosByIds(orderedIds: string[]): Promise<VideoSummary[]> {
  if (orderedIds.length === 0) return [];
  const rows = await query<VideoSummaryRow>(
    `select ${VIDEO_SUMMARY_COLUMNS}
     from videos v
     ${VIDEO_SUMMARY_JOINS}
     where v.id = any($1) and v.status = 'published'`,
    [orderedIds],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return orderedIds.map((id) => byId.get(id)).filter((r): r is VideoSummaryRow => Boolean(r)).map(mapVideoSummary);
}

/** Whether a real (Postgres) video row exists for this id — the FK guard the write-path
 * engagement routes (watchlist/rating/comments) use before touching a table whose
 * video_id column has a real foreign key: an old mock-shaped id (still linked from the
 * still-mock home rails/category pages) would otherwise surface as an opaque FK
 * violation instead of a clean "this video isn't in the real catalogue yet" response. */
export async function videoExists(id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(`select id from videos where id = $1`, [id]);
  return Boolean(row);
}

/** Full VideoSummary rows for everything a real account has bookmarked, newest first.
 * No status filter, matching the mock's getWatchlist() — a video leaving "published"
 * shouldn't make it silently vanish from someone's own list. */
export async function getWatchlistVideos(accountId: string): Promise<VideoSummary[]> {
  const rows = await query<VideoSummaryRow>(
    `select ${VIDEO_SUMMARY_COLUMNS}
     from watchlist_items w
     join videos v on v.id = w.video_id
     ${VIDEO_SUMMARY_JOINS}
     where w.account_id = $1
     order by w.created_at desc`,
    [accountId],
  );
  return rows.map(mapVideoSummary);
}

/** Same FK guard as videoExists(), for channel_follows.organization_id. */
export async function organizationExists(id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(`select id from organizations where id = $1`, [id]);
  return Boolean(row);
}

export interface EngagementProgress {
  videoId: string;
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: string;
  completed: boolean;
}

/** Full VideoSummary + progress pairs for everything a real account has a watch_progress
 * row for, most recently updated first — no completed filter, matching the mock's
 * getContinueWatching(), which doesn't drop finished titles from the list either. */
export async function getContinueWatchingVideos(
  accountId: string,
): Promise<Array<{ video: VideoSummary; progress: EngagementProgress }>> {
  const rows = await query<
    VideoSummaryRow & { position_seconds: number; wp_completed: boolean; wp_updated_at: string }
  >(
    `select ${VIDEO_SUMMARY_COLUMNS},
       wp.position_seconds, wp.completed as wp_completed, wp.updated_at as wp_updated_at
     from watch_progress wp
     join videos v on v.id = wp.video_id
     ${VIDEO_SUMMARY_JOINS}
     where wp.account_id = $1
     order by wp.updated_at desc`,
    [accountId],
  );
  return rows.map((row) => ({
    video: mapVideoSummary(row),
    progress: {
      videoId: row.id,
      positionSeconds: row.position_seconds,
      durationSeconds: row.duration_seconds,
      updatedAt: row.wp_updated_at,
      completed: row.wp_completed,
    },
  }));
}

/* ============================ Home / Featured ============================ */

async function getVideosByType(contentType: string, limit: number): Promise<VideoSummary[]> {
  const rows = await query<VideoSummaryRow>(
    `select ${VIDEO_SUMMARY_COLUMNS}
     from videos v
     ${VIDEO_SUMMARY_JOINS}
     where v.status = 'published' and v.content_type = $1
     order by v.views desc
     limit $2`,
    [contentType, limit],
  );
  return rows.map(mapVideoSummary);
}

async function getTopViewedVideos(limit: number): Promise<VideoSummary[]> {
  const rows = await query<VideoSummaryRow>(
    `select ${VIDEO_SUMMARY_COLUMNS}
     from videos v
     ${VIDEO_SUMMARY_JOINS}
     where v.status = 'published'
     order by v.views desc
     limit $1`,
    [limit],
  );
  return rows.map(mapVideoSummary);
}

/** Top-rated published videos, excluding `excludeIds` (typically whatever's already in
 * the viewer's own "Continue watching" rail) — the home page's "Recommended for you".
 * Not a real recommendation model (no such pipeline exists — SRS §6.9), same honest
 * limitation the mock version it replaces had; `= any('{}')` matches nothing, so an
 * empty exclude list (a guest, or nothing in progress) is a no-op filter, not an error. */
async function getRecommendedVideos(excludeIds: string[], limit: number): Promise<VideoSummary[]> {
  const rows = await query<VideoSummaryRow>(
    `select ${VIDEO_SUMMARY_COLUMNS}
     from videos v
     ${VIDEO_SUMMARY_JOINS}
     where v.status = 'published' and not (v.id = any($1::uuid[]))
     order by v.rating_average desc, v.rating_count desc
     limit $2`,
    [excludeIds, limit],
  );
  return rows.map(mapVideoSummary);
}

/** Real videos from organizations `accountId` follows, most recently published first —
 * the "From channels you follow" home rail's account-scoped counterpart to
 * getWatchlistVideos() above. */
async function getFollowedChannelVideos(accountId: string, limit: number): Promise<VideoSummary[]> {
  const rows = await query<VideoSummaryRow>(
    `select ${VIDEO_SUMMARY_COLUMNS}
     from videos v
     ${VIDEO_SUMMARY_JOINS}
     join channel_follows cf on cf.organization_id = v.channel_id
     where cf.account_id = $1 and v.status = 'published'
     order by v.published_at desc nulls last
     limit $2`,
    [accountId, limit],
  );
  return rows.map(mapVideoSummary);
}

export interface FeaturedRail {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  kind: "poster" | "wide" | "live" | "continue";
  videos: VideoSummary[];
}

export interface FeaturedCatalogue {
  hero: VideoSummary[];
  rails: FeaturedRail[];
}

/**
 * Real Postgres equivalent of the mock's getFeaturedContent() — see
 * src/app/api/home/route.ts. `accountId` personalizes "Continue watching" and "From
 * channels you follow"; both are simply omitted (not an error, not a stand-in rail) for
 * a signed-out request, same as the mock rails did when there was nothing to show.
 *
 * There is no admin-curated "featured" flag on videos (SRS has no such field yet), so
 * "hero" is the most-viewed published videos rather than an editorial pick — a
 * defensible, data-driven stand-in for what a human curator would otherwise choose.
 */
export async function getFeaturedRails(accountId: string | null): Promise<FeaturedCatalogue> {
  const continueEntries = accountId ? await getContinueWatchingVideos(accountId) : [];
  const continueVideos = continueEntries
    .filter((entry) => !entry.progress.completed)
    .map((entry) => entry.video)
    .slice(0, 10);
  const continueIds = continueVideos.map((video) => video.id);

  const [
    followedVideos,
    films,
    commercial,
    education,
    news,
    documentary,
    entertainment,
    creators,
    government,
    nonprofit,
    tourism,
    recommended,
    hero,
  ] = await Promise.all([
    accountId ? getFollowedChannelVideos(accountId, 12) : Promise.resolve([]),
    getVideosByType("film", 12),
    getVideosByType("commercial", 12),
    getVideosByType("education", 12),
    getVideosByType("news", 6),
    getVideosByType("documentary", 6),
    getVideosByType("entertainment", 12),
    getVideosByType("user-generated", 12),
    getVideosByType("government", 4),
    getVideosByType("nonprofit", 4),
    getVideosByType("tourism", 4),
    getRecommendedVideos(continueIds, 12),
    getTopViewedVideos(4),
  ]);

  const rails: FeaturedRail[] = [
    ...(continueVideos.length
      ? [
          {
            id: "rail_continue",
            title: "Continue watching",
            subtitle: "Picks up where you stopped, on any device",
            href: "/account/history",
            kind: "continue" as const,
            videos: continueVideos,
          },
        ]
      : []),
    {
      id: "rail_live",
      title: "Live and upcoming",
      subtitle: "Streaming now, plus what is scheduled",
      href: "/live",
      kind: "live",
      videos: [],
    },
    {
      id: "rail_films",
      title: "Films & cinema",
      subtitle: "Rent, buy or watch with Premium",
      href: "/films",
      kind: "poster",
      videos: films,
    },
    ...(followedVideos.length
      ? [
          {
            id: "rail_following",
            title: "From channels you follow",
            href: "/explore",
            kind: "wide" as const,
            videos: followedVideos,
          },
        ]
      : []),
    {
      id: "rail_commercial",
      title: "Commercial & brand",
      subtitle: "Launch films, brand documentaries and product work",
      href: "/commercial",
      kind: "wide",
      videos: commercial,
    },
    {
      id: "rail_recommended",
      title: "Recommended for you",
      subtitle: "Based on what you have watched",
      href: "/explore",
      kind: "wide",
      videos: recommended,
    },
    {
      id: "rail_education",
      title: "Education",
      subtitle: "Accredited courses, lectures and workplace training",
      href: "/education",
      kind: "wide",
      videos: education,
    },
    {
      id: "rail_news",
      title: "News & documentary",
      subtitle: "Bulletins and long-form investigations",
      href: "/news",
      kind: "wide",
      videos: [...news, ...documentary],
    },
    {
      id: "rail_entertainment",
      title: "Entertainment",
      href: "/entertainment",
      kind: "wide",
      videos: entertainment,
    },
    {
      id: "rail_creators",
      title: "Creator uploads",
      href: "/explore?type=user-generated",
      kind: "wide",
      videos: creators,
    },
    {
      id: "rail_public",
      title: "Public, community & impact",
      subtitle: "Government, non-profit and tourism channels",
      href: "/explore?type=government",
      kind: "wide",
      videos: [...government, ...nonprofit, ...tourism],
    },
  ];

  return {
    hero,
    rails: rails.filter((rail) => rail.kind === "live" || rail.videos.length > 0),
  };
}

/** Only ever returns published content — draft/scheduled/private/etc. are never in the
 * search index in the first place (scripts/index-catalogue.mjs only indexes published
 * rows), so there is no separate status filter to apply here. */
export async function searchVideos(params: SearchVideosParams): Promise<SearchVideosResult> {
  const limit = Math.min(Math.max(params.limit ?? 24, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  // Typesense paginates by page number, not offset — this assumes offset is always a
  // multiple of limit (true for every caller today: page-based UI pagination). An
  // arbitrary offset would need per_page padding this doesn't attempt.
  const page = Math.floor(offset / limit) + 1;

  const filters = typesenseFilters(params);
  const sortBy = typesenseSortBy(params.sort, Boolean(params.searchQuery));

  const searchParameters: Record<string, unknown> = {
    q: params.searchQuery || "*",
    query_by: "title,synopsis,channel_name,tags",
    filter_by: filters.length ? filters.join(" && ") : undefined,
    sort_by: sortBy || undefined,
    per_page: limit,
    page,
    // Real facet counts from Typesense, scoped to the current filters — this is what
    // lets the sidebar's checkbox counts narrow as the viewer picks filters, matching
    // the mock's SearchResult.facets contract exactly rather than approximating it.
    facet_by: FACET_FIELDS.join(","),
  };

  const result = await getTypesenseClient()
    .collections(VIDEOS_COLLECTION)
    .documents()
    .search(searchParameters as never);

  const ids = (result.hits ?? []).map((hit: { document: unknown }) => (hit.document as { id: string }).id);
  const items = await getVideosByIds(ids);

  const facetCounts = (result.facet_counts ?? []) as Array<{
    field_name: string;
    counts: Array<{ value: string; count: number }>;
  }>;
  const bucketsFor = (field: string): SearchFacetBucket[] =>
    facetCounts.find((f) => f.field_name === field)?.counts.map((c) => ({ value: c.value, count: c.count })) ?? [];

  return {
    items,
    total: result.found ?? 0,
    limit,
    offset,
    facets: {
      contentTypes: bucketsFor("content_type"),
      languages: bucketsFor("language"),
      countries: bucketsFor("country"),
      accessModels: bucketsFor("access_models"),
    },
  };
}

export interface VideoDetail extends VideoSummary {
  heroUrl: string | null;
  productionCompany: string | null;
  hasAudioDescription: boolean;
  trailerAvailable: boolean;
  languageCode: string | null;
  sampleSrc: string | null;
  watermarkEnabled: boolean;
  seriesId: string | null;
  seriesTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  credits: Array<{ role: string; name: string; character: string | null }>;
  tags: string[];
  categoryIds: string[];
  subtitles: Array<{
    id: string;
    language: string;
    languageCode: string;
    kind: string;
    autoGenerated: boolean;
    status: string;
  }>;
  audioTracks: Array<{ id: string; language: string; languageCode: string; kind: string }>;
  qualities: Array<{ id: string; label: string; height: number; bitrateKbps: number }>;
}

/** Returns null rather than throwing for "not found" — the route handler decides that's
 * a 404, this layer just reports absence. pricing/rights come from mapVideoSummary()
 * (VIDEO_SUMMARY_COLUMNS already joins both) — no separate query for either here. */
export async function getVideoById(id: string): Promise<VideoDetail | null> {
  await activateScheduledVideos();
  const row = await queryOne<
    VideoSummaryRow & {
      hero_url: string | null;
      production_company: string | null;
      has_audio_description: boolean;
      trailer_available: boolean;
      language_code: string | null;
      sample_src: string | null;
      watermark_enabled: boolean;
      series_id: string | null;
      series_title: string | null;
      season_number: number | null;
      episode_number: number | null;
    }
  >(
    `select ${VIDEO_SUMMARY_COLUMNS},
       v.hero_url, v.production_company, v.has_audio_description, v.trailer_available,
       v.language_code, v.sample_src, v.watermark_enabled,
       v.series_id, s.title as series_title, v.season_number, v.episode_number
     from videos v
     ${VIDEO_SUMMARY_JOINS}
     left join series s on s.id = v.series_id
     where (v.id::text = $1 or v.slug = $1) and v.status = 'published'`,
    [id],
  );
  if (!row) return null;

  // row.id, not the raw `id` param — the param can be a slug (this query's own where
  // clause deliberately accepts either), but every one of these child tables' video_id
  // columns is a real uuid FK, so a slug string here throws "invalid input syntax for
  // type uuid" rather than silently matching nothing. Never actually hit before this
  // was first tested by looking a real video up by slug rather than by id.
  const videoId = row.id;
  const [credits, tagRows, categoryRows, subtitleRows, audioRows, qualityRows] = await Promise.all([
    query<{ role: string; name: string; character_name: string | null }>(
      "select role, name, character_name from video_credits where video_id = $1 order by ordering",
      [videoId],
    ),
    query<{ tag: string }>("select tag from video_tags where video_id = $1", [videoId]),
    query<{ category_id: string }>("select category_id from video_categories where video_id = $1", [videoId]),
    query<{
      id: string;
      language: string;
      language_code: string;
      kind: string;
      auto_generated: boolean;
      status: string;
    }>("select id, language, language_code, kind, auto_generated, status from video_subtitle_tracks where video_id = $1", [videoId]),
    query<{ id: string; language: string; language_code: string; kind: string }>(
      "select id, language, language_code, kind from video_audio_tracks where video_id = $1",
      [videoId],
    ),
    query<{ id: string; label: string; height: number; bitrate_kbps: number }>(
      "select id, label, height, bitrate_kbps from video_quality_levels where video_id = $1 order by height desc",
      [videoId],
    ),
  ]);

  return {
    ...mapVideoSummary(row),
    heroUrl: row.hero_url,
    productionCompany: row.production_company,
    hasAudioDescription: row.has_audio_description,
    trailerAvailable: row.trailer_available,
    languageCode: row.language_code,
    sampleSrc: row.sample_src,
    watermarkEnabled: row.watermark_enabled,
    seriesId: row.series_id,
    seriesTitle: row.series_title,
    seasonNumber: row.season_number,
    episodeNumber: row.episode_number,
    credits: credits.map((c) => ({ role: c.role, name: c.name, character: c.character_name })),
    tags: tagRows.map((t) => t.tag),
    categoryIds: categoryRows.map((c) => c.category_id),
    subtitles: subtitleRows.map((s) => ({
      id: s.id,
      language: s.language,
      languageCode: s.language_code,
      kind: s.kind,
      autoGenerated: s.auto_generated,
      status: s.status,
    })),
    audioTracks: audioRows.map((a) => ({ id: a.id, language: a.language, languageCode: a.language_code, kind: a.kind })),
    qualities: qualityRows.map((q) => ({ id: q.id, label: q.label, height: q.height, bitrateKbps: q.bitrate_kbps })),
  };
}

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  contentType: string;
  featured: boolean;
  accentToken: number;
  imageUrl: string | null;
  videoCount: number;
}

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  content_type: string;
  featured: boolean;
  accent_token: number;
  image_url: string | null;
  video_count: string;
}

function mapCategoryRow(r: CategoryRow): CategorySummary {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    contentType: r.content_type,
    featured: r.featured,
    accentToken: r.accent_token,
    imageUrl: r.image_url,
    videoCount: Number(r.video_count),
  };
}

// count(v.id), not count(vc.video_id) — the latter counts every video_categories row
// regardless of whether the published-video join actually matched, silently including
// draft/private/unpublished videos in the displayed count.
const CATEGORY_COLUMNS = `
  c.id, c.slug, c.name, c.description, c.content_type, c.featured, c.accent_token, c.image_url,
  count(v.id) as video_count
`;
const CATEGORY_JOINS = `
  left join video_categories vc on vc.category_id = c.id
  left join videos v on v.id = vc.video_id and v.status = 'published'
`;

export async function listCategories(): Promise<CategorySummary[]> {
  const rows = await query<CategoryRow>(
    `select ${CATEGORY_COLUMNS} from categories c ${CATEGORY_JOINS} group by c.id order by c.featured desc, c.name`,
  );
  return rows.map(mapCategoryRow);
}

/** Single-category lookup by slug — the counterpart `listCategories()` has had since
 * categories first went real. Without this, category detail pages had nothing but the
 * stale mock store to resolve against, which uses fixed fake ids (`cat_brand_film`) that
 * can never match a real video's indexed category uuid — see docs/DEVELOPMENT-PLAN.md. */
export async function getCategoryBySlug(slug: string): Promise<CategorySummary | null> {
  const row = await queryOne<CategoryRow>(
    `select ${CATEGORY_COLUMNS} from categories c ${CATEGORY_JOINS} where c.slug = $1 group by c.id`,
    [slug],
  );
  return row ? mapCategoryRow(row) : null;
}

export interface ChannelDetail {
  id: string;
  handle: string | null;
  name: string;
  kind: string;
  tagline: string | null;
  about: string | null;
  verified: boolean;
  country: string | null;
  languages: string[];
  avatarUrl: string | null;
  bannerUrl: string | null;
  contactEmail: string | null;
  links: Array<{ label: string; href: string }>;
  verificationStatus: string;
  joinedAt: string;
  videoCount: number;
  // Same discovery as VideoSummary.posterGradient — load-bearing, not decoration; the
  // channel page indexes these unconditionally with no fallback.
  bannerGradient: [string, string];
  avatarGradient: [string, string];
  // Seeded snapshot values, same caveat as VideoSummary above — real once the SRS §6.9
  // analytics pipeline exists.
  followers: number;
  totalViews: number;
}

export async function getChannelById(id: string): Promise<ChannelDetail | null> {
  const row = await queryOne<{
    id: string;
    handle: string | null;
    name: string;
    type: string;
    tagline: string | null;
    description: string | null;
    verified: boolean;
    country: string | null;
    languages: string[];
    avatar_url: string | null;
    banner_url: string | null;
    business_email: string | null;
    links: Array<{ label: string; href: string }>;
    verification_status: string;
    joined_at: string;
    banner_gradient: [string, string];
    avatar_gradient: [string, string];
    followers: string;
    total_views: string;
    video_count: string;
  }>(
    `select
       o.id, o.handle, o.name, o.type, o.tagline, o.description, o.verified, o.country,
       o.languages, o.avatar_url, o.banner_url, o.business_email, o.links,
       o.verification_status, o.joined_at, o.banner_gradient, o.avatar_gradient,
       o.followers, o.total_views,
       (select count(*) from videos v where v.channel_id = o.id and v.status = 'published') as video_count
     from organizations o
     where o.id::text = $1 or o.handle = $1`,
    [id],
  );
  if (!row) return null;
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    kind: row.type,
    tagline: row.tagline,
    about: row.description,
    verified: row.verified,
    country: row.country,
    languages: row.languages,
    avatarUrl: row.avatar_url,
    bannerUrl: row.banner_url,
    contactEmail: row.business_email,
    links: row.links,
    verificationStatus: row.verification_status,
    joinedAt: row.joined_at,
    bannerGradient: row.banner_gradient,
    avatarGradient: row.avatar_gradient,
    videoCount: Number(row.video_count),
    followers: Number(row.followers),
    totalViews: Number(row.total_views),
  };
}

/** Every organization row is a channel (see the Phase 0 migration) — this genuinely
 * lists all of them, not just Creator-kind ones, matching the mock's getChannels(). */
export async function listChannels(): Promise<ChannelDetail[]> {
  const rows = await query<{
    id: string;
    handle: string | null;
    name: string;
    type: string;
    tagline: string | null;
    description: string | null;
    verified: boolean;
    country: string | null;
    languages: string[];
    avatar_url: string | null;
    banner_url: string | null;
    business_email: string | null;
    links: Array<{ label: string; href: string }>;
    verification_status: string;
    joined_at: string;
    banner_gradient: [string, string];
    avatar_gradient: [string, string];
    followers: string;
    total_views: string;
    video_count: string;
  }>(
    `select
       o.id, o.handle, o.name, o.type, o.tagline, o.description, o.verified, o.country,
       o.languages, o.avatar_url, o.banner_url, o.business_email, o.links,
       o.verification_status, o.joined_at, o.banner_gradient, o.avatar_gradient,
       o.followers, o.total_views,
       (select count(*) from videos v where v.channel_id = o.id and v.status = 'published') as video_count
     from organizations o
     order by o.name`,
  );
  return rows.map((row) => ({
    id: row.id,
    handle: row.handle,
    name: row.name,
    kind: row.type,
    tagline: row.tagline,
    about: row.description,
    verified: row.verified,
    country: row.country,
    languages: row.languages,
    avatarUrl: row.avatar_url,
    bannerUrl: row.banner_url,
    contactEmail: row.business_email,
    links: row.links,
    verificationStatus: row.verification_status,
    joinedAt: row.joined_at,
    bannerGradient: row.banner_gradient,
    avatarGradient: row.avatar_gradient,
    videoCount: Number(row.video_count),
    followers: Number(row.followers),
    totalViews: Number(row.total_views),
  }));
}

/** `includeUnpublished` is for the owning channel's own Studio content list — the caller
 * (GET /api/channels/[id]/videos) is responsible for checking that the requester is
 * actually a member of `channelId` before ever setting it, since this returns draft/
 * pending/scheduled/restricted rows too. Without it, only published content, same as
 * before. */
export async function getChannelVideos(
  channelId: string,
  opts: { limit?: number; offset?: number; includeUnpublished?: boolean } = {},
): Promise<VideoSummary[]> {
  if (opts.includeUnpublished) await activateScheduledVideos();
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const statusFilter = opts.includeUnpublished ? "" : "and v.status = 'published'";
  const orderBy = opts.includeUnpublished ? "v.created_at desc" : "v.published_at desc nulls last";
  const rows = await query<VideoSummaryRow>(
    `select ${VIDEO_SUMMARY_COLUMNS}
     from videos v
     ${VIDEO_SUMMARY_JOINS}
     where v.channel_id = $1 ${statusFilter}
     order by ${orderBy}
     limit $2 offset $3`,
    [channelId, limit, offset],
  );
  return rows.map(mapVideoSummary);
}
