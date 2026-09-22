// Server-only. The first real slice of P2 (docs/DEVELOPMENT-PLAN.md) — real video
// upload, metadata, rights and a server-enforced publish gate (AC-3). Real video
// publishing has been 100% mock since this project began; everything downstream that
// needed a real video (Magazine's/Exchange Hub's "link one of your uploads" pickers)
// has had nothing to link to until now.
//
// Deliberately still mock: transcoding and auto-captioning need Mux (blocked on the
// client creating an account) or a real ASR vendor — neither exists here. A published
// video gets a real row with real metadata/rights/pricing, but
// `processing_status = 'awaiting_transcode'` until a real stream exists; the player
// (video-player.tsx) shows an honest "still processing" state for exactly that
// combination rather than attempting fake playback. Suggested-frame thumbnails
// (generateSuggestedThumbnails below) became real on 2026-09-17, once ffprobe/ffmpeg
// were already wired up for upload validation.
import "server-only";
import { query, queryOne, withTransaction } from "./db";
import { createMasterUploadUrl, masterAssetExists, uploadThumbnail, MAX_MASTER_UPLOAD_BYTES } from "./storage";
import { probeMasterAsset } from "./videoValidation";
import { scanMasterAssetForMalware } from "./malwareScan";
import { generateSuggestedThumbnails as generateFrames, type ThumbnailSuggestion } from "./thumbnailSuggestions";
import { seriesBelongsToChannel } from "./series";
import { flagForReview } from "./moderation";
import { syncVideoSearchIndex } from "./typesense";
import { pickGradient } from "../utils";

