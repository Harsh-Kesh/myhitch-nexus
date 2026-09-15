// Sentry init for the Node.js runtime (route handlers, server components). Loaded via
// src/instrumentation.ts's register() hook, not imported directly anywhere else.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Keep this modest rather than 100% — it's request tracing volume, not error volume,
  // and error reports are captured regardless of this setting.
  tracesSampleRate: 0.2,
});
