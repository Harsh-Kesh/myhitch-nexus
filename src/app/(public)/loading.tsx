import { NexusLoader } from "@/components/layout/nexus-loader";

/**
 * Route-level loading UI, shown while a segment's code or data is in flight.
 * Same mark as the boot splash so navigation feels continuous with startup.
 *
 * Scoped to (public) rather than the true app root on purpose: a root-level
 * loading.tsx wraps every route — including admin/studio/business — in an
 * implicit Suspense boundary, and that combination triggers a real Next.js
 * 15.5.25 bug where redirect() called from a nested layout (exactly what
 * requireRole() in src/lib/server/rbac.ts does) silently falls through to the
 * not-found page with a 200 status instead of performing the redirect —
 * found by testing the SEC-1 role guards directly, reproduced down to a
 * two-line repro page, and confirmed fixed the moment this file stopped
 * living at the true root. auth/api routes were never wrapped by it either
 * way, so this only narrows scope for admin/studio/business, which need
 * working redirects far more than they need this particular loading flash.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6">
      <NexusLoader size="md" label="Loading page" />
      <p className="text-sm text-fg-subtle">Loading…</p>
    </div>
  );
}
