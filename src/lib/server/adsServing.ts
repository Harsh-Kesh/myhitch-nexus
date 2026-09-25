// Server-only. Real ad-serving decision + impression/click recording — the P6 slice's
// "which campaign, if any, plays before this video" logic. See the ad-serving plan's
// own header for the deliberate exclusions (no VAST/VMAP, pre-roll matching only, a flat
// highest-remaining-budget allocation instead of a real-time auction, signed-in-only
// frequency capping). Kept separate from campaigns.ts (lifecycle: create/approve/pause)
// since this module is the hot, read-heavy delivery path with a different shape of query.
import "server-only";
import { query, queryOne, withTransaction } from "./db";
import { getFrequencyCount, incrementFrequency } from "./adFrequency";
import { getAdRevenueSharePct } from "./commissions";
import { getAdCreativePublicUrl } from "./storage";

interface VideoTargetingRow {
  channel_id: string;
  channel_type: string;
  age_rating: string | null;
  content_labels: string[] | null;
  access_models: string[] | null;
}

const AGE_RATING_ORDER = ["U", "PG", "12", "15", "18"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadVideoTargeting(videoId: string): Promise<{
  channelId: string;
  channelType: string;
  ageRating: string;
  contentLabels: string[];
  categoryIds: string[];
} | null> {
  if (!UUID_PATTERN.test(videoId)) return null;
  const row = await queryOne<VideoTargetingRow>(
    `select v.channel_id, o.type as channel_type, r.age_rating, r.content_labels, p.access_models
     from videos v
     join organizations o on o.id = v.channel_id
     left join video_rights r on r.video_id = v.id
     left join video_pricing p on p.video_id = v.id
     where v.id = $1 and v.status = 'published'`,
    [videoId],
  );
  // Only content actually enrolled in ad-supported access can serve an ad — matches the
  // "ad-supported" access model the upload wizard already lets a creator choose.
  if (!row || !(row.access_models ?? []).includes("ad-supported")) return null;
  const categoryRows = await query<{ category_id: string }>(
    `select category_id from video_categories where video_id = $1`,
    [videoId],
  );
  return {
    channelId: row.channel_id,
    channelType: row.channel_type,
    ageRating: row.age_rating ?? "U",
    contentLabels: row.content_labels ?? [],
    categoryIds: categoryRows.map((r) => r.category_id),
  };
}

interface CampaignCandidateRow {
  id: string;
  cpm_minor: number;
  budget_minor: number;
  spend_minor: number;
  target_countries: string[];
  target_languages: string[];
  target_age_bands: string[];
  target_category_ids: string[];
  target_devices: string[];
  frequency_cap_impressions: number;
  frequency_cap_hours: number;
  excluded_content_labels: string[];
  min_age_rating: string;
  block_user_generated: boolean;
}

export interface AdMatch {
  campaignId: string;
  creativeId: string;
  assetUrl: string;
  clickThroughUrl: string | null;
  durationSeconds: number;
  cpmMinor: number;
}

export interface ServeAdInput {
  videoId?: string | null;
  placement: string;
  viewerAccountId: string | null;
  country: string | null;
  language: string | null;
  device: string | null;
}

/** The real matching + allocation pass. Returns null (no eligible campaign) far more
 * often than not — that's a correct, ordinary outcome (unfilled inventory), not an error. */
export async function findServableAd(input: ServeAdInput): Promise<AdMatch | null> {
  const video = input.videoId ? await loadVideoTargeting(input.videoId) : null;
  if (!video && input.placement !== "sponsored-card") return null;

  const candidates = await query<CampaignCandidateRow>(
    `select c.id, c.cpm_minor, c.budget_minor, c.spend_minor,
       c.target_countries, c.target_languages, c.target_age_bands, c.target_category_ids,
       c.target_devices, c.frequency_cap_impressions, c.frequency_cap_hours,
       c.excluded_content_labels, c.min_age_rating, c.block_user_generated
     from campaigns c
     where c.status = 'active'
       and c.start_date <= current_date and c.end_date >= current_date
       and $1 = any(c.placements)
       and c.spend_minor + ceil(c.cpm_minor / 1000.0) <= c.budget_minor
       and exists (
         select 1 from campaign_creatives cc
         where cc.campaign_id = c.id and cc.status = 'approved' and cc.format = $1 and cc.asset_path is not null
       )`,
    [input.placement],
  );

  const minAgeIndex = video ? AGE_RATING_ORDER.indexOf(video.ageRating) : 0;

  const eligible: CampaignCandidateRow[] = [];
  for (const c of candidates) {
    if (c.target_countries.length && (!input.country || !c.target_countries.includes(input.country))) continue;
    if (c.target_languages.length && (!input.language || !c.target_languages.includes(input.language))) continue;
    if (c.target_devices.length && (!input.device || !c.target_devices.includes(input.device))) continue;
    if (
      video &&
      c.target_category_ids.length &&
      !video.categoryIds.some((id) => c.target_category_ids.includes(id))
    )
      continue;
    if (video && c.excluded_content_labels.some((label) => video.contentLabels.includes(label))) continue;
    if (video && c.block_user_generated && video.channelType === "creator") continue;
    const requiredIndex = AGE_RATING_ORDER.indexOf(c.min_age_rating);
    if (video && minAgeIndex >= 0 && requiredIndex >= 0 && minAgeIndex < requiredIndex) continue;

    if (input.viewerAccountId) {
      const seen = await getFrequencyCount(input.viewerAccountId, c.id);
      if (seen >= c.frequency_cap_impressions) continue;
    }

    eligible.push(c);
  }

  if (eligible.length === 0) return null;

  eligible.sort((a, b) => b.budget_minor - b.spend_minor - (a.budget_minor - a.spend_minor));
  const winner = eligible[0];

  const creative = await queryOne<{
    id: string;
    asset_path: string;
    click_through_url: string | null;
    duration_seconds: number;
  }>(
    `select id, asset_path, click_through_url, duration_seconds
     from campaign_creatives
     where campaign_id = $1 and status = 'approved' and format = $2 and asset_path is not null
     order by created_at limit 1`,
    [winner.id, input.placement],
  );
  if (!creative) return null;

  return {
    campaignId: winner.id,
    creativeId: creative.id,
    assetUrl: getAdCreativePublicUrl(creative.asset_path),
    clickThroughUrl: creative.click_through_url,
    durationSeconds: creative.duration_seconds,
    cpmMinor: winner.cpm_minor,
  };
}

export type RecordImpressionResult =
  | { outcome: "success"; impressionId: string }
  | { outcome: "not_found" }
  | { outcome: "budget_exhausted" };

/** Charges the campaign's budget and writes the real revenue-ledger row in one go — see
 * commissions.ts's getAdRevenueSharePct() for why the split is computed here, once, and
 * never recomputed later. Also increments the viewer's frequency-cap counter (see
 * adFrequency.ts's header on why that happens here and not at serve time). */
export async function recordAdImpression(input: {
  campaignId: string;
  creativeId: string;
  videoId?: string | null;
  placement: string;
  viewerAccountId: string | null;
}): Promise<RecordImpressionResult> {
  if (!UUID_PATTERN.test(input.campaignId) || !UUID_PATTERN.test(input.creativeId)) {
    return { outcome: "not_found" };
  }
  if (input.videoId && !UUID_PATTERN.test(input.videoId)) {
    return { outcome: "not_found" };
  }
  if (input.viewerAccountId && !UUID_PATTERN.test(input.viewerAccountId)) {
    return { outcome: "not_found" };
  }
  let channelId: string | null = null;
  if (input.videoId) {
    const video = await queryOne<{ channel_id: string }>(`select channel_id from videos where id = $1`, [input.videoId]);
    if (!video) return { outcome: "not_found" };
    channelId = video.channel_id;
  }

  // The real 30% ad_revenue rate — read once, outside the row lock below, since it
  // doesn't depend on the campaign row and there's no reason to hold the lock while
  // waiting on it.
  const sharePct = channelId ? await getAdRevenueSharePct() : 0;

  // check-then-act on budget was previously two separate statements outside any
  // transaction (a plain SELECT, then later an UPDATE) — under concurrent requests for
  // the same near-exhausted campaign, both could read the same spend_minor, both pass
  // the budget check, and both insert, overspending the real budget. `select ... for
  // update` inside a transaction serializes concurrent impressions for the same
  // campaign: the second request's SELECT blocks until the first's transaction commits,
  // then sees the already-incremented spend_minor and correctly re-evaluates the check.
  const result = await withTransaction(async (tx) => {
    const campaign = await tx.queryOne<{
      cpm_minor: number;
      budget_minor: number;
      spend_minor: number;
      currency: string;
      frequency_cap_hours: number;
    }>(
      `select cpm_minor, budget_minor, spend_minor, currency, frequency_cap_hours
       from campaigns where id = $1 for update`,
      [input.campaignId],
    );
    if (!campaign) return { outcome: "not_found" as const };

    const costMinor = Math.ceil(campaign.cpm_minor / 1000);
    if (campaign.spend_minor + costMinor > campaign.budget_minor) {
      return { outcome: "budget_exhausted" as const };
    }

    const platformFeeMinor = channelId ? Math.round((costMinor * sharePct) / 100) : costMinor;
    const creatorNetMinor = channelId ? costMinor - platformFeeMinor : 0;

    const row = await tx.queryOne<{ id: string }>(
      `insert into ad_impressions (
         campaign_id, creative_id, video_id, channel_id, viewer_account_id, placement,
         cost_minor, platform_fee_minor, creator_net_minor, currency
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id`,
      [
        input.campaignId,
        input.creativeId,
        input.videoId ?? null,
        channelId,
        input.viewerAccountId,
        input.placement,
        costMinor,
        platformFeeMinor,
        creatorNetMinor,
        campaign.currency,
      ],
    );

    await tx.query(`update campaigns set spend_minor = spend_minor + $2 where id = $1`, [input.campaignId, costMinor]);

    return { outcome: "success" as const, impressionId: row!.id, frequencyCapHours: campaign.frequency_cap_hours };
  });

  if (result.outcome !== "success") return result;

  if (input.viewerAccountId) {
    await incrementFrequency(input.viewerAccountId, input.campaignId, result.frequencyCapHours);
  }

  return { outcome: "success", impressionId: result.impressionId };
}

export type RecordClickResult = { outcome: "success" } | { outcome: "not_found" };

export async function recordAdClick(impressionId: string): Promise<RecordClickResult> {
  if (!UUID_PATTERN.test(impressionId)) return { outcome: "not_found" };
  const impression = await queryOne<{ id: string }>(`select id from ad_impressions where id = $1`, [impressionId]);
  if (!impression) return { outcome: "not_found" };
  await query(`insert into ad_clicks (impression_id) values ($1)`, [impressionId]);
  return { outcome: "success" };
}

export type RecordCompletionResult = { outcome: "success" } | { outcome: "not_found" };

export async function recordAdCompletion(impressionId: string): Promise<RecordCompletionResult> {
  if (!UUID_PATTERN.test(impressionId)) return { outcome: "not_found" };
  const impression = await queryOne<{ id: string }>(`select id from ad_impressions where id = $1`, [impressionId]);
  if (!impression) return { outcome: "not_found" };
  await query(`update ad_impressions set completed_at = now() where id = $1 and completed_at is null`, [impressionId]);
  return { outcome: "success" };
}
