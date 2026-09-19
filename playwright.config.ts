import { defineConfig, devices } from "@playwright/test";

// The webServer below already gets .env.local (see its own comment); the test *runner*
// process is separate and doesn't load it automatically. A handful of tests connect to
// Postgres directly for cleanup (e2e/helpers.ts's deleteTestAccount) and need
// DATABASE_URL here too. Guarded since CI may inject env vars directly instead of via a
// file.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. CI with env vars set directly) — fine.
}

const PORT = Number(process.env.PORT ?? 3100);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // `next start` is a single Node process (matching the real Railway deployment,
  // not a scaled-out target) — several headless browsers pulling chunks at once
  // saturate it and produce spurious navigation timeouts, so the suite runs
  // serially. Completes in ~2 minutes either way.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    testIdAttribute: "data-testid",
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],

  // Runs against `next start` — the same server process the real deployment
  // (Railway) runs, not the dev server — so there's no dev-only behaviour (fast
  // refresh, on-demand compilation) to account for. Requires a production build
  // first; `npm run test:e2e` does that for you. Needs the same environment
  // `next start` itself does (DATABASE_URL etc., loaded from .env.local) since
  // login and the catalogue routes hit the real database.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `${BASE_URL}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
