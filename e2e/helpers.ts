import { type Page } from "@playwright/test";
import { Client } from "pg";

/**
 * Next's dev indicator can sit over bottom-anchored controls.
 */
export async function dismissDevOverlay(page: Page) {
  await page
    .addStyleTag({ content: "nextjs-portal{display:none!important}" })
    .catch(() => {});
}

/**
 * Signs in as the seeded demo viewer. The login form ships with valid
 * defaults (see src/app/auth/login/page.tsx), so submitting it as-is is
 * enough — most of the app now redirects guests to /auth/login (Studio,
 * Admin, Business, Account and individual video pages), so tests that touch
 * those areas need a real session first.
 */
export async function login(page: Page) {
  await page.goto("/auth/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"));
}

/**
 * Deletes a throwaway account created by a test (and its organization, if it
 * owns one) directly via Postgres — the same shared database this suite's
 * `next start` server runs against (see docs/DEVELOPMENT-PLAN.md), so a test
 * account left behind here is publicly visible on the real site, not just a
 * local artifact. There's no self-service account-deletion API to call
 * instead. Deletes the organization first so it cascades memberships/videos/
 * verification rows before the account itself goes (matching this project's
 * established "delete both, in this order" test-cleanup discipline — see the
 * "orgs don't cascade" note in docs/DEVELOPMENT-PLAN.md for what happens if
 * you only delete the account).
 *
 * Found and fixed 2026-09-19: this test file's own organisation-verification
 * test registered a real throwaway business account on every run with no
 * cleanup at all, leaking a "Playwright Org Fixture" account+organization
 * into production on every single e2e run — 29 of them had accumulated by
 * the time this was caught.
 */
export async function deleteTestAccount(email: string): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `select id from accounts where email = $1`,
      [email],
    );
    const account = rows[0];
    if (!account) return;
    const { rows: memberships } = await client.query<{ organization_id: string }>(
      `select organization_id from memberships where account_id = $1`,
      [account.id],
    );
    for (const { organization_id } of memberships) {
      await client.query(`delete from organizations where id = $1`, [organization_id]);
    }
    await client.query(`delete from sessions where account_id = $1`, [account.id]);
    await client.query(`delete from account_roles where account_id = $1`, [account.id]);
    await client.query(`delete from accounts where id = $1`, [account.id]);
  } finally {
    await client.end();
  }
}

/**
 * Deletes a throwaway category created by a test, same reasoning as
 * deleteTestAccount above — categories live in this suite's shared production
 * database too and there's no delete API to call instead.
 *
 * Found and fixed 2026-09-20: the "platform settings can add a category"
 * test below had the exact same no-cleanup bug deleteTestAccount's own
 * doc comment describes for the org-verification test — 30 "Smoke category"
 * rows had leaked onto the live site's category list before this was caught.
 */
export async function deleteTestCategory(name: string): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `select id from categories where name = $1`,
      [name],
    );
    const category = rows[0];
    if (!category) return;
    await client.query(`delete from video_categories where category_id = $1`, [category.id]);
    await client.query(`delete from categories where id = $1`, [category.id]);
  } finally {
    await client.end();
  }
}
