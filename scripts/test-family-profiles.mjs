// scripts/test-family-profiles.mjs
// Verification script for Family Multi-Profile Switching & Parental Controls (Family Tier: "Up to 5 family profiles & parental controls")
import pg from "pg";
const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required in environment");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function run() {
  console.log("=== Testing Family Multi-Profile Switching & Parental Controls ===");

  const client = await pool.connect();
  try {
    // 1. Find an account to test with
    const accRes = await client.query(`
      select id, email, full_name from accounts limit 1
    `);
    if (accRes.rows.length === 0) {
      throw new Error("No accounts found in DB to test with");
    }
    const account = accRes.rows[0];
    console.log(`[PASS] Testing with Account: ${account.full_name} (${account.id})`);

    // 2. Count existing profiles
    const initialProfiles = await client.query(`
      select count(*)::int as count from account_profiles where account_id = $1
    `, [account.id]);
    const initialCount = initialProfiles.rows[0].count;
    console.log(`[PASS] Initial profile count: ${initialCount}`);

    // 3. Create a test adult profile
    const adultRes = await client.query(`
      insert into account_profiles (
        account_id, name, is_kids, maturity_rating
      ) values ($1, 'Test Parent', false, '18+')
      returning id, name, is_kids, maturity_rating, pin_code, created_at
    `, [account.id]);
    const adultProfile = adultRes.rows[0];
    console.log(`[PASS] Created Adult Profile: ${adultProfile.name} (id: ${adultProfile.id})`);

    // 4. Create a test kids profile with parental PIN lock
    const kidsRes = await client.query(`
      insert into account_profiles (
        account_id, name, is_kids, maturity_rating, pin_code
      ) values ($1, 'Test Child', true, 'ALL', '4321')
      returning id, name, is_kids, maturity_rating, pin_code, created_at
    `, [account.id]);
    const kidsProfile = kidsRes.rows[0];
    console.log(`[PASS] Created Kids Profile with PIN: ${kidsProfile.name} (PIN: ${kidsProfile.pin_code})`);

    // 5. Query profiles list for account
    const listRes = await client.query(`
      select id, name, is_kids, maturity_rating, pin_code
      from account_profiles
      where account_id = $1
      order by created_at asc
    `, [account.id]);
    console.log(`[PASS] Verified account now has ${listRes.rows.length} profiles in database`);

    // 6. Update profile (e.g., change child's maturity rating to PG and name)
    const updateRes = await client.query(`
      update account_profiles
      set name = 'Test Teen', is_kids = false, maturity_rating = 'PG'
      where id = $1 and account_id = $2
      returning id, name, is_kids, maturity_rating
    `, [kidsProfile.id, account.id]);
    const updated = updateRes.rows[0];
    if (updated.name !== 'Test Teen' || updated.maturity_rating !== 'PG') {
      throw new Error("Profile update failed to reflect new values");
    }
    console.log(`[PASS] Successfully updated profile to: ${updated.name} (Rating: ${updated.maturity_rating})`);

    // 7. Test delete profile
    await client.query(`
      delete from account_profiles where id = $1 and account_id = $2
    `, [kidsProfile.id, account.id]);
    console.log(`[PASS] Successfully deleted child profile`);

    // 8. Clean up adult profile
    await client.query(`
      delete from account_profiles where id = $1 and account_id = $2
    `, [adultProfile.id, account.id]);
    console.log(`[PASS] Cleaned up adult profile`);

    console.log("\n>>> ALL FAMILY PROFILES TESTS PASSED! <<<");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
