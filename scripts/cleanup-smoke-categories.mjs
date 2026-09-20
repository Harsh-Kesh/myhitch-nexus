// One-off cleanup for the "Smoke category <timestamp>" rows that
// e2e/journey.spec.ts's "platform settings can add a category without a code
// change" test leaks into the shared production Postgres database on every run
// (unlike its sibling tests, it has no `finally` cleanup — see that test for
// context). Safe to re-run; matches only rows this exact test could have created.
//
// Usage: node --env-file=.env.local scripts/cleanup-smoke-categories.mjs [--delete]
// Without --delete, only lists what would be removed.
import { Client } from "pg";

const DELETE = process.argv.includes("--delete");

async function main() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const { rows } = await pg.query(
    `select id, slug, name, created_at from categories where name like 'Smoke category %' order by created_at`,
  );

  console.log(`Found ${rows.length} smoke-test category row(s):`);
  for (const row of rows) {
    console.log(`  ${row.id}  ${row.name}  (created ${row.created_at.toISOString()})`);
  }

  if (!DELETE) {
    console.log("\nDry run only — pass --delete to actually remove these rows.");
    await pg.end();
    return;
  }

  if (rows.length === 0) {
    await pg.end();
    return;
  }

  const ids = rows.map((r) => r.id);
  await pg.query(`delete from video_categories where category_id = any($1::uuid[])`, [ids]);
  const result = await pg.query(`delete from categories where id = any($1::uuid[])`, [ids]);
  console.log(`\nDeleted ${result.rowCount} category row(s).`);

  await pg.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
