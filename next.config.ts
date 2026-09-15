import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

/**
 * Deployed as a normal Next.js server (Railway), served from the domain
 * root — so BASE_PATH resolves to "" here. It's kept only so the app still
 * builds as a static GitHub Pages export via `NEXT_PUBLIC_BASE_PATH=/myhitch-nexus`
 * if that's ever needed again; the served-at-root case (Railway, local dev)
 * needs nothing set.
 *
 * NOTE: Run `node scripts/generate-assets.mjs` once after cloning to generate
 * all SVG assets (avatars, banners, live-event posters, category cards) that
 * the mock-API data layer references under public/images/.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  trailingSlash: true,
  reactStrictMode: true,
  // UI-only build: every image is either a local SVG/poster or a generated
  // data-URI gradient from lib/mock-api. No remote image hosts are configured
  // on purpose — see §12 "explicitly out of scope".
  images: {
    unoptimized: true,
    remotePatterns: [],
  },
};

// No SENTRY_AUTH_TOKEN is configured, so source-map upload is skipped (this just means
// Sentry's stack traces show minified code until one is added — error capture itself is
// unaffected). `silent: true` keeps that skip quiet rather than warning on every build.
export default withSentryConfig(nextConfig, {
  silent: true,
});
