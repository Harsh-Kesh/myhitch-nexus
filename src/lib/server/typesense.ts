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

export const VIDEOS_COLLECTION = "videos";

export const videosSchema = {
  name: VIDEOS_COLLECTION,
  fields: [
    { name: "title", type: "string" as const },
    { name: "synopsis", type: "string" as const, optional: true },
    { name: "content_type", type: "string" as const, facet: true },
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
  } catch (err) {
    const status = (err as { httpStatus?: number }).httpStatus;
    if (status !== 409) throw err;
  }
}
