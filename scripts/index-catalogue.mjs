// One-way sync: published videos in Postgres -> the Typesense `videos` collection.
// Postgres stays the source of truth; this script (re-)builds the search index from it.
// Safe to re-run — recreates the collection from scratch each time rather than trying to
// diff, since the catalogue is small enough (tens of videos, not millions) that a full
// rebuild is simpler and more obviously correct than incremental upserts plus deletes for
// unpublished/removed videos.
//
// Usage: node --env-file=.env.local scripts/index-catalogue.mjs
import { Client } from "pg";
import Typesense from "typesense";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const VIDEOS_COLLECTION = "videos";

const videosSchema = {
  name: VIDEOS_COLLECTION,
  fields: [
    { name: "title", type: "string" },
    { name: "synopsis", type: "string", optional: true },
    { name: "content_type", type: "string", facet: true },
    { name: "kind", type: "string", facet: true, optional: true },
    { name: "category_ids", type: "string[]", facet: true, optional: true },
    { name: "tags", type: "string[]", facet: true, optional: true },
    { name: "language", type: "string", facet: true, optional: true },
    { name: "country", type: "string", facet: true, optional: true },
    { name: "access_models", type: "string[]", facet: true },
    { name: "age_rating", type: "string", facet: true },
    { name: "duration_seconds", type: "int32" },
    { name: "release_year", type: "int32", facet: true, optional: true },
    { name: "channel_id", type: "string" },
    { name: "channel_name", type: "string" },
    { name: "published_at_ts", type: "int64" },
    { name: "views", type: "int64" },
    { name: "rating_average", type: "float" },
    { name: "has_subtitles", type: "bool" },
  ],
  default_sorting_field: "published_at_ts",
};

async function main() {
  const pg = new Client({ connectionString: requireEnv("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const ts = new Typesense.Client({
    nodes: [
      {
        host: requireEnv("TYPESENSE_HOST"),
        port: Number(process.env.TYPESENSE_PORT ?? 8108),
        protocol: process.env.TYPESENSE_PROTOCOL ?? "http",
      },
    ],
    apiKey: requireEnv("TYPESENSE_API_KEY"),
    connectionTimeoutSeconds: 10,
  });

  console.log("Fetching published videos from Postgres…");
  const { rows } = await pg.query(`
    select
      v.id, v.title, v.synopsis, v.content_type, v.kind, v.duration_seconds, v.release_date,
      v.language, v.country, v.published_at, v.views, v.rating_average,
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
    where v.status = 'published'
  `);
  console.log(`  ${rows.length} published videos found.`);

  const documents = rows.map((row) => ({
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
  }));

  console.log("Recreating the Typesense collection…");
  try {
    await ts.collections(VIDEOS_COLLECTION).delete();
    console.log("  Deleted existing collection.");
  } catch (err) {
    if (err.httpStatus !== 404) throw err;
    console.log("  No existing collection to delete.");
  }
  await ts.collections().create(videosSchema);
  console.log("  Collection created.");

  if (documents.length > 0) {
    const results = await ts.collections(VIDEOS_COLLECTION).documents().import(documents, { action: "upsert" });
    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      console.error(`  ${failures.length} documents failed to index:`);
      for (const f of failures.slice(0, 5)) console.error("   ", JSON.stringify(f));
      process.exitCode = 1;
    } else {
      console.log(`  Indexed ${results.length} documents successfully.`);
    }
  }

  await pg.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
