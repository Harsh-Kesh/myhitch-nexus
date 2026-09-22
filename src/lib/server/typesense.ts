// Server-only. Typesense client + the `videos` collection schema. Self-hosted on Railway
// (see the "typesense" service in the same project) rather than Typesense Cloud, to avoid
// a third vendor account for something trivially self-hostable — reached over Railway's
// private network at TYPESENSE_HOST (typesense.railway.internal), never exposed publicly.
//
// This is the search engine backing the full faceted search in docs/openapi.yaml's
// `searchVideos` operation (languages/countries/access models/duration/age rating/
// release-year range) that GET /api/videos only partially implemented before this existed
// — see the "before Typesense" note in src/lib/server/catalogue.ts's history. Postgres
// remains the source of truth for all of this data; `scripts/index-catalogue.mjs` is the
// one-way sync from Postgres into this index, run after any seed/migration that changes
// published video data.
import "server-only";
import { Client } from "typesense";
import { queryOne } from "./db";

export const VIDEOS_COLLECTION = "videos";

export const videosSchema = {
  name: VIDEOS_COLLECTION,
  fields: [
    { name: "title", type: "string" as const },
    { name: "synopsis", type: "string" as const, optional: true },
    { name: "content_type", type: "string" as const, facet: true },
    // Asset format (video vs. audio — DEC-16) — orthogonal to content_type (genre). Every
    // document indexed before 2026-09-22 predates this field, hence optional: a real
    // collection already holding documents can't have a new required field added to it.
    { name: "kind", type: "string" as const, facet: true, optional: true },
    { name: "category_ids", type: "string[]" as const, facet: true, optional: true },
    { name: "tags", type: "string[]" as const, facet: true, optional: true },
    { name: "language", type: "string" as const, facet: true, optional: true },
    { name: "country", type: "string" as const, facet: true, optional: true },
    { name: "access_models", type: "string[]" as const, facet: true },
    { name: "age_rating", type: "string" as const, facet: true },
    { name: "duration_seconds", type: "int32" as const },
    { name: "release_year", type: "int32" as const, facet: true, optional: true },
    { name: "channel_id", type: "string" as const },
    { name: "channel_name", type: "string" as const },
    { name: "published_at_ts", type: "int64" as const },
    { name: "views", type: "int64" as const },
    { name: "rating_average", type: "float" as const },
    { name: "has_subtitles", type: "bool" as const },
  ],
  default_sorting_field: "published_at_ts",
};

