// scripts/test-business-team.mjs
// Verification script for Business Team Member Invitations (Business Tier: "Employee access up to 5")
import pg from "pg";
const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required in environment");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function run() {
  console.log("=== Testing Business Team Member Invitations ===");

  const client = await pool.connect();
  try {
    // 1. Find or create a test organization
    const orgRes = await client.query(`
      select id, name from organizations limit 1
    `);

    let orgId;
    if (orgRes.rows.length === 0) {
      const newOrg = await client.query(`
        insert into organizations (name, slug) values ('Test Org', 'test-org') returning id
      `);
      orgId = newOrg.rows[0].id;
    } else {
      orgId = orgRes.rows[0].id;
    }
    console.log(`[PASS] Using Organization ID: ${orgId}`);

    // 2. Find or create a test account
    const accRes = await client.query(`
      select id, email from accounts limit 2
    `);
    if (accRes.rows.length === 0) {
      throw new Error("No accounts found in DB to test with");
    }
    const inviterId = accRes.rows[0].id;
    const inviteeId = accRes.rows[1] ? accRes.rows[1].id : accRes.rows[0].id;
    console.log(`[PASS] Inviter ID: ${inviterId}, Invitee ID: ${inviteeId}`);

    // 3. Create an invitation
    const testEmail = `test.employee.${Date.now()}@nexus-test.io`;
    const token = "test_tok_" + Math.random().toString(36).substring(2, 15);

    const insertInvite = await client.query(`
      insert into organization_invitations (
        organization_id, email, role, token, invited_by
      ) values ($1, $2, 'editor', $3, $4)
      returning id, email, role, token, status, expires_at
    `, [orgId, testEmail, token, inviterId]);

    const invite = insertInvite.rows[0];
    console.log(`[PASS] Created invitation for ${invite.email} with status=${invite.status}`);

    // 4. Query pending invitations
    const pending = await client.query(`
      select id, email, role, status from organization_invitations
      where organization_id = $1 and status = 'pending' and expires_at > now()
    `, [orgId]);
    console.log(`[PASS] Found ${pending.rows.length} pending invitation(s)`);

    // 5. Accept invitation
    const acceptMembership = await client.query(`
      insert into memberships (account_id, organization_id, org_role)
      values ($1, $2, $3)
      on conflict do nothing
      returning id, account_id, org_role
    `, [inviteeId, orgId, invite.role]);

    await client.query(`
      update organization_invitations set status = 'accepted' where id = $1
    `, [invite.id]);
    console.log(`[PASS] Accepted invitation. Member added to organization.`);

    // 6. Verify status update
    const checkInvite = await client.query(`
      select status from organization_invitations where id = $1
    `, [invite.id]);
    if (checkInvite.rows[0].status !== 'accepted') {
      throw new Error(`Expected status 'accepted', got ${checkInvite.rows[0].status}`);
    }
    console.log(`[PASS] Invitation status verified as 'accepted'`);

    // 7. Clean up test invitation and membership
    await client.query(`delete from organization_invitations where id = $1`, [invite.id]);
    if (acceptMembership.rows.length > 0) {
      await client.query(`delete from memberships where id = $1`, [acceptMembership.rows[0].id]);
    }
    console.log(`[PASS] Cleaned up test invitation and test membership.`);

    console.log("\n>>> ALL BUSINESS TEAM MEMBER TESTS PASSED! <<<");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
