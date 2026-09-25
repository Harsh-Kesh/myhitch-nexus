// Server-only. Real advertising campaigns (P6/TPI-6) — first real slice. Mirrors
// videoPublishing.ts's shape: ownership checks, a server-enforced approval gate, real
// storage for the creative asset. See the 20260925000001_ad_serving.sql migration's own
// header for the schema design reasoning.
import "server-only";
import { query, queryOne, withTransaction } from "./db";
import { createAdCreativeUploadUrl, getAdCreativePublicUrl, adCreativeAssetExists, MAX_AD_CREATIVE_UPLOAD_BYTES } from "./storage";
import { probeAdCreative } from "./videoValidation";
import { scanAdCreativeForMalware } from "./malwareScan";
import { recordAudit } from "./moderation";
import { describeAdminTier } from "./rbac";

async function isOrgMember(accountId: string, organizationId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from memberships where account_id = $1 and organization_id = $2`,
    [accountId, organizationId],
  );
  return Boolean(row);
}

export interface CampaignCreativeRow {
  id: string;
  name: string;
  format: string;
  durationSeconds: number;
  assetUrl: string | null;
  clickThroughUrl: string | null;
  status: string;
}

export interface CampaignRow {
  id: string;
  advertiserOrgId: string;
  advertiserName: string;
  name: string;
  objective: string;
  status: string;
  budgetMinor: number;
  dailyCapMinor: number;
  cpmMinor: number;
  currency: string;
  spendMinor: number;
  startDate: string;
  endDate: string;
  targeting: {
    countries: string[];
    languages: string[];
    ageBands: string[];
    interests: string[];
    categoryIds: string[];
    devices: string[];
  };
  placements: string[];
  frequencyCap: { impressions: number; perHours: number };
  brandSafety: { excludedLabels: string[]; minAgeRating: string; blockUserGenerated: boolean };
  creatives: CampaignCreativeRow[];
  metrics: { impressions: number; completedViews: number; clicks: number; ctr: number; conversions: number; cpmMinor: number };
  createdAt: string;
  submittedAt: string | null;
}

interface CampaignDbRow {
  id: string;
  advertiser_org_id: string;
  advertiser_name: string;
  name: string;
  objective: string;
  status: string;
  budget_minor: number;
  daily_cap_minor: number;
  cpm_minor: number;
  currency: string;
  spend_minor: number;
  start_date: string;
  end_date: string;
  target_countries: string[];
  target_languages: string[];
  target_age_bands: string[];
  target_interests: string[];
  target_category_ids: string[];
  target_devices: string[];
  placements: string[];
  frequency_cap_impressions: number;
  frequency_cap_hours: number;
  excluded_content_labels: string[];
  min_age_rating: string;
  block_user_generated: boolean;
  created_at: string;
  submitted_at: string | null;
}

const CAMPAIGN_SELECT = `
  c.id, c.advertiser_org_id, o.name as advertiser_name, c.name, c.objective, c.status,
  c.budget_minor, c.daily_cap_minor, c.cpm_minor, c.currency, c.spend_minor,
  c.start_date, c.end_date, c.target_countries, c.target_languages, c.target_age_bands,
  c.target_interests, c.target_category_ids, c.target_devices, c.placements,
  c.frequency_cap_impressions, c.frequency_cap_hours, c.excluded_content_labels,
  c.min_age_rating, c.block_user_generated, c.created_at, c.submitted_at
`;

async function loadCreatives(campaignId: string): Promise<CampaignCreativeRow[]> {
  const rows = await query<{
    id: string;
    name: string;
    format: string;
    duration_seconds: number;
    asset_path: string | null;
    click_through_url: string | null;
    status: string;
  }>(
    `select id, name, format, duration_seconds, asset_path, click_through_url, status
     from campaign_creatives where campaign_id = $1 order by created_at`,
    [campaignId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    format: row.format,
    durationSeconds: row.duration_seconds,
    assetUrl: row.asset_path ? getAdCreativePublicUrl(row.asset_path) : null,
    clickThroughUrl: row.click_through_url,
    status: row.status,
  }));
}

interface CampaignMetrics {
  impressions: number;
  completedViews: number;
  clicks: number;
  ctr: number;
  conversions: number;
  cpmMinor: number;
}

/** Real impressions/clicks, batched across every campaign in one query rather than one
 * per campaign — completedViews and conversions are honestly 0: this slice records that
 * an ad started playing, not whether it played to completion or led to a conversion, and
 * neither is tracked anywhere yet. cpm is the campaign's own set rate (cost_minor is
 * always ceil(cpm_minor/1000) per impression by construction, so the realised average
 * already equals it exactly — no separate spend/impressions division needed). */
async function loadMetrics(campaignIds: string[]): Promise<Map<string, CampaignMetrics>> {
  const result = new Map<string, CampaignMetrics>();
  if (campaignIds.length === 0) return result;
  const rows = await query<{ campaign_id: string; impressions: string; clicks: string; completed_views: string; cpm_minor: number }>(
    `select ai.campaign_id,
       count(distinct ai.id) as impressions,
       count(distinct case when ai.completed_at is not null then ai.id end) as completed_views,
       count(ac.id) as clicks,
       c.cpm_minor
     from ad_impressions ai
     join campaigns c on c.id = ai.campaign_id
     left join ad_clicks ac on ac.impression_id = ai.id
     where ai.campaign_id = any($1)
     group by ai.campaign_id, c.cpm_minor`,
    [campaignIds],
  );
  for (const row of rows) {
    const impressions = Number(row.impressions);
    const clicks = Number(row.clicks);
    const completedViews = Number(row.completed_views);
    result.set(row.campaign_id, {
      impressions,
      completedViews,
      clicks,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      conversions: 0,
      cpmMinor: row.cpm_minor,
    });
  }
  return result;
}

function mapCampaign(row: CampaignDbRow, creatives: CampaignCreativeRow[], metrics: CampaignMetrics | undefined): CampaignRow {
  return {
    id: row.id,
    advertiserOrgId: row.advertiser_org_id,
    advertiserName: row.advertiser_name,
    name: row.name,
    objective: row.objective,
    status: row.status,
    budgetMinor: row.budget_minor,
    dailyCapMinor: row.daily_cap_minor,
    cpmMinor: row.cpm_minor,
    currency: row.currency,
    spendMinor: row.spend_minor,
    startDate: row.start_date,
    endDate: row.end_date,
    targeting: {
      countries: row.target_countries,
      languages: row.target_languages,
      ageBands: row.target_age_bands,
      interests: row.target_interests,
      categoryIds: row.target_category_ids,
      devices: row.target_devices,
    },
    placements: row.placements,
    frequencyCap: { impressions: row.frequency_cap_impressions, perHours: row.frequency_cap_hours },
    brandSafety: {
      excludedLabels: row.excluded_content_labels,
      minAgeRating: row.min_age_rating,
      blockUserGenerated: row.block_user_generated,
    },
    creatives,
    metrics: metrics ?? { impressions: 0, completedViews: 0, clicks: 0, ctr: 0, conversions: 0, cpmMinor: row.cpm_minor },
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
  };
}

export async function listCampaigns(filters: { advertiserOrgId?: string } = {}): Promise<CampaignRow[]> {
  const rows = await query<CampaignDbRow>(
    `select ${CAMPAIGN_SELECT} from campaigns c join organizations o on o.id = c.advertiser_org_id
     ${filters.advertiserOrgId ? "where c.advertiser_org_id = $1" : ""}
     order by c.created_at desc`,
    filters.advertiserOrgId ? [filters.advertiserOrgId] : [],
  );
  const metricsByCampaign = await loadMetrics(rows.map((row) => row.id));
  const results: CampaignRow[] = [];
  for (const row of rows) {
    results.push(mapCampaign(row, await loadCreatives(row.id), metricsByCampaign.get(row.id)));
  }
  return results;
}

export async function getCampaignById(id: string): Promise<CampaignRow | null> {
  const row = await queryOne<CampaignDbRow>(
    `select ${CAMPAIGN_SELECT} from campaigns c join organizations o on o.id = c.advertiser_org_id where c.id = $1`,
    [id],
  );
  if (!row) return null;
  const metrics = await loadMetrics([id]);
  return mapCampaign(row, await loadCreatives(row.id), metrics.get(id));
}

export interface CreateCampaignInput {
  name: string;
  objective: string;
  budgetMinor: number;
  dailyCapMinor: number;
  cpmMinor: number;
  startDate: string;
  endDate: string;
  targeting: CampaignRow["targeting"];
  placements: string[];
  frequencyCap: { impressions: number; perHours: number };
  brandSafety: CampaignRow["brandSafety"];
}

export type CreateCampaignResult = { outcome: "success"; id: string } | { outcome: "not_org_member" };

/** Creates a real campaign in 'pending' status — mirrors publishVideo()'s "everything
 * starts unpublished/unapproved until a real gate lets it through" shape. Deliberately
 * does NOT push into moderation_queue: actionModerationItem() has no real 'campaign'
 * branch (kind='campaign' hits its explicit "unsupported" guard, per the scoped-admin-
 * roles work) and /admin/ads is the real, dedicated approval surface for this — a
 * moderation_queue row nothing can actually action would just be a permanently-stuck
 * phantom, not real integration. */
export async function createCampaign(
  accountId: string,
  advertiserOrgId: string,
  input: CreateCampaignInput,
): Promise<CreateCampaignResult> {
  if (!(await isOrgMember(accountId, advertiserOrgId))) {
    return { outcome: "not_org_member" };
  }
  const row = await queryOne<{ id: string }>(
    `insert into campaigns (
       advertiser_org_id, name, objective, status, budget_minor, daily_cap_minor, cpm_minor,
       start_date, end_date, target_countries, target_languages, target_age_bands,
       target_interests, target_category_ids, target_devices, placements,
       frequency_cap_impressions, frequency_cap_hours, excluded_content_labels,
       min_age_rating, block_user_generated, submitted_at
     ) values ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now())
     returning id`,
    [
      advertiserOrgId,
      input.name.trim().slice(0, 200),
      input.objective,
      input.budgetMinor,
      input.dailyCapMinor,
      input.cpmMinor,
      input.startDate,
      input.endDate,
      input.targeting.countries,
      input.targeting.languages,
      input.targeting.ageBands,
      input.targeting.interests,
      input.targeting.categoryIds,
      input.targeting.devices,
      input.placements,
      input.frequencyCap.impressions,
      input.frequencyCap.perHours,
      input.brandSafety.excludedLabels,
      input.brandSafety.minAgeRating,
      input.brandSafety.blockUserGenerated,
    ],
  );
  return { outcome: "success", id: row!.id };
}

export type CreateCreativeUploadResult =
  | { outcome: "success"; creativeId: string; path: string; signedUrl: string; token: string; maxBytes: number }
  | { outcome: "not_org_member" }
  | { outcome: "not_found" };

/** Two-step upload, same shape as the video wizard: create the creative row, get a real
 * signed upload URL for its asset, then the caller PUTs the file directly to storage. */
export async function createCreativeUploadUrl(
  accountId: string,
  campaignId: string,
  input: { name: string; format: string; durationSeconds: number; clickThroughUrl: string | null; fileName: string; fileSizeBytes: number },
): Promise<CreateCreativeUploadResult> {
  const campaign = await queryOne<{ advertiser_org_id: string }>(
    `select advertiser_org_id from campaigns where id = $1`,
    [campaignId],
  );
  if (!campaign) return { outcome: "not_found" };
  if (!(await isOrgMember(accountId, campaign.advertiser_org_id))) {
    return { outcome: "not_org_member" };
  }

  const row = await queryOne<{ id: string }>(
    `insert into campaign_creatives (campaign_id, name, format, duration_seconds, click_through_url)
     values ($1, $2, $3, $4, $5) returning id`,
    [campaignId, input.name.trim().slice(0, 120), input.format, input.durationSeconds, input.clickThroughUrl],
  );
  const creativeId = row!.id;

  const { path, signedUrl, token } = await createAdCreativeUploadUrl(campaignId, input.fileName, input.fileSizeBytes);
  await query(`update campaign_creatives set asset_path = $2 where id = $1`, [creativeId, path]);

  return { outcome: "success", creativeId, path, signedUrl, token, maxBytes: MAX_AD_CREATIVE_UPLOAD_BYTES };
}

export type SubmitCampaignResult =
  | { outcome: "success"; status: "active" | "rejected"; reason: string }
  | { outcome: "not_found" }
  | { outcome: "not_org_member" }
  | { outcome: "invalid_state" };

/** Real automated approval — client decision, 2026-09-25: no platform staff involvement
 * in ordinary product flows, ad campaigns included. This replaces "wait for a moderator to
 * click approve" (decideCampaign() below) with the same technical checks a human reviewer
 * had to go on anyway: does every creative have a real, uploaded, valid, malware-free
 * video file (probeAdCreative()/scanAdCreativeForMalware(), the same real ffprobe +
 * ClamAV checks a regular video upload already goes through — extended to ad creatives
 * for this). decideCampaign()/`/admin/ads` stay in place as a *reactive* override — a
 * moderator/super-admin can still suspend or reject an already-live campaign (e.g. a
 * legal complaint), which is a helpdesk-style intervention, not a required gate before a
 * campaign can ever run.
 *
 * Disclosed limitation, same honest gap the rest of this platform's moderation already
 * has (docs/DEVELOPMENT-PLAN.md's automated-moderation-direction entry): there is no
 * semantic/brand-safety content classifier without a paid vendor. This automates what's
 * technically verifiable — the file is real, plays, and scans clean — not "is this ad
 * appropriate." */
export async function autoActivateCampaign(accountId: string, campaignId: string): Promise<SubmitCampaignResult> {
  const campaign = await queryOne<{ advertiser_org_id: string; status: string }>(
    `select advertiser_org_id, status from campaigns where id = $1`,
    [campaignId],
  );
  if (!campaign) return { outcome: "not_found" };
  if (!(await isOrgMember(accountId, campaign.advertiser_org_id))) {
    return { outcome: "not_org_member" };
  }
  if (campaign.status !== "pending") {
    return { outcome: "invalid_state" };
  }

  const creatives = await query<{ id: string; asset_path: string | null }>(
    `select id, asset_path from campaign_creatives where campaign_id = $1`,
    [campaignId],
  );

  const approvedIds: string[] = [];
  let firstFailureReason: string | null = null;
  for (const creative of creatives) {
    if (!creative.asset_path || !(await adCreativeAssetExists(creative.asset_path))) {
      firstFailureReason ??= "a creative has no real uploaded file";
      continue;
    }
    const probe = await probeAdCreative(creative.asset_path);
    if (!probe.ok) {
      firstFailureReason ??= probe.reason;
      continue;
    }
    const scan = await scanAdCreativeForMalware(creative.asset_path);
    if (scan.status === "infected") {
      firstFailureReason ??= `a creative failed a malware scan (${scan.signature})`;
      continue;
    }
    approvedIds.push(creative.id);
  }

  const system = { actorAccountId: null, actorName: "System (automated approval)", actorRole: "system" } as const;

  if (approvedIds.length === 0) {
    const reason = `Automatically rejected — no creative passed automated validation${firstFailureReason ? `: ${firstFailureReason}.` : "."}`;
    await withTransaction(async (tx) => {
      await tx.query(
        `update campaigns set status = 'rejected', decided_at = now(), decided_by = null, decision_reason = $2 where id = $1`,
        [campaignId, reason],
      );
      await tx.query(`update campaign_creatives set status = 'rejected' where campaign_id = $1`, [campaignId]);
    });
    await recordAudit({ ...system, action: "campaign.auto_rejected", targetType: "campaign", targetId: campaignId, reason, severity: "warning" });
    return { outcome: "success", status: "rejected", reason };
  }

  const reason =
    "Automatically approved — every listed creative passed automated technical validation (real playable video, malware scan clean). No human review.";
  await withTransaction(async (tx) => {
    await tx.query(
      `update campaigns set status = 'active', decided_at = now(), decided_by = null, decision_reason = $2 where id = $1`,
      [campaignId, reason],
    );
    await tx.query(`update campaign_creatives set status = 'approved' where campaign_id = $1 and id = any($2)`, [
      campaignId,
      approvedIds,
    ]);
    await tx.query(`update campaign_creatives set status = 'rejected' where campaign_id = $1 and not (id = any($2))`, [
      campaignId,
      approvedIds,
    ]);
  });
  await recordAudit({ ...system, action: "campaign.auto_approved", targetType: "campaign", targetId: campaignId, reason, severity: "info" });
  return { outcome: "success", status: "active", reason };
}

export type CampaignDecisionResult =
  | { outcome: "success" }
  | { outcome: "not_found" }
  | { outcome: "no_approved_creatives" };

/** The real approval gate (FR-6.8.6: "cannot deliver without administrative approval") —
 * closes the real gap found in research: the mock UI only ever *warned* about a
 * creative-less campaign, nothing actually blocked approving one. Approving also approves
 * every pending creative in one action (a real simplification vs. a separate per-creative
 * review screen, not a shortcut around the approval requirement itself — every creative
 * still needs a real uploaded asset to exist, checked below).
 *
 * Takes `status` (not a separate "approve"/"reject" enum) to match /admin/ads's one
 * existing UI action exactly: it already sends `status: 'active'` to approve and
 * `status: 'rejected'` both to reject a pending campaign and to suspend an active one —
 * this function accepts either target status precisely so the route can dispatch on the
 * one field the UI already sends, no UI change required. */
export async function decideCampaign(
  admin: { id: string; name: string; roles: string[] },
  campaignId: string,
  status: "active" | "rejected",
  reason: string,
): Promise<CampaignDecisionResult> {
  const campaign = await queryOne<{ id: string; name: string }>(`select id, name from campaigns where id = $1`, [
    campaignId,
  ]);
  if (!campaign) return { outcome: "not_found" };

  if (status === "active") {
    const creatives = await query<{ id: string; asset_path: string | null }>(
      `select id, asset_path from campaign_creatives where campaign_id = $1`,
      [campaignId],
    );
    const withRealAsset: string[] = [];
    for (const creative of creatives) {
      if (creative.asset_path && (await adCreativeAssetExists(creative.asset_path))) {
        withRealAsset.push(creative.id);
      }
    }
    if (withRealAsset.length === 0) {
      return { outcome: "no_approved_creatives" };
    }
    await withTransaction(async (tx) => {
      await tx.query(`update campaigns set status = 'active', decided_at = now(), decided_by = $2, decision_reason = $3 where id = $1`, [
        campaignId,
        admin.id,
        reason,
      ]);
      await tx.query(`update campaign_creatives set status = 'approved' where campaign_id = $1 and id = any($2)`, [
        campaignId,
        withRealAsset,
      ]);
      await tx.query(`update campaign_creatives set status = 'rejected' where campaign_id = $1 and not (id = any($2))`, [
        campaignId,
        withRealAsset,
      ]);
    });
  } else {
    await query(`update campaigns set status = 'rejected', decided_at = now(), decided_by = $2, decision_reason = $3 where id = $1`, [
      campaignId,
      admin.id,
      reason,
    ]);
  }

  await recordAudit({
    actorAccountId: admin.id,
    actorName: admin.name,
    actorRole: describeAdminTier(admin.roles),
    action: `campaign.${status}`,
    targetType: "campaign",
    targetId: campaignId,
    reason: reason || `Campaign "${campaign.name}" ${status === "active" ? "approved" : "rejected"}.`,
    severity: status === "active" ? "info" : "warning",
  });

  return { outcome: "success" };
}

export type CampaignPauseResult = { outcome: "success" } | { outcome: "not_found" } | { outcome: "not_org_member" } | { outcome: "invalid" };

/** The owning advertiser's own pause/resume — separate from decideCampaign() (an admin
 * action) per FR-6.8.6: "the owning advertiser may pause/resume." Can only toggle between
 * active/paused — can't self-approve out of pending, can't un-reject. */
export async function setCampaignPauseState(
  actor: { id: string; name: string },
  campaignId: string,
  status: "active" | "paused",
  reason: string,
): Promise<CampaignPauseResult> {
  const campaign = await queryOne<{ advertiser_org_id: string; status: string; name: string }>(
    `select advertiser_org_id, status, name from campaigns where id = $1`,
    [campaignId],
  );
  if (!campaign) return { outcome: "not_found" };
  if (!(await isOrgMember(actor.id, campaign.advertiser_org_id))) {
    return { outcome: "not_org_member" };
  }
  if (campaign.status !== "active" && campaign.status !== "paused") {
    return { outcome: "invalid" };
  }

  await query(`update campaigns set status = $2 where id = $1`, [campaignId, status]);
  await recordAudit({
    actorAccountId: actor.id,
    actorName: actor.name,
    actorRole: "advertiser",
    action: `campaign.${status}`,
    targetType: "campaign",
    targetId: campaignId,
    reason: reason || `Campaign "${campaign.name}" ${status === "paused" ? "paused" : "resumed"} by the advertiser.`,
    severity: "info",
  });
  return { outcome: "success" };
}

export interface CampaignSeriesPoint {
  date: string;
  impressions: number;
  completedViews: number;
  clicks: number;
  conversions: number;
  spendMinor: number;
}

/** Real daily delivery series for the campaign-detail chart — zero-filled via
 * generate_series, this project's established idiom (getModerationTrend(),
 * getPlatformRevenueTrend()) for a per-day time series. completedViews/conversions are
 * honestly 0 throughout, same as loadMetrics() above: neither is tracked yet. */
export async function getCampaignSeries(campaignId: string, days = 28): Promise<CampaignSeriesPoint[]> {
  const rows = await query<{ date: string; impressions: string; completed_views: string; clicks: string; spend_minor: string }>(
    `select
       d::date::text as date,
       coalesce(i.impressions, 0) as impressions,
       coalesce(i.completed_views, 0) as completed_views,
       coalesce(i.clicks, 0) as clicks,
       coalesce(i.spend_minor, 0) as spend_minor
     from generate_series(current_date - ($2::int - 1) * interval '1 day', current_date, interval '1 day') d
     left join (
       select date_trunc('day', ai.created_at)::date as day,
         count(distinct ai.id) as impressions,
         count(distinct case when ai.completed_at is not null then ai.id end) as completed_views,
         count(ac.id) as clicks,
         sum(ai.cost_minor) as spend_minor
       from ad_impressions ai
       left join ad_clicks ac on ac.impression_id = ai.id
       where ai.campaign_id = $1
         and ai.created_at >= current_date - ($2::int - 1) * interval '1 day'
       group by 1
     ) i on i.day = d::date
     order by d`,
    [campaignId, days],
  );
  return rows.map((row) => ({
    date: row.date,
    impressions: Number(row.impressions),
    completedViews: Number(row.completed_views),
    clicks: Number(row.clicks),
    conversions: 0,
    spendMinor: Number(row.spend_minor),
  }));
}
