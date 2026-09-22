import pg from "pg";
import { createHash, randomBytes } from "node:crypto";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runTests() {
  console.log("=== Testing Enterprise Product & Partner API (TPI-9 & MON-9) ===");

  const client = await pool.connect();
  try {
    // 1. Get an existing organization
    const orgRes = await client.query("select id, name from organizations limit 1");
    if (orgRes.rows.length === 0) {
      throw new Error("No organization found in database!");
    }
    const org = orgRes.rows[0];
    console.log(`[PASS] Using organization: ${org.name} (${org.id})`);

    // 2. Test API Key Generation
    const rawEntropy = randomBytes(24).toString("hex");
    const rawKey = `nx_live_${rawEntropy}`;
    const keyPrefix = `nx_live_${rawEntropy.slice(0, 8)}...`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const insertKeyRes = await client.query(
      `insert into api_keys (org_id, name, key_prefix, key_hash, scopes, expires_at)
       values ($1, $2, $3, $4, $5, now() + interval '30 days')
       returning *`,
      [org.id, "Automated Test Partner Key", keyPrefix, keyHash, ["read:catalogue", "embed:player"]],
    );
    const apiKey = insertKeyRes.rows[0];
    console.log(`[PASS] Created API key: id=${apiKey.id}, prefix=${apiKey.key_prefix}`);

    // 3. Test API Key Verification Query
    const verifyRes = await client.query(
      `update api_keys
       set last_used_at = now()
       where key_hash = $1 and (expires_at is null or expires_at > now())
       returning *`,
      [keyHash],
    );
    if (verifyRes.rows.length === 0) {
      throw new Error("API key verification query failed!");
    }
    console.log(`[PASS] Verified API key successfully. last_used_at=${verifyRes.rows[0].last_used_at}`);

    // 4. Test Client Review Creation
    const reviewToken = randomBytes(16).toString("hex");
    const reviewInsert = await client.query(
      `insert into client_reviews (
        org_id, video_id, token, title, client_name, client_email, version, expires_at
      ) values ($1, $2, $3, $4, $5, $6, $7, now() + interval '14 days')
      returning *`,
      [
        org.id,
        "vid_nordic_echoes",
        reviewToken,
        "Automated Test Review Title",
        "Test Client Corp",
        "client@example.com",
        1,
      ],
    );
    const review = reviewInsert.rows[0];
    console.log(`[PASS] Created client review: id=${review.id}, token=${review.token}, status=${review.status}`);

    // 5. Test Client Review Retrieval by Token
    const reviewLookup = await client.query(
      `select * from client_reviews where token = $1 and (expires_at is null or expires_at > now())`,
      [reviewToken],
    );
    if (reviewLookup.rows.length === 0) {
      throw new Error("Failed to look up client review by token!");
    }
    console.log(`[PASS] Retrieved client review by token. title="${reviewLookup.rows[0].title}"`);

    // 6. Test Submitting Client Review Decision
    const reviewFeedback = await client.query(
      `update client_reviews
       set status = $1, feedback = $2, updated_at = now()
       where token = $3
       returning *`,
      ["approved", "Looks great, approved for release!", reviewToken],
    );
    if (reviewFeedback.rows[0].status !== "approved") {
      throw new Error("Failed to update client review status to approved!");
    }
    console.log(`[PASS] Client review approved: status=${reviewFeedback.rows[0].status}, feedback="${reviewFeedback.rows[0].feedback}"`);

    // 7. Test Large File Transfer Creation
    const transferRes = await client.query(
      `insert into enterprise_transfers (
        org_id, title, file_name, file_size_bytes, download_url, expires_at
      ) values ($1, $2, $3, $4, $5, now() + interval '14 days')
      returning *`,
      [
        org.id,
        "Automated Test 4K Master",
        "Nexus_Test_Master.mov",
        15 * 1024 * 1024 * 1024, // 15 GB
        "https://storage.myhitch.com/enterprise/test.mov",
      ],
    );
    const transfer = transferRes.rows[0];
    console.log(`[PASS] Created enterprise file transfer: id=${transfer.id}, size=${transfer.file_size_bytes} bytes`);

    // 8. Test File Download Count Increment
    const downloadRes = await client.query(
      `update enterprise_transfers
       set download_count = download_count + 1
       where id = $1
       returning *`,
      [transfer.id],
    );
    if (downloadRes.rows[0].download_count !== 1) {
      throw new Error("Download count increment failed!");
    }
    console.log(`[PASS] Incremented download count: count=${downloadRes.rows[0].download_count}`);

    // 9. Clean up test data
    await client.query("delete from api_keys where id = $1", [apiKey.id]);
    await client.query("delete from client_reviews where id = $1", [review.id]);
    await client.query("delete from enterprise_transfers where id = $1", [transfer.id]);
    console.log("[PASS] Cleaned up all test artifacts.");

    console.log("\n>>> ALL ENTERPRISE PRODUCT & PARTNER API TESTS PASSED SUCCESSFULLY! <<<");
  } finally {
    client.release();
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
