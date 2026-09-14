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
  durationSeconds: number;
  releaseDate: string | null;
  publishedAt: string | null;
  language: string | null;
  country: string | null;
  accessModels: string[];
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
  duration_seconds: number;
  release_date: string | null;
  published_at: string | null;
  language: string | null;
  country: string | null;
  access_models: string[] | null;
}

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
    durationSeconds: row.duration_seconds,
    releaseDate: row.release_date,
    publishedAt: row.published_at,
    language: row.language,
    country: row.country,
    accessModels: row.access_models ?? ["free"],
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
  /** "popular" and "rating" are accepted but currently fall back to "newest" — there is
   * no real view-count/rating data yet (analytics-pipeline outputs, not built). Falling
   * back rather than erroring keeps the frontend's existing sort dropdown working; the
   * fallback is temporary, not a permanent design choice. */
  sort?: "newest" | "duration" | "popular" | "rating";
  limit?: number;
  offset?: number;
}

export interface SearchVideosResult {
  items: VideoSummary[];
  total: number;
  limit: number;
  offset: number;
}

function typesenseFilters(params: SearchVideosParams): string[] {
  const filters: string[] = [];
  const inList = (field: string, values?: string[]) => {
    if (values?.length) filters.push(`${field}:=[${values.map((v) => JSON.stringify(v)).join(",")}]`);
  };
  inList("content_type", params.contentTypes);
  inList("category_ids", params.categoryIds);
  inList("language", params.languages);
  inList("country", params.countries);
  inList("access_models", params.accessModels);
  inList("age_rating", params.ageRatings);
  if (params.minDurationSeconds !== undefined) filters.push(`duration_seconds:>=${params.minDurationSeconds}`);
  if (params.maxDurationSeconds !== undefined) filters.push(`duration_seconds:<=${params.maxDurationSeconds}`);
  if (params.releaseYearFrom !== undefined) filters.push(`release_year:>=${params.releaseYearFrom}`);
  if (params.releaseYearTo !== undefined) filters.push(`release_year:<=${params.releaseYearTo}`);
  return filters;
}

