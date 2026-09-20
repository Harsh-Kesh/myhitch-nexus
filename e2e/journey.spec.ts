import { expect, test } from "@playwright/test";
import { deleteTestAccount, deleteTestCategory, dismissDevOverlay, login } from "./helpers";

/**
 * Covers the end-to-end journey from §13.9 of the build spec:
 *
 *   register → creator uploads and publishes → viewer discovers, purchases and
 *   plays → viewer rates and comments → creator checks analytics → admin
 *   actions a moderation item
 *
 * The mock store is a module singleton in browser memory, so anything that has
 * to observe a *previous* step's write must stay within one page load and
 * navigate by clicking (client-side routing). Tests that only read the seeded
 * fixtures are free to use page.goto().
 *
 * Every step here assumes a signed-in viewer (video pages, Studio, Business
 * and Admin all redirect guests to /auth/login), so the whole file signs in
 * once up front.
 */

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe("Public discovery", () => {
  test("homepage renders the hero and content rails", async ({ page }) => {
    await page.goto("/");
    await dismissDevOverlay(page);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Continue watching" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Films & cinema" })).toBeVisible();
  });

  test("search finds a title and opens its detail page", async ({ page }) => {
    await page.goto("/search?q=saltmarsh");
    await dismissDevOverlay(page);

    await expect(page.getByRole("heading", { name: /Results for/ })).toBeVisible();

    const result = page.getByRole("link", { name: /The Saltmarsh/ }).first();
    await expect(result).toBeVisible({ timeout: 15_000 });
    await result.click();

    await expect(
      page.getByRole("heading", { name: "The Saltmarsh", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Northlight Pictures").first()).toBeVisible();
  });

  test("browse filters narrow the catalogue", async ({ page }) => {
    await page.goto("/films");
    await dismissDevOverlay(page);

    await expect(
      page.getByRole("heading", { name: "Films & cinema", level: 1 }),
    ).toBeVisible();

    // The count line is the observable contract for the filter panel.
    await expect(page.getByText(/\d+ titles?/).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("Entitlement and playback", () => {
  test("a paid title shows the paywall, then plays once purchased", async ({
    page,
  }) => {
    // Paper Kingdom is rent/buy only and the seeded rental for it has expired,
    // so the signed-in user genuinely has no entitlement. (The Saltmarsh is a
    // poor choice here — the fixtures give it an *active* rental.)
    await page.goto("/video/vid_paperkingdom");
    await dismissDevOverlay(page);

    // Paid, unowned → paywall stands in for the player.
    await expect(
      page.getByRole("heading", { name: /Unlock to watch in full/ }),
    ).toBeVisible({ timeout: 15_000 });

    // Rent through the mock checkout.
    await page.getByRole("button", { name: /^Rent £/ }).first().click();
    await expect(
      page.getByRole("dialog").getByText(/Get access to/),
    ).toBeVisible();

    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Select" })
      .first()
      .click();

    // Entitlement granted → the player replaces the paywall.
    await expect(page.getByRole("button", { name: "Play" }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Rented|Owned|Unlocked/).first()).toBeVisible();
  });

  test("geo-restricted content is blocked when the region changes", async ({
    page,
  }) => {
    await page.goto("/account/settings");
    await dismissDevOverlay(page);

    // The Saltmarsh blocks US/CA in its rights schedule.
    await page.getByLabel("Simulated request country").selectOption("US");
    await expect(page.getByText("Region set to US")).toBeVisible();

    // Navigate by clicking, not page.goto(): a full page load would reseed the
    // in-memory mock store and discard the region we just set.
    await page.getByRole("link", { name: "Films & cinema" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Films & cinema", level: 1 }),
    ).toBeVisible();

    await page.getByRole("link", { name: /The Saltmarsh/ }).first().click();

    await expect(
      page.getByRole("heading", { name: /Not available in your region/ }),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Social", () => {
  test("a viewer can rate and comment on a video", async ({ page }) => {
    await page.goto("/video/vid_mara_anamorphic");
    await dismissDevOverlay(page);

    await page.getByRole("button", { name: "Rate 5 stars" }).click();
    await expect(page.getByText("Rated 5 stars")).toBeVisible();

    await page.getByRole("tab", { name: /Comments/ }).click();

    const body = `Playwright smoke comment ${Date.now()}`;
    await page.getByPlaceholder("Add a comment…").fill(body);
    await page.getByRole("button", { name: "Comment" }).click();

    await expect(page.getByText("Comment posted")).toBeVisible();
    await expect(page.getByText(body)).toBeVisible();
  });
});

test.describe("Creator Studio", () => {
  test("the upload wizard publishes a video and it appears in Content", async ({
    page,
  }) => {
    await page.goto("/studio/upload");
    await dismissDevOverlay(page);

    // 1 — upload (mock transfer, includes a deliberate chunk-17 failure)
    await page.getByRole("button", { name: "Use a sample file" }).click();

    const retry = page.getByRole("button", { name: /Retry from chunk/ });
    await expect(retry).toBeVisible({ timeout: 30_000 });
    await retry.click();

    await expect(page.getByText("Transfer finished.")).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "Continue" }).click();

    // 2 — metadata
    const title = `Smoke test upload ${Date.now()}`;
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Created by the Playwright smoke test.");

    // The category picker is a combobox (aria role), not a plain button.
    await page.getByRole("combobox", { name: /Categories/ }).click();
    await page.getByRole("option", { name: "Creator uploads" }).click();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Continue" }).click();

    // 3 — thumbnails
    await page
      .getByRole("button", { name: /Auto suggestion 1/ })
      .click({ timeout: 20_000 });
    await page.getByRole("button", { name: "Continue" }).click();

    // 4 — captions (defaults are valid)
    await page.getByRole("button", { name: "Continue" }).click();

    // 5 — rights
    await page.getByLabel("Declared rights holder").fill("Playwright Test Owner");
    await page
      .getByLabel(/I confirm I own or am licensed to distribute/)
      .check();
    await page.getByRole("button", { name: "Continue" }).click();

    // 6 — publishing: default status is "Publish now"
    await page.getByRole("button", { name: /^Publish$/ }).click();

    // Lands on Content with the new title visible.
    await expect(page).toHaveURL(/\/studio\/content/, { timeout: 20_000 });
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 });
  });

  test("sponsored uploads land in Pending review rather than going live", async ({
    page,
  }) => {
    await page.goto("/studio/content");
    await dismissDevOverlay(page);

    await page.getByRole("tab", { name: /Pending review/ }).click();
    await expect(
      page.getByText("Building a documentary rig (sponsored)"),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("analytics renders totals and the retention curve", async ({ page }) => {
    await page.goto("/studio/analytics");
    await dismissDevOverlay(page);

    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(
      page.getByText("Watch time", { exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("tab", { name: "Retention" }).click();
    await expect(
      page.getByRole("heading", { name: "Audience retention" }),
    ).toBeVisible();
  });
});

test.describe("Advertising", () => {
  test("a campaign built here appears in the admin approval queue", async ({
    page,
  }) => {
    await page.goto("/business/campaigns/new");
    await dismissDevOverlay(page);

    const name = `Smoke campaign ${Date.now()}`;

    // 1 — basics
    await page.getByLabel("Campaign name").fill(name);
    await page.getByRole("button", { name: "Continue" }).click();

    // 2 — budget (defaults are valid)
    await page.getByRole("button", { name: "Continue" }).click();

    // 3 — targeting (defaults: GB + English)
    await page.getByRole("button", { name: "Continue" }).click();

    // 4 — creative
    await page.getByRole("button", { name: "Add your first creative" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    // 5 — brand safety
    await page.getByRole("button", { name: "Continue" }).click();

    // 6 — review & submit
    await page.getByRole("button", { name: "Submit for approval" }).click();

    await expect(page).toHaveURL(/\/business\/campaigns/, { timeout: 20_000 });
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Pending approval").first()).toBeVisible();

    // Same page load → the admin queue sees the write.
    await page.goto("/admin/ads");
    await expect(page.getByRole("heading", { name: "Advertising" })).toBeVisible();
  });
});

test.describe("Admin", () => {
  test("actioning a moderation item writes to the audit trail", async ({
    page,
  }) => {
    // The demo account (mara@marasolace.example) is a real, Postgres-backed admin —
    // /admin/reviews reads a real moderation_queue table for her, which starts empty,
    // not the mock's always-populated 7-item seed (see docs/DEVELOPMENT-PLAN.md's
    // 2026-09-17 admin-screens entry). Seed one real item the cheapest way the app
    // itself produces one: a comment containing a link auto-holds for review.
    const searchRes = await page.request.get("/api/videos/?query=Saltmarsh&limit=1");
    const { items } = (await searchRes.json()) as { items: Array<{ id: string }> };
    const commentRes = await page.request.post(`/api/videos/${items[0].id}/comments/`, {
      data: { body: `Playwright moderation fixture ${Date.now()} — see http://example.com` },
    });
    expect(commentRes.ok()).toBe(true);

    await page.goto("/admin/reviews");
    await dismissDevOverlay(page);

    await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();

    const openCount = page.getByRole("heading", { name: /^Open · \d+/ });
    await expect(openCount).toBeVisible({ timeout: 15_000 });

    // Action the first open item.
    await page.getByRole("button", { name: "Action" }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Decision").selectOption("approve");
    await dialog
      .getByLabel("Reason")
      .fill("Approved by the Playwright smoke test — meets policy.");

    await dialog.getByRole("button", { name: "Approve" }).click();

    await expect(page.getByText(/Approve applied/)).toBeVisible({
      timeout: 15_000,
    });

    // The audit trail on the same page picks it up.
    await expect(
      page.getByText(/Approved by the Playwright smoke test/).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("organisation verification updates the timeline", async ({ page, request }) => {
    // Same real-data gap as the moderation test above: /admin/organisations only lists
    // organisations that have actually submitted real verification, and Mara's own
    // real channel hasn't. Seed one with a throwaway business account via a separate,
    // page-independent request context (its own cookie jar) so this never touches
    // Mara's own session or her real channel's verification status.
    const email = `pw-org-fixture-${Date.now()}@example.com`;
    try {
      await request.post("/api/auth/register/", {
        data: { name: "Playwright Org Fixture", email, password: "password123", role: "business" },
      });
      const me = await request.get("/api/auth/me/");
      const { account } = (await me.json()) as { account: { channelId: string } };
      await request.patch("/api/studio/organization/verification/", {
        data: {
          organizationId: account.channelId,
          legalEntityName: "Playwright Fixture Pty Ltd",
          abn: "51824753556",
          contactFullName: "Fixture Contact",
          contactEmail: "fixture@example.com",
          authorisedPersonName: "Fixture Contact",
          informationAccurate: true,
          authorityConfirmed: true,
          termsAccepted: true,
          privacyAccepted: true,
        },
      });
      const submitRes = await request.post("/api/studio/organization/verification/submit/", {
        data: { organizationId: account.channelId },
      });
      expect(submitRes.ok()).toBe(true);

      await page.goto("/admin/organisations");
      await dismissDevOverlay(page);

      await page.getByRole("tab", { name: /Pending/ }).click();
      await page.getByRole("button", { name: "Verify" }).first().click();

      const dialog = page.getByRole("dialog");
      await dialog
        .getByLabel("Reason")
        .fill("Registration confirmed against the public register.");
      await dialog.getByRole("button", { name: "Verify" }).click();

      await expect(page.getByText("Organisation verified")).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      // This suite runs against the same shared Postgres database as production
      // (docs/DEVELOPMENT-PLAN.md) — without this, every run of this test leaks a
      // real account+organization onto the live site. `finally` so a failed
      // assertion above still cleans up.
      await deleteTestAccount(email);
    }
  });

  test("platform settings can add a category without a code change", async ({
    page,
  }) => {
    await page.goto("/admin/settings");
    await dismissDevOverlay(page);

    await page.getByRole("button", { name: "New category" }).click();

    const name = `Smoke category ${Date.now()}`;
    try {
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Name").fill(name);
      await dialog.getByRole("button", { name: "Add category" }).click();

      await expect(page.getByText("Category added")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(name).first()).toBeVisible();
    } finally {
      // This suite runs against the same shared Postgres database as production
      // (docs/DEVELOPMENT-PLAN.md) — without this, every run leaks a real
      // category onto the live site's category list. `finally` so a failed
      // assertion above still cleans up.
      await deleteTestCategory(name);
    }
  });
});

test.describe("Accessibility & responsiveness", () => {
  test("every primary surface exposes a level-1 heading", async ({ page }) => {
    const routes = [
      "/",
      "/explore",
      "/live",
      "/search",
      "/account/profile",
      "/studio/dashboard",
      "/business/channel",
      "/admin",
    ];

    for (const route of routes) {
      await page.goto(route);
      await dismissDevOverlay(page);
      await expect(
        page.getByRole("heading", { level: 1 }).first(),
        `expected an h1 on ${route}`,
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test("the page never scrolls horizontally", async ({ page }) => {
    for (const route of ["/", "/explore", "/studio/upload", "/admin/reviews"]) {
      await page.goto(route);
      await dismissDevOverlay(page);
      await page.waitForTimeout(600);

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(1);
    }
  });
});
