// Server-only. The first real slice of P2 (docs/DEVELOPMENT-PLAN.md) — real video
// upload, metadata, rights and a server-enforced publish gate (AC-3). Real video
// publishing has been 100% mock since this project began; everything downstream that
// needed a real video (Magazine's/Exchange Hub's "link one of your uploads" pickers)
// has had nothing to link to until now.
//
// Deliberately still mock: transcoding, real "suggested frame" thumbnails, and
// auto-captioning all need Mux (blocked on the client creating an account) or a real ASR
// vendor — none of that exists here. A published video gets a real row with real
// metadata/rights/pricing, but `processing_status = 'awaiting_transcode'` until a real
// stream exists; the player (video-player.tsx) shows an honest "still processing" state
// for exactly that combination rather than attempting fake playback.
import "server-only";
import { query, queryOne } from "./db";
import { createMasterUploadUrl, masterAssetExists, uploadThumbnail, MAX_MASTER_UPLOAD_BYTES } from "./storage";
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
  | { outcome: "too_large"; maxBytes: number };

export async function createUploadUrl(
  accountId: string,
  channelId: string,
  fileName: string,
  fileSizeBytes: number,
): Promise<CreateUploadUrlResult> {
  if (!(await isChannelMember(accountId, channelId))) {
    return { outcome: "not_channel_member" };
  }
  if (fileSizeBytes > MAX_MASTER_UPLOAD_BYTES) {
    return { outcome: "too_large", maxBytes: MAX_MASTER_UPLOAD_BYTES };
  }
  const { path, signedUrl, token } = await createMasterUploadUrl(channelId, fileName, fileSizeBytes);
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

export interface PublishVideoInput {
  channelId: string;
  masterAssetPath: string;
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
}

export type PublishVideoResult =
  | { outcome: "success"; id: string; slug: string; status: string }
  | { outcome: "not_channel_member" }
  | { outcome: "invalid"; reason: string }
  | { outcome: "asset_missing" };

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

  const asset = await masterAssetExists(input.masterAssetPath);
  if (!asset.exists) {
    return { outcome: "asset_missing" };
  }

  // Same review-routing rule the mock wizard already documents client-side — sponsored
  // or heavily-rated content doesn't go straight to `published` even when requested.
  const needsReview = input.pricing.sponsored || input.rights.ageRating === "18" || input.rights.contentLabels.length > 0;
  const status = input.status === "published" && needsReview ? "pending" : input.status;
  const slug = slugify(input.title);
  const now = new Date();

  const rows = await query<{ id: string }>(
    `insert into videos (
       slug, channel_id, title, synopsis, content_type, status, thumbnail_url,
       poster_gradient, release_date, published_at, scheduled_for, language, country,
       production_company, master_asset_path, master_uploaded_at, master_bytes,
       processing_status
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now(), $16, 'awaiting_transcode')
     returning id`,
    [
      slug,
      input.channelId,
      input.title.trim().slice(0, 200),
      input.description.trim().slice(0, 5000) || null,
      input.contentType,
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
    ],
  );
  const videoId = rows[0].id;

  await Promise.all([
    ...input.categoryIds.map((categoryId) =>
      query(`insert into video_categories (video_id, category_id) values ($1, $2) on conflict do nothing`, [
        videoId,
        categoryId,
      ]),
    ),
    ...input.tags.map((tag) =>
      query(`insert into video_tags (video_id, tag) values ($1, $2) on conflict do nothing`, [videoId, tag]),
    ),
    ...input.participants.map((name, index) =>
      query(`insert into video_credits (video_id, role, name, ordering) values ($1, 'Participant', $2, $3)`, [
        videoId,
        name,
        index,
      ]),
    ),
    ...input.subtitles.map((track) =>
      query(
        `insert into video_subtitle_tracks (video_id, language, language_code, kind, auto_generated, status)
         values ($1, $2, $3, $4, false, 'ready')`,
        [videoId, track.language, track.languageCode, track.kind],
      ),
    ),
    query(
      `insert into video_rights (
         video_id, declared_owner, ownership_confirmed, licence_start, licence_end,
         permitted_countries, blocked_countries, age_rating, content_labels
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        videoId,
        input.rights.declaredOwner.trim(),
        input.rights.ownershipConfirmed,
        input.rights.licenceStart,
        input.rights.licenceEnd,
        input.rights.permittedCountries,
        input.rights.blockedCountries,
        input.rights.ageRating,
        input.rights.contentLabels,
      ],
    ),
    query(
      `insert into video_pricing (
         video_id, access_models, rent_price_minor, rent_price_currency,
         buy_price_minor, buy_price_currency, ppv_price_minor, ppv_price_currency,
         rental_window_hours, sponsored, sponsor_name
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        videoId,
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
    ),
  ]);

  return { outcome: "success", id: videoId, slug, status };
}