function typesenseSortBy(sort: SearchVideosParams["sort"], hasQuery: boolean): string {
  switch (sort) {
    case "duration":
      return "duration_seconds:desc";
    case "newest":
    case "popular": // fallback — see the SearchVideosParams.sort comment
    case "rating": // fallback — see the SearchVideosParams.sort comment
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
    `select
       v.id, v.slug, v.title, v.synopsis, v.channel_id,
       o.name as channel_name, o.handle as channel_handle,
       v.content_type, v.status, v.thumbnail_url, v.duration_seconds,
       v.release_date, v.published_at, v.language, v.country,
       p.access_models
     from videos v
     join organizations o on o.id = v.channel_id
     left join video_pricing p on p.video_id = v.id
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
  };

  const result = await getTypesenseClient()
    .collections(VIDEOS_COLLECTION)
    .documents()
    .search(searchParameters as never);

  const ids = (result.hits ?? []).map((hit: { document: unknown }) => (hit.document as { id: string }).id);
  const items = await getVideosByIds(ids);

  return { items, total: result.found ?? 0, limit, offset };
}

export interface VideoDetail extends VideoSummary {
  heroUrl: string | null;
  productionCompany: string | null;
  hasAudioDescription: boolean;
  trailerAvailable: boolean;
  credits: Array<{ role: string; name: string; character: string | null }>;
  tags: string[];
  categoryIds: string[];
  rights: {
    declaredOwner: string;
    ownershipConfirmed: boolean;
    licenceStart: string | null;
    licenceEnd: string | null;
    permittedCountries: string[];
    blockedCountries: string[];
    ageRating: string;
    contentLabels: string[];
  } | null;
}

/** Returns null rather than throwing for "not found" — the route handler decides that's
 * a 404, this layer just reports absence. */
export async function getVideoById(id: string): Promise<VideoDetail | null> {
  const row = await queryOne<
    VideoSummaryRow & {
      hero_url: string | null;
      production_company: string | null;
      has_audio_description: boolean;
      trailer_available: boolean;
    }
  >(
    `select
       v.id, v.slug, v.title, v.synopsis, v.channel_id,
       o.name as channel_name, o.handle as channel_handle,
       v.content_type, v.status, v.thumbnail_url, v.hero_url, v.duration_seconds,
       v.release_date, v.published_at, v.language, v.country, v.production_company,
       v.has_audio_description, v.trailer_available,
       p.access_models
     from videos v
     join organizations o on o.id = v.channel_id
     left join video_pricing p on p.video_id = v.id
     where v.id = $1 and v.status = 'published'`,
    [id],
  );
  if (!row) return null;

  const [credits, tagRows, categoryRows, rights] = await Promise.all([
    query<{ role: string; name: string; character_name: string | null }>(
      "select role, name, character_name from video_credits where video_id = $1 order by ordering",
      [id],
    ),
    query<{ tag: string }>("select tag from video_tags where video_id = $1", [id]),
    query<{ category_id: string }>("select category_id from video_categories where video_id = $1", [id]),
    queryOne<{
      declared_owner: string;
      ownership_confirmed: boolean;
      licence_start: string | null;
      licence_end: string | null;
      permitted_countries: string[];
      blocked_countries: string[];
      age_rating: string;
      content_labels: string[];
    }>("select * from video_rights where video_id = $1", [id]),
  ]);

  return {
    ...mapVideoSummary(row),
    heroUrl: row.hero_url,
    productionCompany: row.production_company,
    hasAudioDescription: row.has_audio_description,
    trailerAvailable: row.trailer_available,
    credits: credits.map((c) => ({ role: c.role, name: c.name, character: c.character_name })),
    tags: tagRows.map((t) => t.tag),
    categoryIds: categoryRows.map((c) => c.category_id),
    rights: rights
      ? {
          declaredOwner: rights.declared_owner,
          ownershipConfirmed: rights.ownership_confirmed,
          licenceStart: rights.licence_start,
          licenceEnd: rights.licence_end,
          permittedCountries: rights.permitted_countries,
          blockedCountries: rights.blocked_countries,
          ageRating: rights.age_rating,
          contentLabels: rights.content_labels,
        }
      : null,
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
  avatarUrl: string | null;
  bannerUrl: string | null;
  contactEmail: string | null;
  videoCount: number;
  // followers/totalViews are analytics-pipeline outputs (SRS §6.9) that don't exist yet
  // — 0 here is "not yet computed", not a real count, until that pipeline is built.
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
    avatar_url: string | null;
    banner_url: string | null;
    business_email: string | null;
    video_count: string;
  }>(
    `select
       o.id, o.handle, o.name, o.type, o.tagline, o.description, o.verified, o.country,
       o.avatar_url, o.banner_url, o.business_email,
       (select count(*) from videos v where v.channel_id = o.id and v.status = 'published') as video_count
     from organizations o
     where o.id = $1`,
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
    avatarUrl: row.avatar_url,
    bannerUrl: row.banner_url,
    contactEmail: row.business_email,
    videoCount: Number(row.video_count),
    followers: 0,
    totalViews: 0,
  };
}

export async function getChannelVideos(channelId: string, limit = 24, offset = 0): Promise<VideoSummary[]> {
  const rows = await query<VideoSummaryRow>(
    `select
       v.id, v.slug, v.title, v.synopsis, v.channel_id,
       o.name as channel_name, o.handle as channel_handle,
       v.content_type, v.status, v.thumbnail_url, v.duration_seconds,
       v.release_date, v.published_at, v.language, v.country,
       p.access_models
     from videos v
     join organizations o on o.id = v.channel_id
     left join video_pricing p on p.video_id = v.id
     where v.channel_id = $1 and v.status = 'published'
     order by v.published_at desc nulls last
     limit $2 offset $3`,
    [channelId, Math.min(Math.max(limit, 1), 100), Math.max(offset, 0)],
  );
  return rows.map(mapVideoSummary);
}
