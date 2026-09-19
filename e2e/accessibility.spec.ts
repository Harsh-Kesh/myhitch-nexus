import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { dismissDevOverlay, login } from "./helpers";

/**
 * WCAG 2.2 AA automated pass (AC-9, SRS NFR-6) — real axe-core scans of the rendered
 * page, not a manual eyeball check. Covers a representative set of surfaces rather than
 * literally every route: every distinct layout/component family the app has (public
 * marketing/discovery, video detail, auth forms, the four workspace shells) is
 * represented at least once, so a systemic issue (e.g. a shared component's contrast)
 * only needs fixing once to clear every page that uses it.
 *
 * axe-core can't see everything WCAG 2.2 asks for (keyboard-trap testing, meaningful
 * alt text, reading order) — this is the automatable floor, not the whole audit AC-9
 * ultimately needs (that still wants a manual pass + a screen-reader walkthrough of
 * UJ-1/UJ-2, per the SRS testing strategy).
 */

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: import("@playwright/test").Page) {
  return new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
}

function formatViolations(violations: import("axe-core").Result[]): string {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help}\n${v.nodes
          .slice(0, 3)
          .map((n) => `  - ${n.target.join(" ")}`)
          .join("\n")}`,
    )
    .join("\n\n");
}

test.describe("WCAG 2.2 AA — public surfaces", () => {
  const PUBLIC_ROUTES = [
    "/",
    "/explore",
    "/search",
    "/live",
    "/creators",
    "/channel/ch_mara",
    "/video/vid_saltmarsh",
    "/auth/login",
    "/auth/register",
    "/sitemap",
  ];

  for (const route of PUBLIC_ROUTES) {
    test(`${route} has no automatically-detectable WCAG 2.2 AA violations`, async ({ page }) => {
      await page.goto(route);
      await dismissDevOverlay(page);
      await page.waitForTimeout(300);
      const results = await scan(page);
      expect(results.violations, formatViolations(results.violations)).toEqual([]);
    });
  }
});

test.describe("WCAG 2.2 AA — authenticated workspaces", () => {
  const WORKSPACE_ROUTES = [
    "/account/profile",
    "/account/subscriptions",
    "/studio/dashboard",
    "/studio/upload",
    "/studio/content",
    "/business/channel",
    "/admin",
    "/admin/reports",
    "/admin/settings",
  ];

  for (const route of WORKSPACE_ROUTES) {
    test(`${route} has no automatically-detectable WCAG 2.2 AA violations`, async ({ page }) => {
      await login(page);
      await page.goto(route);
      await dismissDevOverlay(page);
      await page.waitForTimeout(300);
      const results = await scan(page);
      expect(results.violations, formatViolations(results.violations)).toEqual([]);
    });
  }
});

test.describe("WCAG 2.2 AA — dark theme", () => {
  // Not every route from the two suites above — a representative subset that
  // exercises every token fixed by this pass (fg-subtle, the status/semantic
  // ramp, the live badge), since a token fix either holds for every consumer of
  // that token or it doesn't; it doesn't need re-proving route by route.
  const DARK_ROUTES = ["/", "/live", "/studio/dashboard", "/admin"];

  for (const route of DARK_ROUTES) {
    test(`${route} in dark mode has no automatically-detectable WCAG 2.2 AA violations`, async ({ page }) => {
      if (route === "/studio/dashboard" || route === "/admin") await login(page);
      await page.addInitScript(() => document.documentElement.setAttribute("data-theme", "dark"));
      await page.goto(route);
      await dismissDevOverlay(page);
      await page.waitForTimeout(300);
      const results = await scan(page);
      expect(results.violations, formatViolations(results.violations)).toEqual([]);
    });
  }
});
