// Sentry init for the Edge runtime (middleware, if any ever runs there). Loaded via
// src/instrumentation.ts's register() hook, not imported directly anywhere else.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
});
