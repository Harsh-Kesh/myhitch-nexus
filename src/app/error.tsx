"use client";

import { IconAlertTriangle, IconHome, IconRefresh } from "@tabler/icons-react";
import * as Sentry from "@sentry/nextjs";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { StatusLinks, StatusScreen } from "@/components/layout/status-screen";

/**
 * Route-level error boundary. Catches anything thrown while rendering a page
 * and offers recovery in place — `reset()` re-renders the segment without
 * throwing away the rest of the app.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[nexus] route error:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <StatusScreen
      tone="danger"
      icon={<IconAlertTriangle />}
      title="Something broke on this page"
      description={
        <>
          The page failed while rendering. Nothing you did caused it, and
          nothing was lost — the mock data lives in your browser and reseeds on
          reload.
        </>
      }
      detail={
        error.digest
          ? `${error.message}\n\ndigest: ${error.digest}`
          : error.message || String(error)
      }
      actions={
        <>
          <Button variant="primary" onClick={reset}>
            <IconRefresh />
            Try again
          </Button>
          <Button variant="secondary" href="/">
            <IconHome />
            Go home
          </Button>
        </>
      }
    >
      <StatusLinks
        links={[
          { label: "Browse", href: "/explore" },
          { label: "Live", href: "/live" },
          { label: "Creator Studio", href: "/studio/dashboard" },
          { label: "Admin", href: "/admin" },
        ]}
      />
    </StatusScreen>
  );
}
