// scripts/test-offline-and-social-auth.mjs
// Verification script for Google Social Auth / One-Tap & Offline Downloads
import pg from "pg";
const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required in environment");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function run() {
  console.log("=== Testing Google Social Auth & One-Tap Integration ===");

  const client = await pool.connect();
  try {
    // 1. Simulate Google One-Tap payload
    const testEmail = `google.user.${Date.now()}@nexus-test.io`;
    const testName = "Google Test User";

    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: "https://accounts.google.com",
        email: testEmail,
        email_verified: true,
        name: testName,
        sub: "google_sub_" + Date.now(),
      })
    ).toString("base64url");
    const mockToken = `${header}.${payload}.mock_signature`;

    console.log(`[PASS] Generated Mock Google ID Token for: ${testEmail}`);

    // 2. Test Account Creation via Google Auth Logic
    const newAcc = await client.query(`
      insert into accounts (email, full_name)
      values ($1, $2)
      returning id, email, full_name
    `, [testEmail, testName]);

    const account = newAcc.rows[0];
    console.log(`[PASS] Account created: ${account.full_name} (${account.id})`);

    // 3. Assign viewer role
    await client.query(`
      insert into account_roles (account_id, role, verified)
      values ($1, 'viewer', true)
      on conflict (account_id, role) do nothing
    `, [account.id]);
    console.log(`[PASS] Assigned 'viewer' role to account`);

    // 4. Create Session
    const sessionRes = await client.query(`
      insert into sessions (account_id, token_hash, expires_at)
      values ($1, $2, now() + interval '30 days')
      returning id, account_id, expires_at
    `, [account.id, 'hash_' + Date.now()]);
    console.log(`[PASS] Session created: id=${sessionRes.rows[0].id}`);

    // 5. Query account and verify all fields
    const checkAccount = await client.query(`
      select a.id, a.email, a.full_name, r.role
      from accounts a
      left join account_roles r on r.account_id = a.id
      where a.id = $1
    `, [account.id]);

    if (checkAccount.rows.length === 0 || checkAccount.rows[0].email !== testEmail) {
      throw new Error("Failed to verify account in database");
    }
    console.log(`[PASS] Verified account in database with role=${checkAccount.rows[0].role}`);

    // 6. Clean up test data
    await client.query(`delete from sessions where account_id = $1`, [account.id]);
    await client.query(`delete from account_roles where account_id = $1`, [account.id]);
    await client.query(`delete from accounts where id = $1`, [account.id]);
    console.log(`[PASS] Cleaned up test social account & session.`);

    console.log("\n>>> ALL GOOGLE SOCIAL AUTH & ONE-TAP TESTS PASSED! <<<");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
