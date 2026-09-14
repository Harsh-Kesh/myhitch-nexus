// One-off seed script: populates the real Postgres catalogue schema
// (organizations, categories, videos, and all catalogue child tables) from
// the frontend prototype's actual mock data in src/lib/mock-api/data/*.ts,
// so the real API routes have real, recognisable demo content to return
// instead of an empty database.
//
// Reuses the mock TypeScript objects programmatically (via Node's native
// TS type-stripping support in Node 20.9+/24 — no ts-node/tsx needed here;
// confirmed working against this project's plain `import()` of .ts files)
// rather than hand-transcribing values into SQL, so the seeded rows are
// guaranteed faithful to the prototype's demo content.
//
// Idempotent-ish: refuses to run a second time if `organizations` already
// has rows, so reruns never create duplicates. Wrapped in one transaction.
//
// Usage: node --env-file=.env.local scripts/seed-catalogue.mjs

import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

const ROOT = path.join(import.meta.dirname, "..");
const mockDataUrl = (file) => pathToFileURL(path.join(ROOT, "src/lib/mock-api/data", file)).href;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set — pass --env-file=.env.local or export it first.");
  }

  // Import the real mock data modules directly — the actual demo content.
  const { channels } = await import(mockDataUrl("channels.ts"));
  const { categories } = await import(mockDataUrl("categories.ts"));
  const { videos } = await import(mockDataUrl("videos.ts"));

  console.log(`Loaded mock data: ${channels.length} channels, ${categories.length} categories, ${videos.length} videos.`);

  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const counts = {
    organizations: 0,
    categories: 0,
    videos: 0,
    video_categories: 0,
    video_tags: 0,
    video_credits: 0,
    video_rights: 0,
    video_pricing: 0,
    video_subtitle_tracks: 0,
    video_audio_tracks: 0,
    video_quality_levels: 0,
  };
  const skipped = [];

  try {
    const { rows: existing } = await client.query("select count(*)::int as n from organizations");
    if (existing[0].n > 0) {
      console.log(
        `organizations already has ${existing[0].n} row(s) — refusing to reseed. Exiting without inserting anything.`,
      );
      return;
    }

    await client.query("begin");

    // ── organizations (one per mock channel) ────────────────────────────
    const channelIdMap = new Map(); // mock channel id -> real uuid
    for (const ch of channels) {
      const { rows } = await client.query(
        `insert into organizations
           (name, handle, type, verified, tagline, description, avatar_url, banner_url, country, business_email)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         returning id`,
        [
          ch.name,
          ch.handle ?? null,
          ch.kind, // ChannelKind values match organizations.type check constraint exactly
          ch.verified ?? false,
          ch.tagline ?? null,
          ch.about ?? null,
          ch.avatarUrl ?? null,
          ch.bannerUrl ?? null,
          ch.country ?? null,
          ch.contactEmail ?? null,
        ],
      );
      channelIdMap.set(ch.id, rows[0].id);
      counts.organizations += 1;
    }

    // ── categories ───────────────────────────────────────────────────────
    const categoryIdMap = new Map(); // mock category id -> real uuid
    for (const cat of categories) {
      const { rows } = await client.query(
        `insert into categories (slug, name, description, content_type, featured, accent_token, image_url)
         values ($1,$2,$3,$4,$5,$6,$7)
         returning id`,
        [
          cat.slug,
          cat.name,
          cat.description ?? null,
          cat.contentType, // ContentType matches categories.content_type check constraint exactly
          cat.featured ?? false,
          cat.accentToken,
          cat.imageUrl ?? null,
        ],
      );
      categoryIdMap.set(cat.id, rows[0].id);
      counts.categories += 1;
    }

    // ── videos + child rows ──────────────────────────────────────────────
    for (const v of videos) {
      const realChannelId = channelIdMap.get(v.channelId);
      if (!realChannelId) {
        throw new Error(`Video ${v.id} references unknown channelId ${v.channelId}`);
      }

      // series_id: the mock has string series ids (e.g. "ser_orbit") but this
      // schema has no `series` table yet (deliberately out of scope for the
      // catalogue migration) and videos.series_id is a bare uuid column with
      // no lookup table to satisfy — left null rather than inventing a series
      // table or a fake uuid. season_number/episode_number are independent
      // columns with no FK, so those are still seeded as-is.
      if (v.seriesId) {
        skipped.push(`video ${v.slug}: seriesId "${v.seriesId}" dropped (no series table in schema yet)`);
      }

      const releaseDate = v.releaseDate ? v.releaseDate.slice(0, 10) : null;

      const { rows: videoRows } = await client.query(
        `insert into videos
           (slug, channel_id, title, synopsis, content_type, status, thumbnail_url, hero_url,
            duration_seconds, release_date, published_at, scheduled_for, language, language_code,
            country, production_company, has_audio_description, trailer_available, sample_src,
            watermark_enabled, series_id, season_number, episode_number)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         returning id`,
        [
          v.slug,
          realChannelId,
          v.title,
          v.synopsis ?? null,
          v.contentType, // ContentType matches videos.content_type check constraint exactly
          v.status, // ContentStatus matches videos.status check constraint exactly
          v.thumbnailUrl ?? null,
          v.heroUrl ?? null,
          v.durationSeconds ?? 0,
          releaseDate,
          v.publishedAt ?? null,
          v.scheduledFor ?? null,
          v.language ?? null,
          v.languageCode ?? null,
          v.country ?? null,
          v.productionCompany ?? null,
          v.hasAudioDescription ?? false,
          v.trailerAvailable ?? false,
          v.sampleSrc ?? null,
          v.watermarkEnabled ?? false,
          null, // series_id — see note above
          v.seasonNumber ?? null,
          v.episodeNumber ?? null,
        ],
      );
      const videoId = videoRows[0].id;
      counts.videos += 1;

      // video_categories
      for (const catId of v.categoryIds ?? []) {
        const realCatId = categoryIdMap.get(catId);
        if (!realCatId) {
          skipped.push(`video ${v.slug}: unknown categoryId "${catId}" dropped`);
          continue;
        }
        await client.query(
          `insert into video_categories (video_id, category_id) values ($1,$2)
           on conflict do nothing`,
          [videoId, realCatId],
        );
        counts.video_categories += 1;
      }

      // video_tags
      for (const tag of v.tags ?? []) {
        await client.query(
          `insert into video_tags (video_id, tag) values ($1,$2) on conflict do nothing`,
          [videoId, tag],
        );
        counts.video_tags += 1;
      }

      // video_credits
      const credits = v.credits ?? [];
      for (let i = 0; i < credits.length; i += 1) {
        const credit = credits[i];
        await client.query(
          `insert into video_credits (video_id, role, name, character_name, ordering)
           values ($1,$2,$3,$4,$5)`,
          [videoId, credit.role, credit.name, credit.character ?? null, i],
        );
        counts.video_credits += 1;
      }

      // video_rights (1:1, required)
      const rights = v.rights ?? {};
      await client.query(
        `insert into video_rights
           (video_id, declared_owner, ownership_confirmed, licence_start, licence_end,
            permitted_countries, blocked_countries, age_rating, content_labels)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          videoId,
          rights.declaredOwner ?? channels.find((c) => c.id === v.channelId)?.name ?? "Unknown",
          rights.ownershipConfirmed ?? false,
          rights.licenceStart ? rights.licenceStart.slice(0, 10) : null,
          rights.licenceEnd ? rights.licenceEnd.slice(0, 10) : null,
          rights.permittedCountries ?? [],
          rights.blockedCountries ?? [],
          rights.ageRating ?? "U",
          rights.contentLabels ?? [],
        ],
      );
      counts.video_rights += 1;

      // video_pricing (1:1, required)
      const pricing = v.pricing ?? { accessModels: ["free"] };
      await client.query(
        `insert into video_pricing
           (video_id, access_models, rent_price_minor, rent_price_currency, buy_price_minor,
            buy_price_currency, ppv_price_minor, ppv_price_currency, rental_window_hours,
            membership_tier, sponsored, sponsor_name)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          videoId,
          pricing.accessModels ?? ["free"],
          pricing.rentPrice?.amount ?? null,
          pricing.rentPrice?.currency ?? null,
          pricing.buyPrice?.amount ?? null,
          pricing.buyPrice?.currency ?? null,
          pricing.ppvPrice?.amount ?? null,
          pricing.ppvPrice?.currency ?? null,
          pricing.rentalWindowHours ?? null,
          pricing.membershipTier ?? null,
          pricing.sponsored ?? false,
          pricing.sponsorName ?? null,
        ],
      );
      counts.video_pricing += 1;
      if (pricing.affiliateLinks?.length) {
        skipped.push(
          `video ${v.slug}: ${pricing.affiliateLinks.length} affiliateLinks dropped (no video_pricing/affiliate table in schema)`,
        );
      }

      // video_subtitle_tracks
      for (const sub of v.subtitles ?? []) {
        await client.query(
          `insert into video_subtitle_tracks (video_id, language, language_code, kind, auto_generated, status)
           values ($1,$2,$3,$4,$5,$6)`,
          [videoId, sub.language, sub.languageCode, sub.kind, sub.autoGenerated ?? false, sub.status ?? "ready"],
        );
        counts.video_subtitle_tracks += 1;
      }

      // video_audio_tracks
      for (const track of v.audioTracks ?? []) {
        await client.query(
          `insert into video_audio_tracks (video_id, language, language_code, kind)
           values ($1,$2,$3,$4)`,
          [videoId, track.language, track.languageCode, track.kind],
        );
        counts.video_audio_tracks += 1;
      }

      // video_quality_levels
      for (const q of v.qualities ?? []) {
        await client.query(
          `insert into video_quality_levels (video_id, label, height, bitrate_kbps)
           values ($1,$2,$3,$4)`,
          [videoId, q.label, q.height, q.bitrateKbps],
        );
        counts.video_quality_levels += 1;
      }
    }

    await client.query("commit");
    console.log("Committed.");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }

  console.log("\nRows inserted per table:");
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table}: ${n}`);
  }
  if (skipped.length) {
    console.log("\nSkipped / approximated:");
    for (const s of skipped) console.log(`  - ${s}`);
  }
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exitCode = 1;
});