export interface VideoDocument {
  id: string;
  title: string;
  synopsis?: string;
  content_type: string;
  kind: string;
  category_ids?: string[];
  tags?: string[];
  language?: string;
  country?: string;
  access_models: string[];
  age_rating: string;
  duration_seconds: number;
  release_year?: number;
  channel_id: string;
  channel_name: string;
  published_at_ts: number;
  views: number;
  rating_average: number;
  has_subtitles: boolean;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

let client: Client | undefined;

export function getTypesenseClient(): Client {
  if (!client) {
    client = new Client({
      nodes: [
        {
          host: requireEnv("TYPESENSE_HOST"),
          port: Number(process.env.TYPESENSE_PORT ?? 8108),
          protocol: process.env.TYPESENSE_PROTOCOL ?? "http",
        },
      ],
      apiKey: requireEnv("TYPESENSE_API_KEY"),
      connectionTimeoutSeconds: 5,
    });
  }
  return client;
}

/** Creates the collection if it doesn't exist yet. Safe to call on every app boot / at the
 * start of the indexing script — Typesense returns 409 for an existing collection, which
 * this treats as success, not an error. */
export async function ensureVideosCollection(): Promise<void> {
  const ts = getTypesenseClient();
  try {
    await ts.collections().create(videosSchema);
    return;
  } catch (err) {
    const status = (err as { httpStatus?: number }).httpStatus;
    if (status !== 409) throw err;
  }
  // Collection already existed (created before the `kind` field was added) — alter it in
  // place rather than drop/recreate, which would lose every already-indexed document.
  // Typesense errors if the field is already there; that's "already in the right state",
  // not a real failure, so it's swallowed like the 409 above.
  try {
    await ts.collections(VIDEOS_COLLECTION).update({
      fields: [{ name: "kind", type: "string", facet: true, optional: true }],
    });
  } catch {
    // Already has the field, or the alter genuinely failed — either way, non-fatal here;
    // syncVideoSearchIndex()'s own upsert will surface a real schema mismatch loudly.
  }
}

/** Same query/mapping as scripts/index-catalogue.mjs, for exactly one video — that script
 * was the *only* way a real video ever reached Typesense (an explicit note that it's "run
 * after any seed/migration that changes published video data"), so a real creator
 * publishing through the actual app never got indexed at all: it existed in Postgres and
 * rendered fine everywhere that reads Postgres directly (their own channel page), but
 * never appeared in Explore/search, which is 100% Typesense-backed. Found live 2026-09-21.
 * Called after every real status change a video can go through (publishVideo,
 * updateVideoStatus, activateScheduledVideos) so the index self-heals in both directions —
 * newly published videos appear, and a video pulled back to draft/archived disappears. */
export async function syncVideoSearchIndex(videoId: string): Promise<void> {
  try {
    const row = await queryOne<{
      id: string;
      title: string;
      synopsis: string | null;
      content_type: string;
      kind: string;
      duration_seconds: number;
      release_date: string | null;
      language: string | null;
      country: string | null;
      published_at: string | null;
      views: string;
      rating_average: number;
      has_subtitles: boolean;
      channel_id: string;
      channel_name: string;
      access_models: string[];
      age_rating: string;
      category_ids: string[];
      tags: string[];
      status: string;
    }>(
      `select
         v.id, v.title, v.synopsis, v.content_type, v.kind, v.duration_seconds, v.release_date,
         v.language, v.country, v.published_at, v.views, v.rating_average, v.status,
         exists(select 1 from video_subtitle_tracks st where st.video_id = v.id) as has_subtitles,
         o.id as channel_id, o.name as channel_name,
         coalesce(p.access_models, array['free']) as access_models,
         coalesce(r.age_rating, 'U') as age_rating,
         coalesce(
           (select array_agg(vc.category_id::text) from video_categories vc where vc.video_id = v.id),
           array[]::text[]
         ) as category_ids,
         coalesce(
           (select array_agg(vt.tag) from video_tags vt where vt.video_id = v.id),
           array[]::text[]
         ) as tags
       from videos v
       join organizations o on o.id = v.channel_id
       left join video_pricing p on p.video_id = v.id
       left join video_rights r on r.video_id = v.id
       where v.id = $1`,
      [videoId],
    );

    const ts = getTypesenseClient();
    if (!row || row.status !== "published") {
      // Not found, or no longer published — make sure it isn't searchable. A delete of a
      // document that was never indexed 404s, which is exactly "already in the right
      // state", not an error.
      try {
        await ts.collections(VIDEOS_COLLECTION).documents(videoId).delete();
      } catch (err) {
        const status = (err as { httpStatus?: number }).httpStatus;
        if (status !== 404) throw err;
      }
      return;
    }

    const document: VideoDocument = {
      id: row.id,
      title: row.title,
      synopsis: row.synopsis ?? undefined,
      content_type: row.content_type,
      kind: row.kind,
      category_ids: row.category_ids,
      tags: row.tags,
      language: row.language ?? undefined,
      country: row.country ?? undefined,
      access_models: row.access_models,
      age_rating: row.age_rating,
      duration_seconds: row.duration_seconds,
      release_year: row.release_date ? new Date(row.release_date).getUTCFullYear() : undefined,
      channel_id: row.channel_id,
      channel_name: row.channel_name,
      published_at_ts: row.published_at ? Math.floor(new Date(row.published_at).getTime() / 1000) : 0,
      views: Number(row.views),
      rating_average: Number(row.rating_average),
      has_subtitles: row.has_subtitles,
    };
    await ensureVideosCollection();
    await ts.collections(VIDEOS_COLLECTION).documents().upsert(document);
  } catch (err) {
    // Best-effort, same as malwareScan.ts's scanner — a Typesense hiccup (or it not being
    // configured in a given environment) must never block a real publish/status change
    // that already succeeded in Postgres, the actual source of truth.
    console.error(`Failed to sync video ${videoId} to the search index`, err);
  }
}
