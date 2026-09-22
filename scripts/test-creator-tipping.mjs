import assert from "node:assert/strict";
import { Client } from "pg";

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();

async function run() {
  console.log("==================================================");
  console.log("Testing Creator Tipping & Patronage Database & Queries");
  console.log("==================================================");

  const testChannelId = "ch_test_" + Date.now();

  // 1. Insert a one-time tip
  console.log("1. Recording one-time tip...");
  const tip1Res = await pg.query(
    `insert into creator_tips (
      channel_id, supporter_name, supporter_email,
      amount_cents, currency, message, is_patron,
      platform_fee_cents, creator_amount_cents, status
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed')
    returning *`,
    [testChannelId, "Alice Walker", "alice@example.com", 2500, "aud", "Loved your latest film!", false, 250, 2250]
  );
  const tip1 = tip1Res.rows[0];
  assert.equal(tip1.status, "completed");
  assert.equal(tip1.creator_amount_cents, 2250);
  assert.equal(tip1.platform_fee_cents, 250);

  // 2. Insert a recurring monthly patron
  console.log("2. Recording monthly patron contribution...");
  const tip2Res = await pg.query(
    `insert into creator_tips (
      channel_id, supporter_name, supporter_email,
      amount_cents, currency, message, is_patron,
      platform_fee_cents, creator_amount_cents, status
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed')
    returning *`,
    [testChannelId, "Bob Patron", "bob@example.com", 1500, "aud", "Proud monthly patron!", true, 150, 1350]
  );
  const tip2 = tip2Res.rows[0];
  assert.equal(tip2.is_patron, true);

  // 3. Query list of channel tips
  console.log("3. Querying list of channel tips...");
  const listRes = await pg.query(
    `select * from creator_tips where channel_id = $1 and status = 'completed' order by created_at desc`,
    [testChannelId]
  );
  assert.equal(listRes.rows.length, 2);

  // 4. Query creator tipping summary
  console.log("4. Querying creator tipping summary totals...");
  const summaryRes = await pg.query(
    `select
       count(*)::int as total_count,
       coalesce(sum(amount_cents), 0)::int as total_amount,
       count(case when is_patron = true then 1 end)::int as patrons_count
     from creator_tips
     where channel_id = $1 and status = 'completed'`,
    [testChannelId]
  );
  const summary = summaryRes.rows[0];
  console.log("Summary:", summary);
  assert.equal(summary.total_count, 2);
  assert.equal(summary.total_amount, 4000);
  assert.equal(summary.patrons_count, 1);

  // Cleanup
  await pg.query(`delete from creator_tips where channel_id = $1`, [testChannelId]);
  await pg.end();
  console.log("\nAll Creator Tipping & Patronage tests passed successfully!");
}

run().catch(async (err) => {
  console.error("Test failed:", err);
  await pg.end();
  process.exit(1);
});
