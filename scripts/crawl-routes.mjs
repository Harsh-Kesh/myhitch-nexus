import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const ROUTES = [
  // Public
  "/",
  "/films",
  "/commercial",
  "/live",
  "/education",
  "/news",
  "/entertainment",
  "/music",
  "/podcasts",
  "/creators",
  "/explore",
  "/plans",
  "/search?q=documentary",
  "/sitemap",
  "/auth/login",
  "/auth/register",
  "/category/brand-films",
  "/category/feature-films",
  "/channel/ch_northlight",
  "/channel/ch_mara",
  "/live/live_council_planning",
  "/video/vid_saltmarsh",
  "/video/vid_paperkingdom",

  // Studio
  "/studio/dashboard",
  "/studio/upload",
  "/studio/content",
  "/studio/live",
  "/studio/playlists",
  "/studio/analytics",
  "/studio/revenue",
  "/studio/comments",
  "/studio/channel-settings",
  "/studio/magazine",
  "/studio/sponsorship",

  // Business
  "/business/channel",
  "/business/campaigns",
  "/business/campaigns/new",
  "/business/product-links",
  "/business/leads",
  "/business/billing",
  "/business/analytics",
  "/business/verification",
  "/business/videos",

  // Admin
  "/admin",
  "/admin/reviews",
  "/admin/users",
  "/admin/organisations",
  "/admin/ads",
  "/admin/content",
  "/admin/reports",
  "/admin/live",
  "/admin/analytics",
  "/admin/audit-logs",
  "/admin/finance",
  "/admin/settings",

  // Account
  "/account/profile",
  "/account/watchlist",
  "/account/subscriptions",
  "/account/billing",
  "/account/settings",
];

async function main() {
  console.log(`Starting crawl against ${BASE_URL} for ${ROUTES.length} routes...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];
  const errors = [];

  // First, sign in as Mara so protected routes (Studio, Business, Admin, Account) are accessible
  console.log("Signing in as demo user Mara Solace...");
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 15000 });
  console.log("Signed in successfully.");

  for (const route of ROUTES) {
    const routeErrors = [];
    const failedRequests = [];

    const onConsole = (msg) => {
      if (msg.type() === "error") {
        // Ignore known harmless telemetry / favicon / hydration noise if any
        const text = msg.text();
        if (!text.includes("favicon") && !text.includes("Sentry")) {
          routeErrors.push(text);
        }
      }
    };

    const onRequestFailed = (req) => {
      const url = req.url();
      if (!url.includes("favicon") && !url.includes("sentry")) {
        failedRequests.push(`${req.method()} ${url} (${req.failure()?.errorText})`);
      }
    };

    page.on("console", onConsole);
    page.on("requestfailed", onRequestFailed);

    try {
      const res = await page.goto(`${BASE_URL}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      // Wait a moment for client hydration
      await page.waitForTimeout(1000);

      const status = res?.status() ?? 0;
      const title = await page.title();
      const h1 = await page.locator("h1").first().textContent().catch(() => null);

      const routeResult = {
        route,
        status,
        title,
        h1: h1?.trim() ?? "No H1",
        errors: routeErrors,
        failedRequests,
      };

      results.push(routeResult);

      const statusIcon = status >= 200 && status < 400 && routeErrors.length === 0 ? "✓" : "✗";
      console.log(`${statusIcon} [${status}] ${route} — "${routeResult.h1}" (${routeErrors.length} errors, ${failedRequests.length} failed reqs)`);

      if (routeErrors.length > 0 || failedRequests.length > 0 || status >= 400) {
        errors.push(routeResult);
      }
    } catch (err) {
      console.error(`✗ [CRASH] ${route}: ${err.message}`);
      errors.push({ route, error: err.message });
    } finally {
      page.off("console", onConsole);
      page.off("requestfailed", onRequestFailed);
    }
  }

  await browser.close();

  console.log("\n================ CRAWL SUMMARY ================");
  console.log(`Total routes crawled: ${results.length}`);
  console.log(`Clean routes: ${results.length - errors.length}`);
  console.log(`Routes with warnings/errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log("\nDetails of issues:");
    for (const e of errors) {
      console.log(`\nRoute: ${e.route}`);
      if (e.status) console.log(`  Status: ${e.status}`);
      if (e.errors?.length) console.log(`  Console errors:`, e.errors);
      if (e.failedRequests?.length) console.log(`  Failed requests:`, e.failedRequests);
      if (e.error) console.log(`  Crash error: ${e.error}`);
    }
  }
}

main().catch((err) => {
  console.error("Crawl failed:", err);
  process.exitCode = 1;
});
