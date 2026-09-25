// Server-only. The real, server-side counterpart of what mock-api/index.ts's
// getEntitlement() used to decide entirely in the browser for a real video: owner
// bypass, geo-restriction, age-gating, and the free/ad-supported/paid split. Found live
// during the 2026-09-24/25 platform audit — commerce.ts's checkRealEntitlement() already
// closed this for the one case that goes through a real payment (subscription/purchase),
// but a signed-in viewer's active profile, and a guest's request country, were both read
// straight from client-side mock store state for every free or ad-supported real video
// (the majority of the catalogue) — trivially spoofable, and never checked at all for an
// anonymous visitor. This is the single gate GET /api/videos/[id]/entitlement now applies
// unconditionally, for every real video and every caller (signed in or not).
import "server-only";
import { queryOne } from "./db";
import { isChannelMember } from "./channelSettings";
import { checkRealEntitlement, isBlockedByProfileAgeRating } from "./commerce";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PlaybackAuthResult {
  granted: boolean;
  reason?: "owner" | "free" | "ad-supported" | "subscription" | "membership" | "purchased" | "rented" | "ticket";
  blockReason?: "unavailable" | "geo-restricted" | "age-gate" | "entitlement-required";
  expiresAt?: string;
}

interface VideoGateRow {
  channel_id: string;
  permitted_countries: string[] | null;
  blocked_countries: string[] | null;
  access_models: string[] | null;
}

export interface AuthorizeVideoAccessInput {
  accountId: string | null;
  videoId: string;
  profileId?: string | null;
  /** Raw ISO 3166-1 alpha-2 code (requestMeta.ts's countryCodeFromHeaders()), or null
   * when it can't be determined — geo-restriction fails open in that case (see below). */
  country: string | null;
}

/** Mirrors getVideoById()'s own `status = 'published'` filter (catalogue.ts) — a video
 * that isn't published has already 404'd on the video-detail fetch for anyone but its
 * owner, so this only needs to re-derive channel/rights/pricing, not re-check status. */
async function loadGateRow(videoId: string): Promise<VideoGateRow | null> {
  if (!UUID_PATTERN.test(videoId)) return null;
  return queryOne<VideoGateRow>(
    `select v.channel_id, r.permitted_countries, r.blocked_countries, p.access_models
     from videos v
     left join video_rights r on r.video_id = v.id
     left join video_pricing p on p.video_id = v.id
     where v.id = $1 and v.status = 'published'`,
    [videoId],
  );
}

/** The one real authorization gate for watching a video — owner bypass, then geo, then
 * age-gate + payment (free/ad-supported content only needs the age-gate; anything else
 * defers fully to checkRealEntitlement(), which already does its own age-gate + payment
 * check together, so it's never duplicated here). */
export async function authorizeVideoAccess(input: AuthorizeVideoAccessInput): Promise<PlaybackAuthResult> {
  const video = await loadGateRow(input.videoId);
  if (!video) return { granted: false, blockReason: "unavailable" };

  if (input.accountId && (await isChannelMember(input.accountId, video.channel_id))) {
    return { granted: true, reason: "owner" };
  }

  const permitted = video.permitted_countries ?? [];
  const blocked = video.blocked_countries ?? [];
  const geoBlocked =
    input.country != null && (blocked.includes(input.country) || (permitted.length > 0 && !permitted.includes(input.country)));
  if (geoBlocked) {
    return { granted: false, blockReason: "geo-restricted" };
  }

  const models = video.access_models ?? [];
  const isFreeAccess = models.includes("free") || models.includes("ad-supported");

  if (isFreeAccess) {
    if (await isBlockedByProfileAgeRating(input.accountId ?? "", input.videoId, input.profileId)) {
      return { granted: false, blockReason: "age-gate" };
    }
    return { granted: true, reason: models.includes("free") ? "free" : "ad-supported" };
  }

  if (!input.accountId) {
    return { granted: false, blockReason: "entitlement-required" };
  }

  const result = await checkRealEntitlement(input.accountId, input.videoId, input.profileId);
  if (!result.granted) {
    return { granted: false, blockReason: result.ageGated ? "age-gate" : "entitlement-required" };
  }
  const reason =
    result.kind === "rent"
      ? "rented"
      : result.kind === "ppv"
        ? "ticket"
        : result.kind === "subscription"
          ? "subscription"
          : result.kind === "membership"
            ? "membership"
            : "purchased";
  return { granted: true, reason, expiresAt: result.expiresAt };
}
