import { Client } from "pg";

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();

console.log("Connected to Postgres database.");

let createdOrgId = null;
let createdVideoId = null;
let createdCampaignId = null;
let createdCreativeId = null;
let createdImpressionId = null;

try {
  // 1. Get or create an org / channel
  let orgRes = await pg.query("select id from organizations limit 1");
  let orgId;
  if (orgRes.rows.length > 0) {
    orgId = orgRes.rows[0].id;
  } else {
    const newOrg = await pg.query(
      `insert into organizations (name, slug, type) values ('Test Ad Org', 'test-ad-org-${Date.now()}', 'creator') returning id`
    );
    orgId = newOrg.rows[0].id;
    createdOrgId = orgId;
  }

  // 2. Get or create a video
  let videoRes = await pg.query("select id, channel_id from videos limit 1");
  let videoId, videoChannelId;
  if (videoRes.rows.length > 0) {
    videoId = videoRes.rows[0].id;
    videoChannelId = videoRes.rows[0].channel_id;
  } else {
    const newVid = await pg.query(
      `insert into videos (channel_id, title, slug, duration_seconds, status)
       values ($1, 'Test Video', 'test-video-${Date.now()}', 120, 'published') returning id, channel_id`,
      [orgId]
    );
    videoId = newVid.rows[0].id;
    videoChannelId = newVid.rows[0].channel_id;
    createdVideoId = videoId;
  }

  // 3. Get or create a campaign
  let campaignRes = await pg.query("select id, name, cpm_minor from campaigns limit 1");
  let campaignId;
  if (campaignRes.rows.length > 0) {
    campaignId = campaignRes.rows[0].id;
  } else {
    const newCamp = await pg.query(
      `insert into campaigns (
         advertiser_org_id, name, objective, status, budget_minor, daily_cap_minor, cpm_minor,
         start_date, end_date, target_countries, target_languages, target_age_bands,
         target_interests, target_category_ids, target_devices, placements,
         frequency_cap_impressions, frequency_cap_hours, excluded_content_labels,
         min_age_rating, block_user_generated
       ) values (
         $1, 'Lifecycle Test Campaign', 'awareness', 'active', 50000, 5000, 500,
         current_date, current_date + 30, '{}', '{}', '{}',
         '{}', '{}', '{}', '{"pre-roll"}',
         3, 24, '{}', 'U', false
       ) returning id`,
      [orgId]
    );
    campaignId = newCamp.rows[0].id;
    createdCampaignId = campaignId;
  }

  // 4. Get or create a creative
  let creativeRes = await pg.query("select id from campaign_creatives where campaign_id = $1 limit 1", [campaignId]);
  let creativeId;
  if (creativeRes.rows.length > 0) {
    creativeId = creativeRes.rows[0].id;
  } else {
    const newCreative = await pg.query(
      `insert into campaign_creatives (campaign_id, name, format, duration_seconds, status)
       values ($1, 'Test Creative', 'pre-roll', 15, 'approved') returning id`,
      [campaignId]
    );
    creativeId = newCreative.rows[0].id;
    createdCreativeId = creativeId;
  }

  console.log(`Campaign: ${campaignId}, Creative: ${creativeId}, Video: ${videoId}`);

  // 5. Insert test impression
  const impRes = await pg.query(
    `insert into ad_impressions (
       campaign_id, creative_id, video_id, channel_id, placement, cost_minor, platform_fee_minor, creator_net_minor, currency
     ) values ($1, $2, $3, $4, 'pre-roll', 10, 3, 7, 'GBP')
     returning id, completed_at`,
    [campaignId, creativeId, videoId, videoChannelId]
  );
  createdImpressionId = impRes.rows[0].id;
  console.log(`Created test impression: ${createdImpressionId}, initial completed_at: ${impRes.rows[0].completed_at}`);

  if (impRes.rows[0].completed_at !== null) {
    throw new Error("Expected initial completed_at to be null");
  }

  // 6. Update completed_at (simulating recordAdCompletion)
  await pg.query("update ad_impressions set completed_at = now() where id = $1 and completed_at is null", [createdImpressionId]);

  const verifyRes = await pg.query("select completed_at from ad_impressions where id = $1", [createdImpressionId]);
  console.log(`After recordAdCompletion: completed_at = ${verifyRes.rows[0].completed_at}`);

  if (!verifyRes.rows[0].completed_at) {
    throw new Error("Expected completed_at to be populated with timestamp");
  }

  // 7. Test the metrics query from campaigns.ts
  const metricsRes = await pg.query(
    `select ai.campaign_id,
       count(distinct ai.id) as impressions,
       count(distinct case when ai.completed_at is not null then ai.id end) as completed_views,
       count(ac.id) as clicks,
       c.cpm_minor
     from ad_impressions ai
     join campaigns c on c.id = ai.campaign_id
     left join ad_clicks ac on ac.impression_id = ai.id
     where ai.id = $1
     group by ai.campaign_id, c.cpm_minor`,
    [createdImpressionId]
  );

  console.log("Metrics query result:", metricsRes.rows[0]);
  if (Number(metricsRes.rows[0].completed_views) !== 1) {
    throw new Error(`Expected completed_views to be 1, got ${metricsRes.rows[0].completed_views}`);
  }

  console.log("All ad lifecycle tests passed successfully!");
} finally {
  // Cleanup in reverse dependency order
  if (createdImpressionId) {
    await pg.query("delete from ad_impressions where id = $1", [createdImpressionId]);
    console.log("Cleaned up test impression.");
  }
  if (createdCreativeId) {
    await pg.query("delete from campaign_creatives where id = $1", [createdCreativeId]);
    console.log("Cleaned up test creative.");
  }
  if (createdCampaignId) {
    await pg.query("delete from campaigns where id = $1", [createdCampaignId]);
    console.log("Cleaned up test campaign.");
  }
  if (createdVideoId) {
    await pg.query("delete from videos where id = $1", [createdVideoId]);
    console.log("Cleaned up test video.");
  }
  if (createdOrgId) {
    await pg.query("delete from organizations where id = $1", [createdOrgId]);
    console.log("Cleaned up test organization.");
  }

  await pg.end();
}
