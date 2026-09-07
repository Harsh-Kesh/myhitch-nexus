// Runs supabase/migrations/*.sql against DATABASE_URL in order, skipping
// ones already applied. Exists because `supabase db push` fails against this
// project's session pooler (aws-0-ap-south-1.pooler.supabase.com) with a
// bogus auth error, even though the same credentials connect fine over plain
// `pg` — a Supabase CLI bug (or at least undiagnosed), not a real credentials
// or network problem. Revisit `supabase link` once that's sorted out, or once
// we're logged in with a personal access token rather than a raw --db-url.
//
// Usage: node --env-file=.env.local scripts/apply-migrations.mjs

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "..", "supabase", "migrations");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set — pass --env-file=.env.local or export it first.");
  }

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query(`
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (
        version text primary key,
        statements text[],
        name text
      );
    `);

    const { rows: applied } = await client.query(
      "select version from supabase_migrations.schema_migrations",
    );
    const appliedVersions = new Set(applied.map((r) => r.version));

    for (const file of files) {
      const version = file.split("_")[0];
      const name = file.slice(version.length + 1, -".sql".length);

      if (appliedVersions.has(version)) {
        console.log(`skip  ${file} (already applied)`);
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`apply ${file}`);

      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)",
          [version, name],
        );
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw new Error(`${file} failed: ${err.message}`);
      }
    }

    console.log("done");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
