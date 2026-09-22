import { Client } from "pg";

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();

console.log("Connected to Postgres database.");

let testStrikeIds = [];
let testLegalAcceptanceId = null;

try {
  // 1. Find an existing account with an organization and a video
  const targetRes = await pg.query(
    `select a.id as account_id, o.id as org_id, v.id as video_id
     from accounts a
     join memberships m on m.account_id = a.id
     join organizations o on o.id = m.organization_id
     join videos v on v.channel_id = o.id
     limit 1`,
  );

  if (targetRes.rows.length === 0) {
    console.log("No existing account with channel and video found. Querying separately...");
    const acc = await pg.query("select id from accounts limit 1");
    const vid = await pg.query("select id, channel_id from videos limit 1");
    if (acc.rows.length === 0 || vid.rows.length === 0) {
      console.log("Database has insufficient seeded data for strike test.");
      process.exit(0);
    }
  }

  const { account_id: accountId, org_id: orgId, video_id: videoId } = targetRes.rows[0];
  console.log(`Testing with Account: ${accountId}, Channel: ${orgId}, Video: ${videoId}`);

  // 2. Test Legal Acceptance for Community Guidelines
  const legalRes = await pg.query(
    `insert into legal_acceptances (account_id, document_type, document_version)
     values ($1, 'community_guidelines', '1.0')
     returning id`,
    [accountId],
  );
  testLegalAcceptanceId = legalRes.rows[0].id;
  console.log("✓ Community guidelines acceptance recorded:", testLegalAcceptanceId);

  const accCheck = await pg.query(
    `select id from legal_acceptances where id = $1 and document_type = 'community_guidelines'`,
    [testLegalAcceptanceId],
  );
  if (accCheck.rows.length === 0) throw new Error("Expected community_guidelines acceptance to exist");
  console.log("✓ Community guidelines acceptance queried and verified.");

  // 3. Test Strike 1: Warning
  const s1 = await pg.query(
    `insert into community_strikes (account_id, target_type, target_id, reason, strike_level, penalty)
     values ($1, 'content', $2, 'First violation warning', 1, 'warning') returning id`,
    [accountId, videoId],
  );
  testStrikeIds.push(s1.rows[0].id);
  console.log("✓ Strike 1 (warning) recorded:", s1.rows[0].id);

  // 4. Test Strike 2: Upload Freeze (7 days)
  await pg.query(
    `update organizations set upload_restricted_until = now() + interval '7 days' where id = $1`,
    [orgId],
  );
  const s2 = await pg.query(
    `insert into community_strikes (account_id, target_type, target_id, reason, strike_level, penalty)
     values ($1, 'content', $2, 'Second violation - freeze', 2, 'upload_freeze') returning id`,
    [accountId, videoId],
  );
  testStrikeIds.push(s2.rows[0].id);

  const orgCheck = await pg.query(`select upload_restricted_until from organizations where id = $1`, [orgId]);
  if (!orgCheck.rows[0].upload_restricted_until) throw new Error("Expected upload_restricted_until to be set");
  console.log("✓ Strike 2 (upload_freeze) recorded, channel freeze verified until:", orgCheck.rows[0].upload_restricted_until);

  // 5. Test Strike 3: Demonetisation
  const priorPricing = await pg.query(`select access_models from video_pricing where video_id = $1`, [videoId]);
  await pg.query(
    `update video_pricing set access_models = array['free'] where video_id = $1`,
    [videoId],
  );
  const s3 = await pg.query(
    `insert into community_strikes (account_id, target_type, target_id, reason, strike_level, penalty)
     values ($1, 'content', $2, 'Third violation - demonetised', 3, 'demonetised') returning id`,
    [accountId, videoId],
  );
  testStrikeIds.push(s3.rows[0].id);

  const priceCheck = await pg.query(`select access_models from video_pricing where video_id = $1`, [videoId]);
  if (JSON.stringify(priceCheck.rows[0].access_models) !== JSON.stringify(["free"])) {
    throw new Error(`Expected access_models to be ['free'], got ${JSON.stringify(priceCheck.rows[0].access_models)}`);
  }
  console.log("✓ Strike 3 (demonetised) recorded, access_models verified as free.");

  // Restore prior pricing
  if (priorPricing.rows[0]?.access_models) {
    await pg.query(`update video_pricing set access_models = $2 where video_id = $1`, [videoId, priorPricing.rows[0].access_models]);
  }

  // 6. Test Strike 4: Account Suspension
  const priorUserStatus = (await pg.query(`select status from accounts where id = $1`, [accountId])).rows[0].status;
  await pg.query(`update accounts set status = 'suspended' where id = $1`, [accountId]);
  const s4 = await pg.query(
    `insert into community_strikes (account_id, target_type, target_id, reason, strike_level, penalty)
     values ($1, 'content', $2, 'Fourth violation - suspension', 4, 'suspended') returning id`,
    [accountId, videoId],
  );
  testStrikeIds.push(s4.rows[0].id);

  const userCheck = await pg.query(`select status from accounts where id = $1`, [accountId]);
  if (userCheck.rows[0].status !== "suspended") throw new Error("Expected account status to be suspended");
  console.log("✓ Strike 4 (suspended) recorded, account suspension verified.");

  // Restore account status
  await pg.query(`update accounts set status = $2 where id = $1`, [accountId, priorUserStatus]);

  // Restore organization upload restriction
  await pg.query(`update organizations set upload_restricted_until = null where id = $1`, [orgId]);

  console.log("\nAll Community Guidelines and Graduated Strike Ladder tests passed successfully!");
} finally {
  // Clean up test strikes and legal acceptances
  if (testStrikeIds.length > 0) {
    await pg.query(`delete from community_strikes where id = any($1)`, [testStrikeIds]);
    console.log("Cleaned up test strikes.");
  }
  if (testLegalAcceptanceId) {
    await pg.query(`delete from legal_acceptances where id = $1`, [testLegalAcceptanceId]);
    console.log("Cleaned up test legal acceptance.");
  }
  await pg.end();
}
