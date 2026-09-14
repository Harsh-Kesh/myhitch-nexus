// One-off backfill: populates the columns added by
// supabase/migrations/20260914000004_engagement_and_channel_fields.sql on the rows
// scripts/seed-catalogue.mjs already created, matched by slug (videos) / handle
// (organizations) since real rows have freshly-generated uuids that don't match the
// mock's fixed string ids. Imports the real mock data directly, same pattern as
// seed-catalogue.mjs — no hand-transcription. Safe to re-run: every write is an UPDATE
// keyed by slug/handle, not an insert.
//
// Usage: node --env-file=.env.local scripts/backfill-engagement-fields.mjs
import { pathToFileURL } from "node:url";
import path from "node:path";
import { Client } from "pg";

async function main() {
  const root = process.cwd();
  const { videos } = await import(pathToFileURL(path.join(root, "src/lib/mock-api/data/videos.ts")).href);
  const { channels } = await import(pathToFileURL(path.join(root, "src/lib/mock-api/data/channels.ts")).href);

  const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  console.log(`Backfilling ${videos.length} videos by slug…`);
  let videosUpdated = 0;
  for (const v of videos) {
    const result = await pg.query(
      `update videos set
         views = $1, unique_viewers = $2, likes = $3, rating_average = $4,
         rating_count = $5, comment_count = $6, watch_time_seconds = $7, completion_rate = $8,
         poster_gradient = $9
       where slug = $10`,
      [
        v.views ?? 0,
        v.uniqueViewers ?? 0,
        v.likes ?? 0,
        v.ratingAverage ?? 0,
        v.ratingCount ?? 0,
        v.commentCount ?? 0,
        v.watchTimeSeconds ?? 0,
        v.completionRate ?? 0,
        v.posterGradient ?? ["#3B2F6B", "#0B1020"],
        v.slug,
      ],
    );

    // video_pricing's rent/buy/ppv price + rental window + membership tier + sponsor
    // name weren't populated by the original seed script (it only set access_models) —
    // same discovery, same fix: these are real mock fields, backfill them for real.
    if (v.pricing) {
      await pg.query(
        `update video_pricing set
           rent_price_minor = $1, rent_price_currency = $2,
           buy_price_minor = $3, buy_price_currency = $4,
           ppv_price_minor = $5, ppv_price_currency = $6,
           rental_window_hours = $7, membership_tier = $8,
           sponsored = $9, sponsor_name = $10
         where video_id = (select id from videos where slug = $11)`,
        [
          v.pricing.rentPrice?.amount ?? null,
          v.pricing.rentPrice?.currency ?? null,
          v.pricing.buyPrice?.amount ?? null,
          v.pricing.buyPrice?.currency ?? null,
          v.pricing.ppvPrice?.amount ?? null,
          v.pricing.ppvPrice?.currency ?? null,
          v.pricing.rentalWindowHours ?? null,
          v.pricing.membershipTier ?? null,
          v.pricing.sponsored ?? false,
          v.pricing.sponsorName ?? null,
          v.slug,
        ],
      );
    }
    if (result.rowCount > 0) videosUpdated += result.rowCount;
  }
  console.log(`  ${videosUpdated} video rows updated.`);

  console.log(`Backfilling ${channels.length} channels by handle…`);
  let channelsUpdated = 0;
  for (const c of channels) {
    const result = await pg.query(
      `update organizations set
         languages = $1, links = $2, verification_status = $3, joined_at = $4,
         followers = $5, total_views = $6, banner_gradient = $7, avatar_gradient = $8
       where handle = $9`,
      [
        c.languages ?? [],
        JSON.stringify(c.links ?? []),
        c.verificationStatus ?? "unverified",
        c.joinedAt ?? null,
        c.followers ?? 0,
        c.totalViews ?? 0,
        c.bannerGradient ?? ["#2A1B4D", "#0D1424"],
        c.avatarGradient ?? ["#8B5CF6", "#4C2889"],
        c.handle,
      ],
    );
    if (result.rowCount > 0) channelsUpdated += result.rowCount;
  }
  console.log(`  ${channelsUpdated} organization rows updated.`);

  await pg.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
