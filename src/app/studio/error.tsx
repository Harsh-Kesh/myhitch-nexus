"use client";

import { IconAlertTriangle, IconHome, IconRefresh } from "@tabler/icons-react";
import * as Sentry from "@sentry/nextjs";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { StatusLinks, StatusScreen } from "@/components/layout/status-screen";

// Segment-level error boundary — renders inside studio/layout.tsx, so the Content
// Studio nav (StudioShell) stays on screen instead of falling back to the root
// error.tsx and losing the workspace chrome.
export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[nexus] studio route error:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <StatusScreen
      tone="danger"
      icon={<IconAlertTriangle />}
      title="Something broke in Content Studio"
      description="This page failed to load. Nothing was lost — try again, or head back to your dashboard."
      detail={error.digest ? `${error.message}\n\ndigest: ${error.digest}` : error.message || String(error)}
      actions={
        <>
          <Button variant="primary" onClick={reset}>
            <IconRefresh />
            Try again
          </Button>
          <Button variant="secondary" href="/studio/dashboard">
            <IconHome />
            Dashboard
          </Button>
        </>
      }
    >
      <StatusLinks
        links={[
          { label: "Content", href: "/studio/content" },
          { label: "Upload", href: "/studio/upload" },
          { label: "Analytics", href: "/studio/analytics" },
          { label: "Revenue", href: "/studio/revenue" },
        ]}
      />
    </StatusScreen>
  );
}
