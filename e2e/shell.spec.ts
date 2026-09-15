import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

/**
 * App-shell behaviour: navigation, first-load splash, and the states shown
 * when things go wrong (offline, unknown route).
 */

/**
 * The site nav is a bar on desktop and a slide-down panel behind a hamburger
 * on mobile. Both carry the same links, so tests ask for "the nav" and let
 * this resolve which one is actually on screen.
 *
 * Right after navigation the boot splash can still be up, during which
 * neither element is visible yet — wait for one of them rather than taking a
 * single isVisible() snapshot, or a fresh page load reads as "mobile" and the
 * (never-visible-on-desktop) toggle button hangs until the test times out.
 */
async function siteNav(page: Page) {
  const desktop = page.getByRole("navigation", { name: "Primary" });
  const toggle = page.getByRole("button", { name: "Open navigation" });

  await expect(desktop.or(toggle)).toBeVisible();
  if (await desktop.isVisible()) return desktop;

  await toggle.click();
  const mobile = page.getByRole("navigation", { name: "Mobile" });
  await expect(mobile).toBeVisible();
  return mobile;
}

test.describe("Navigation", () => {
  test("Home is the first nav item and marks itself current", async ({ page }) => {
    await page.goto("/");

    const home = (await siteNav(page)).getByRole("link", { name: "Home" });
    await expect(home).toBeVisible();
    await expect(home).toHaveAttribute("aria-current", "page");

    // Prefix matching would light Home on every route — it must not.
    await page.goto("/films/");
    const homeElsewhere = (await siteNav(page)).getByRole("link", {
      name: "Home",
    });
    await expect(homeElsewhere).not.toHaveAttribute("aria-current", "page");
  });

  test("Home returns to the homepage from anywhere", async ({ page }) => {
    await page.goto("/films/");

    await (await siteNav(page)).getByRole("link", { name: "Home" }).click();

    // Asserted by content rather than URL, and by a rail that's always there
    // rather than "Continue watching" — that one's real now (docs/
    // DEVELOPMENT-PLAN.md's homepage-migration entry) and correctly absent
    // for this test's signed-out guest, who has no watch history to show.
    await expect(
      page.getByRole("heading", { name: "Films & cinema" }),
    ).toBeVisible();
  });

  test("workspaces offer their own way back to the site", async ({ page }) => {
    // /admin/* redirects guests to /auth/login.
    await login(page);
    await page.goto("/admin/reviews/");

    // The workspace rail is behind a toggle on small screens. Wait for one
    // of the two states rather than a single isVisible() snapshot — right
    // after navigation the boot splash can still be up, during which neither
    // is visible yet.
    const railToggle = page.getByRole("button", {
      name: "Open workspace navigation",
    });
    const backLink = page.getByRole("link", { name: /Back to Nexus/ });
    await expect(railToggle.or(backLink)).toBeVisible();
    if (await railToggle.isVisible()) await railToggle.click();

    await backLink.click();
    await expect(
      page.getByRole("heading", { name: "Continue watching" }),
    ).toBeVisible();
  });
});

test.describe("First-load experience", () => {
  test("the splash is in the prerendered HTML so it paints before JS", async ({
    request,
  }) => {
    const response = await request.get("/");
    const html = await response.text();

    // Server-rendered, not injected after hydration — otherwise there would be
    // a blank screen while the bundle downloads.
    expect(html).toContain("Preparing your catalogue");
    expect(html).toContain("animate-node-pulse");
  });

  test("the splash clears itself and does not trap clicks", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Preparing your catalogue")).toBeHidden({
      timeout: 10_000,
    });

    // Proves nothing invisible is still covering the page.
    await (await siteNav(page)).getByRole("link", { name: "Live" }).click();
    await expect(
      page.getByRole("heading", { name: "Live events", level: 1 }),
    ).toBeVisible();
  });
});

test.describe("Failure states", () => {
  test("losing the connection replaces the page, and regaining it restores", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(page.getByText("Preparing your catalogue")).toBeHidden({
      timeout: 10_000,
    });

    await context.setOffline(true);
    await expect(
      page.getByRole("heading", { name: "You are offline", level: 1 }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

    await context.setOffline(false);

    // Recovers in place — no reload, and the page comes back. Same rail
    // choice as the navigation test above, for the same reason: this guest
    // session has no "Continue watching" rail to recover.
    await expect(
      page.getByRole("heading", { name: "Films & cinema" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Back online — content refreshed")).toBeVisible();
  });

  test("an unknown route serves the custom not-found page", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist/");

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: /We cannot find that page/, level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sitemap" })).toBeVisible();
  });
});