async function isChannelMember(accountId: string, channelId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from memberships where account_id = $1 and organization_id = $2`,
    [accountId, channelId],
  );
  return Boolean(row);
}

export type CreateUploadUrlResult =
  | { outcome: "success"; path: string; signedUrl: string; token: string; maxBytes: number }
  | { outcome: "not_channel_member" }
  | { outcome: "upload_restricted"; until: string }
  | { outcome: "too_large"; maxBytes: number };

export async function createUploadUrl(
  accountId: string,
  channelId: string,
  fileName: string,
  fileSizeBytes: number,
  kind: "video" | "audio" = "video",
): Promise<CreateUploadUrlResult> {
  if (!(await isChannelMember(accountId, channelId))) {
    return { outcome: "not_channel_member" };
  }
  const org = await queryOne<{ upload_restricted_until: string | null }>(
    `select upload_restricted_until from organizations where id = $1`,
    [channelId],
  );
  if (org?.upload_restricted_until && new Date(org.upload_restricted_until) > new Date()) {
    return { outcome: "upload_restricted", until: org.upload_restricted_until };
  }
  if (fileSizeBytes > MAX_MASTER_UPLOAD_BYTES) {
    return { outcome: "too_large", maxBytes: MAX_MASTER_UPLOAD_BYTES };
  }
  const { path, signedUrl, token } = await createMasterUploadUrl(channelId, fileName, fileSizeBytes, kind);
  return { outcome: "success", path, signedUrl, token, maxBytes: MAX_MASTER_UPLOAD_BYTES };
}

export async function uploadCustomThumbnail(
  accountId: string,
  channelId: string,
  fileName: string,
  file: Buffer,
  contentType: string,
): Promise<{ outcome: "success"; url: string } | { outcome: "not_channel_member" }> {
  if (!(await isChannelMember(accountId, channelId))) {
    return { outcome: "not_channel_member" };
  }
  const url = await uploadThumbnail(channelId, fileName, file, contentType);
  return { outcome: "success", url };
}

export type GenerateSuggestedThumbnailsResult =
  | { outcome: "success"; suggestions: ThumbnailSuggestion[] }
  | { outcome: "not_channel_member" }
  | { outcome: "asset_missing" };

export async function generateSuggestedThumbnails(
  accountId: string,
  channelId: string,
  masterAssetPath: string,
): Promise<GenerateSuggestedThumbnailsResult> {
  if (!(await isChannelMember(accountId, channelId))) {
    return { outcome: "not_channel_member" };
  }
  const asset = await masterAssetExists(masterAssetPath);
  if (!asset.exists) {
    return { outcome: "asset_missing" };
  }
  const suggestions = await generateFrames(channelId, masterAssetPath);
  return { outcome: "success", suggestions };
}

export interface PublishVideoInput {
  channelId: string;
  masterAssetPath: string;
  kind: "video" | "audio";
  title: string;
  description: string;
  contentType: string;
  categoryIds: string[];
  tags: string[];
  participants: string[];
  productionCompany: string | null;
  releaseDate: string | null;
  language: string;
  country: string;
  customThumbnailUrl: string | null;
  subtitles: Array<{ language: string; languageCode: string; kind: string }>;
  rights: {
    declaredOwner: string;
    ownershipConfirmed: boolean;
    licenceStart: string | null;
    licenceEnd: string | null;
    permittedCountries: string[];
    blockedCountries: string[];
    ageRating: string;
    contentLabels: string[];
  };
  pricing: {
    accessModels: string[];
    rentPrice?: { amount: number; currency: string };
    buyPrice?: { amount: number; currency: string };
    ppvPrice?: { amount: number; currency: string };
    rentalWindowHours?: number;
    sponsored: boolean;
    sponsorName?: string;
  };
  status: string;
  scheduledFor: string | null;
  seriesId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
}

export type PublishVideoResult =
  | { outcome: "success"; id: string; slug: string; status: string }
  | { outcome: "not_channel_member" }
  | { outcome: "invalid"; reason: string }
  | { outcome: "asset_missing" }
  | { outcome: "invalid_file"; reason: string }
  | { outcome: "malware_detected"; signature: string };

const VALID_STATUSES = ["draft", "private", "unlisted", "scheduled", "published", "archived"];

function slugify(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "untitled";
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

/** The server-enforced publish gate (AC-3) — everything the Studio wizard's own
 * `canContinue()` already checks client-side, now unbypassable via a direct API call.
 * Incomplete metadata or missing rights cannot publish, full stop. */
export async function publishVideo(accountId: string, input: PublishVideoInput): Promise<PublishVideoResult> {
  if (!(await isChannelMember(accountId, input.channelId))) {
    return { outcome: "not_channel_member" };
  }
  if (!input.title.trim() || input.title.trim().length < 3) {
    return { outcome: "invalid", reason: "A title of at least 3 characters is required." };
  }
  if (input.categoryIds.length === 0) {
    return { outcome: "invalid", reason: "At least one category is required." };
  }
  if (!input.rights.declaredOwner.trim() || !input.rights.ownershipConfirmed) {
    return { outcome: "invalid", reason: "Declared rights holder and ownership confirmation are required." };
  }
  if (!VALID_STATUSES.includes(input.status)) {
    return { outcome: "invalid", reason: "Unrecognized publishing status." };
  }
  if (input.seriesId && !(await seriesBelongsToChannel(input.seriesId, input.channelId))) {
    return { outcome: "invalid", reason: "That series doesn't belong to this channel." };
  }

  const asset = await masterAssetExists(input.masterAssetPath, input.kind);
  if (!asset.exists) {
    return { outcome: "asset_missing" };
  }

  const probe = await probeMasterAsset(input.masterAssetPath, input.kind);
  if (!probe.ok) {
    return { outcome: "invalid_file", reason: probe.reason };
  }

  // Best-effort, not a hard requirement — see malwareScan.ts's header for why an
  // "unavailable" scanner doesn't block publishing (fails open, not closed).
  const scan = await scanMasterAssetForMalware(input.masterAssetPath, input.kind);
  if (scan.status === "infected") {
    return { outcome: "malware_detected", signature: scan.signature };
  }

  // Same review-routing rule the mock wizard already documents client-side — sponsored
  // or heavily-rated content doesn't go straight to `published` even when requested.
  const needsReview = input.pricing.sponsored || input.rights.ageRating === "18" || input.rights.contentLabels.length > 0;
  const status = input.status === "published" && needsReview ? "pending" : input.status;
  const slug = slugify(input.title);
  const now = new Date();

  // Everything below lands in one transaction — a partial failure (e.g. a bad category
  // id) must not leave an orphaned video row with no rights/categories visible to other
  // queries, the way an earlier Promise.all-of-separate-connections version briefly did.
  const videoId = await withTransaction(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `insert into videos (
         slug, channel_id, title, synopsis, content_type, kind, status, thumbnail_url,
         poster_gradient, release_date, published_at, scheduled_for, language, country,
         production_company, master_asset_path, master_uploaded_at, master_bytes,
         duration_seconds, series_id, season_number, episode_number, processing_status
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now(), $17, $18, $19, $20, $21, 'awaiting_transcode')
       returning id`,
      [
        slug,
        input.channelId,
        input.title.trim().slice(0, 200),
        input.description.trim().slice(0, 5000) || null,
        input.contentType,
        input.kind,
        status,
        input.customThumbnailUrl,
        // Same deterministic-palette approach already used for channel avatars/banners
        // (channelProvisioning.ts) — real posters need a real transcode pipeline (Mux),
        // not built yet, so a video card falls back to this exactly like a channel does.
        pickGradient(slug),
        input.releaseDate,
        status === "published" ? now.toISOString() : null,
        status === "scheduled" ? input.scheduledFor : null,
        input.language,
        input.country,
        input.productionCompany?.trim() || null,
        input.masterAssetPath,
        asset.bytes,
        probe.durationSeconds,
        input.seriesId,
        input.seriesId ? input.seasonNumber : null,
        input.seriesId ? input.episodeNumber : null,
      ],
    );
    const id = rows[0].id;

    for (const categoryId of input.categoryIds) {
      await tx.query(`insert into video_categories (video_id, category_id) values ($1, $2) on conflict do nothing`, [
        id,
        categoryId,
      ]);
    }
    for (const tag of input.tags) {
      await tx.query(`insert into video_tags (video_id, tag) values ($1, $2) on conflict do nothing`, [id, tag]);
    }
    for (const [index, name] of input.participants.entries()) {
      await tx.query(`insert into video_credits (video_id, role, name, ordering) values ($1, 'Participant', $2, $3)`, [
        id,
        name,
        index,
      ]);
    }
    for (const track of input.subtitles) {
      await tx.query(
        `insert into video_subtitle_tracks (video_id, language, language_code, kind, auto_generated, status)
         values ($1, $2, $3, $4, false, 'ready')`,
        [id, track.language, track.languageCode, track.kind],
      );
    }
    await tx.query(
      `insert into video_rights (
         video_id, declared_owner, ownership_confirmed, licence_start, licence_end,
         permitted_countries, blocked_countries, age_rating, content_labels
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        input.rights.declaredOwner.trim(),
        input.rights.ownershipConfirmed,
        input.rights.licenceStart,
        input.rights.licenceEnd,
        input.rights.permittedCountries,
        input.rights.blockedCountries,
        input.rights.ageRating,
        input.rights.contentLabels,
      ],
    );
    await tx.query(
      `insert into video_pricing (
         video_id, access_models, rent_price_minor, rent_price_currency,
         buy_price_minor, buy_price_currency, ppv_price_minor, ppv_price_currency,
         rental_window_hours, sponsored, sponsor_name
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        input.pricing.accessModels,
        input.pricing.rentPrice?.amount ?? null,
        input.pricing.rentPrice?.currency ?? null,
        input.pricing.buyPrice?.amount ?? null,
        input.pricing.buyPrice?.currency ?? null,
        input.pricing.ppvPrice?.amount ?? null,
        input.pricing.ppvPrice?.currency ?? null,
        input.pricing.rentalWindowHours ?? null,
        input.pricing.sponsored,
        input.pricing.sponsorName?.trim() || null,
      ],
    );

    return id;
  });

  // The moderation-queue counterpart of the needsReview override above — a video routed
  // to 'pending' is otherwise invisible to /admin/reviews, which reads this table, not
  // videos.status directly (docs/DEVELOPMENT-PLAN.md's admin-screens entry).
  if (status === "pending") {
    await flagForReview({
      kind: "content",
      targetId: videoId,
      title: input.title.trim().slice(0, 200),
      channelId: input.channelId,
      queue: "pending-review",
      notes: input.pricing.sponsored
        ? "Routed to review: paid partnership declared."
        : "Routed to review: an 18+ rating or a content label is present.",
    });
  }

  // Postgres is the source of truth and already reflects this; Explore/search is 100%
  // Typesense-backed and was never told about it any other way (see this function's own
  // absence from the previously-only indexing path, scripts/index-catalogue.mjs).
  await syncVideoSearchIndex(videoId);

  return { outcome: "success", id: videoId, slug, status };
}

const CREATOR_SETTABLE_STATUSES = ["draft", "private", "unlisted", "published", "archived"];

export type UpdateVideoStatusResult =
  | { outcome: "success"; status: string }
  | { outcome: "not_channel_member" }
  | { outcome: "not_found" }
  | { outcome: "invalid"; reason: string };

/** Real counterpart of the mock's updateVideoStatus() — post-creation status changes
 * from Studio's content list. Re-derives the same needsReview gate publishVideo() itself
 * enforces (a bypass attempt via this route, not just at creation, must still fail —
 * same AC-3 spirit) rather than trusting the caller's requested status outright. */
export async function updateVideoStatus(
  accountId: string,
  videoId: string,
  status: string,
): Promise<UpdateVideoStatusResult> {
  const video = await queryOne<{ channel_id: string; title: string }>(
    `select channel_id, title from videos where id = $1`,
    [videoId],
  );
  if (!video) return { outcome: "not_found" };
  if (!(await isChannelMember(accountId, video.channel_id))) {
    return { outcome: "not_channel_member" };
  }
  if (!CREATOR_SETTABLE_STATUSES.includes(status)) {
    return { outcome: "invalid", reason: "That status can't be set directly." };
  }

  let effectiveStatus = status;
  if (status === "published") {
    const [rights, pricing] = await Promise.all([
      queryOne<{ age_rating: string; content_labels: string[] }>(
        `select age_rating, content_labels from video_rights where video_id = $1`,
        [videoId],
      ),
      queryOne<{ sponsored: boolean }>(`select sponsored from video_pricing where video_id = $1`, [videoId]),
    ]);
    const needsReview = Boolean(pricing?.sponsored) || rights?.age_rating === "18" || (rights?.content_labels.length ?? 0) > 0;
    if (needsReview) effectiveStatus = "pending";
  }

  await query(
    `update videos set status = $2, published_at = case when $2 = 'published' then coalesce(published_at, now()) else published_at end
     where id = $1`,
    [videoId, effectiveStatus],
  );

  if (effectiveStatus === "pending") {
    await flagForReview({
      kind: "content",
      targetId: videoId,
      title: video.title,
      channelId: video.channel_id,
      queue: "pending-review",
      notes: "Routed to review: sponsored content, an 18+ rating, or a content label is present.",
    });
  } else {
    // The creator moved it somewhere else themselves (e.g. pulled it back to draft, or
    // archived it) — whatever triggered an earlier review is moot now, so don't leave a
    // phantom "open" queue item for an admin to act on (same reasoning as
    // moderateComment()'s own dismissal in engagement.ts).
    await query(
      `update moderation_queue set status = 'dismissed' where kind = 'content' and target_id = $1 and status = 'open'`,
      [videoId],
    );
  }

  await syncVideoSearchIndex(videoId);

  return { outcome: "success", status: effectiveStatus };
}

/** Flips any video whose scheduled_for has arrived to published — a pull-based
 * activation run on read (see catalogue.ts's getChannelVideos()/getVideoById()) rather
 * than a cron worker, since no job-scheduling infrastructure exists yet and this is
 * correct at the read-heavy scale this app runs at today: a single cheap, indexed
 * UPDATE, never a wasted one (the WHERE clause matches nothing outside the exact window
 * a scheduled video needs it). */
export async function activateScheduledVideos(): Promise<void> {
  const rows = await query<{ id: string }>(
    `update videos set status = 'published', published_at = coalesce(published_at, now())
     where status = 'scheduled' and scheduled_for is not null and scheduled_for <= now()
     returning id`,
  );
  await Promise.all(rows.map((row) => syncVideoSearchIndex(row.id)));
}
