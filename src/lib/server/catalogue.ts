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
  thumbnailUrl: string | null;
  // Found by actually clicking through the app, not by static review: VideoCard passes
  // this straight into <Poster gradient={...}>, which indexes it unconditionally with
  // no fallback — this is load-bearing UI, not decoration (see the migration comment in
  // 20260914000006_poster_gradient.sql).
  posterGradient: [string, string];
  durationSeconds: number;
  releaseDate: string | null;
  publishedAt: string | null;
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
  thumbnail_url: string | null;
  poster_gradient: [string, string];
  duration_seconds: number;
  release_date: string | null;
  published_at: string | null;
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
  v.content_type, v.status, v.thumbnail_url, v.poster_gradient, v.duration_seconds,
  v.release_date, v.published_at, v.language, v.country,
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
    thumbnailUrl: row.thumbnail_url,
    posterGradient: row.poster_gradient,
    durationSeconds: row.duration_seconds,
    releaseDate: row.release_date,
    publishedAt: row.published_at,
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
  scheduledFor: string | null;
  sampleSrc: string | null;
  watermarkEnabled: boolean;
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
  const row = await queryOne<
    VideoSummaryRow & {
      hero_url: string | null;
      production_company: string | null;
      has_audio_description: boolean;
      trailer_available: boolean;
      language_code: string | null;
      scheduled_for: string | null;
      sample_src: string | null;
      watermark_enabled: boolean;
      season_number: number | null;
      episode_number: number | null;
    }
  >(
    `select ${VIDEO_SUMMARY_COLUMNS},
       v.hero_url, v.production_company, v.has_audio_description, v.trailer_available,
       v.language_code, v.scheduled_for, v.sample_src, v.watermark_enabled,
       v.season_number, v.episode_number
     from videos v
     ${VIDEO_SUMMARY_JOINS}
     where (v.id::text = $1 or v.slug = $1) and v.status = 'published'`,
    [id],
  );
  if (!row) return null;

  const [credits, tagRows, categoryRows, subtitleRows, audioRows, qualityRows] = await Promise.all([
    query<{ role: string; name: string; character_name: string | null }>(
      "select role, name, character_name from video_credits where video_id = $1 order by ordering",
      [id],
    ),
    query<{ tag: string }>("select tag from video_tags where video_id = $1", [id]),
    query<{ category_id: string }>("select category_id from video_categories where video_id = $1", [id]),
    query<{
      id: string;
      language: string;
      language_code: string;
      kind: string;
      auto_generated: boolean;
      status: string;
    }>("select id, language, language_code, kind, auto_generated, status from video_subtitle_tracks where video_id = $1", [id]),
    query<{ id: string; language: string; language_code: string; kind: string }>(
      "select id, language, language_code, kind from video_audio_tracks where video_id = $1",
      [id],
    ),
    query<{ id: string; label: string; height: number; bitrate_kbps: number }>(
      "select id, label, height, bitrate_kbps from video_quality_levels where video_id = $1 order by height desc",
      [id],
    ),
  ]);

  return {
    ...mapVideoSummary(row),
    heroUrl: row.hero_url,
    productionCompany: row.production_company,
    hasAudioDescription: row.has_audio_description,
    trailerAvailable: row.trailer_available,
    languageCode: row.language_code,
    scheduledFor: row.scheduled_for,
    sampleSrc: row.sample_src,
    watermarkEnabled: row.watermark_enabled,
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

export async function listCategories(): Promise<CategorySummary[]> {
  const rows = await query<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    content_type: string;
    featured: boolean;
    accent_token: number;
    image_url: string | null;
    video_count: string;
  }>(
    `select
       c.id, c.slug, c.name, c.description, c.content_type, c.featured, c.accent_token, c.image_url,
       count(vc.video_id) as video_count
     from categories c
     left join video_categories vc on vc.category_id = c.id
     left join videos v on v.id = vc.video_id and v.status = 'published'
     group by c.id
     order by c.featured desc, c.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    contentType: r.content_type,
    featured: r.featured,
    accentToken: r.accent_token,
    imageUrl: r.image_url,
    videoCount: Number(r.video_count),
  }));
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

export async function getChannelVideos(channelId: string, limit = 24, offset = 0): Promise<VideoSummary[]> {
  const rows = await query<VideoSummaryRow>(
    `select ${VIDEO_SUMMARY_COLUMNS}
     from videos v
     ${VIDEO_SUMMARY_JOINS}
     where v.channel_id = $1 and v.status = 'published'
     order by v.published_at desc nulls last
     limit $2 offset $3`,
    [channelId, Math.min(Math.max(limit, 1), 100), Math.max(offset, 0)],
  );
  return rows.map(mapVideoSummary);
}
