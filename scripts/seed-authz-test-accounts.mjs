// Seeds (or resets) a fixed set of single-role test accounts for the authorization
// matrix suite (e2e/authorization.spec.ts) — deliberately NOT the demo account ("Mara"),
// which holds every role and so can never prove a deny case. Two creator accounts exist
// specifically so the suite can assert account A can't touch account B's channel/video,
// not just "some creator can/can't."
//
// Idempotent — safe to re-run any time. Mirrors seed-demo-account.mjs's own pattern
// (copied hashPassword(), direct SQL rather than importing "server-only" modules under
// plain Node ESM) and channelProvisioning.ts's real provisioning shape (an organizations
// row + an owner membership), since accounts here are written directly rather than
// through POST /api/auth/register — that route now rejects "admin" outright (see the
// 2026-09-18 security-fix entry in DEVELOPMENT-PLAN.md), and never provisions a channel
// with a chosen predictable id anyway.
//
// Usage: node --env-file=.env.local scripts/seed-authz-test-accounts.mjs
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { Client } from "pg";

const scrypt = promisify(scryptCallback);

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

const PASSWORD = "AuthzTest123!";

const GRADIENT_PAIRS = [
  ["#3B2F6B", "#0B1020"],
  ["#1F3B4D", "#0A1420"],
];
function pickGradient(seed) {
  const index = Math.abs([...seed].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % GRADIENT_PAIRS.length;
  return GRADIENT_PAIRS[index];
}

const ACCOUNTS = [
  { key: "viewer", email: "authz.viewer@nexus.test", name: "Authz Viewer", roles: ["viewer"], org: null },
  { key: "creator1", email: "authz.creator1@nexus.test", name: "Authz Creator One", roles: ["creator"], org: "creator" },
  { key: "creator2", email: "authz.creator2@nexus.test", name: "Authz Creator Two", roles: ["creator"], org: "creator" },
  { key: "business", email: "authz.business@nexus.test", name: "Authz Business", roles: ["business"], org: "business" },
  { key: "admin", email: "authz.admin@nexus.test", name: "Authz Admin", roles: ["admin"], org: null },
];

async function main() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const passwordHash = await hashPassword(PASSWORD);
  const result = {};

  for (const spec of ACCOUNTS) {
    const { rows } = await pg.query(
      `insert into accounts (email, full_name, password_hash, handle)
       values ($1, $2, $3, $4)
       on conflict (email) do update set password_hash = excluded.password_hash
       returning id`,
      [spec.email, spec.name, passwordHash, spec.key.replace(/[^a-z0-9]/gi, "").toLowerCase() + "authz"],
    );
    const accountId = rows[0].id;

    for (const role of spec.roles) {
      await pg.query(
        `insert into account_roles (account_id, role, verified)
         values ($1, $2, true)
         on conflict (account_id, role) do nothing`,
        [accountId, role],
      );
    }

    let channelId = null;
    if (spec.org) {
      const existing = await pg.query(
        `select organization_id from memberships where account_id = $1 limit 1`,
        [accountId],
      );
      if (existing.rows.length > 0) {
        channelId = existing.rows[0].organization_id;
      } else {
        const orgRows = await pg.query(
          `insert into organizations
             (name, type, country, business_email, banner_gradient, avatar_gradient, joined_at)
           values ($1, $2, $3, $4, $5, $6, now())
           returning id`,
          [spec.name, spec.org, "GB", spec.email, pickGradient(`${accountId}:banner`), pickGradient(accountId)],
        );
        channelId = orgRows.rows[0].id;
        await pg.query(
          `insert into memberships (account_id, organization_id, org_role) values ($1, $2, 'owner')`,
          [accountId, channelId],
        );
      }
    }

    result[spec.key] = { accountId, channelId, email: spec.email };
    console.log(`${spec.key}: ${spec.email} (${accountId})${channelId ? ` channel=${channelId}` : ""}`);
  }

  await pg.end();
  return result;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
