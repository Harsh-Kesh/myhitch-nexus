// One-off cleanup for a throwaway creator account a QA pass registered against
// production to verify the real (Postgres-backed) upload path. Same logic as
// e2e/helpers.ts's deleteTestAccount — delete the organization first so it
// cascades memberships/videos, then the account itself.
//
// Usage: node --env-file=.env.local scripts/cleanup-qa-test-account.mjs [--delete]
import { Client } from "pg";

const DELETE = process.argv.includes("--delete");
const EMAIL = "qa-test-creator-1789893414849@example.com";

async function main() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const { rows } = await pg.query(`select id, email from accounts where email = $1`, [EMAIL]);
  const account = rows[0];
  if (!account) {
    console.log(`No account found for ${EMAIL} — nothing to do.`);
    await pg.end();
    return;
  }
  console.log(`Found account ${account.id} (${account.email})`);

  const { rows: memberships } = await pg.query(
    `select organization_id from memberships where account_id = $1`,
    [account.id],
  );
  for (const { organization_id } of memberships) {
    const { rows: org } = await pg.query(`select name from organizations where id = $1`, [organization_id]);
    console.log(`  owns organization ${organization_id} (${org[0]?.name ?? "unknown"})`);
  }

  if (!DELETE) {
    console.log("\nDry run only — pass --delete to actually remove this account and its organization(s).");
    await pg.end();
    return;
  }

  for (const { organization_id } of memberships) {
    await pg.query(`delete from organizations where id = $1`, [organization_id]);
  }
  await pg.query(`delete from sessions where account_id = $1`, [account.id]);
  await pg.query(`delete from account_roles where account_id = $1`, [account.id]);
  await pg.query(`delete from accounts where id = $1`, [account.id]);
  console.log(`\nDeleted account ${account.id} and ${memberships.length} organization(s).`);

  await pg.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
