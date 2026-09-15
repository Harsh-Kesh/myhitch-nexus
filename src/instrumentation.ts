// Next.js's instrumentation hook — runs once per server/edge process at boot, before any
// request is handled. This is how Sentry gets initialized server-side; see
// sentry.server.config.ts / sentry.edge.config.ts for the actual Sentry.init() calls.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Reports errors thrown in Server Components, route handlers and layouts (including,
// notably, anything that goes wrong in requireRole()'s callers — see rbac.ts) that
// wouldn't otherwise reach a client-side error boundary at all.
export const onRequestError = Sentry.captureRequestError;
