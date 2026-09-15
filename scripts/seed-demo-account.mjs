// Seeds (or resets) the one demo account the login page's default-filled form —
// src/app/auth/login/page.tsx's defaultValues — and the Playwright e2e suite's login()
// helper (e2e/helpers.ts) both sign in as. Needed since local password auth
// (docs/DEVELOPMENT-PLAN.md §9) made login() do a real check: the mock version accepted
// any password, but a real one needs a real account behind those prefilled credentials.
// Idempotent — safe to re-run any time the password needs resetting.
//
// The hash function below is a deliberate copy of src/lib/server/localPassword.ts's
// hashPassword(), not an import of it — that module's own relative imports
// (./db, @/lib/utils) resolve fine under Next's bundler but not under plain Node ESM,
// same reason apply-migrations.mjs keeps its own inline `pg` setup instead of importing
// src/lib/server/db.ts. Keep this in sync if the hashing scheme in localPassword.ts ever
// changes.
//
// Usage: node --env-file=.env.local scripts/seed-demo-account.mjs
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { Client } from "pg";

const scrypt = promisify(scryptCallback);

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

const EMAIL = "mara@marasolace.example";
const PASSWORD = "prototype";
const FULL_NAME = "Mara Solace";
const HANDLE = "marasolace";

// Every role that has a dedicated protected workspace (see requireRole() calls in
// src/app/{admin,studio,business}/layout.tsx) — this is the one account meant to reach
// all of them, matching what it always could before those layouts enforced real roles
// server-side. A normal registered account only gets the role(s) it actually chose at
// signup.
const ROLES = ["viewer", "creator", "business", "advertiser", "admin"];

async function main() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const passwordHash = await hashPassword(PASSWORD);

  const { rows } = await pg.query(
    `insert into accounts (email, full_name, password_hash, handle)
     values ($1, $2, $3, $4)
     on conflict (email) do update set password_hash = excluded.password_hash
     returning id`,
    [EMAIL, FULL_NAME, passwordHash, HANDLE],
  );
  const accountId = rows[0].id;
  console.log(`Demo account ready: ${EMAIL} (${accountId})`);

  for (const role of ROLES) {
    await pg.query(
      `insert into account_roles (account_id, role, verified)
       values ($1, $2, true)
       on conflict (account_id, role) do nothing`,
      [accountId, role],
    );
  }
  console.log(`  roles: ${ROLES.join(", ")}`);

  await pg.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
