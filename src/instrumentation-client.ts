// Sentry init for the browser. Next.js loads this automatically (same convention as
// instrumentation.ts, but for client bundles) — nothing else needs to import it.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
});

// Reports errors during client-side route transitions that wouldn't otherwise be
// attributed to a specific navigation.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
