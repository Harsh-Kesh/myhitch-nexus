"use client";

import { IconAlertTriangle, IconHome, IconRefresh } from "@tabler/icons-react";
import * as Sentry from "@sentry/nextjs";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { StatusLinks, StatusScreen } from "@/components/layout/status-screen";

// Segment-level error boundary — renders inside business/layout.tsx, so the Business
// Studio nav (BusinessShell) stays on screen instead of the whole app falling back to
// the generic root error.tsx and losing the workspace chrome. Same "no silent white
// screen" fix as the useOwnedChannelId()/EmptyState work, for the other failure mode:
// a real API error mid-render, not a missing channel.
export default function BusinessError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[nexus] business route error:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <StatusScreen
      tone="danger"
      icon={<IconAlertTriangle />}
      title="Something broke in Business Studio"
      description="This page failed to load. Nothing was lost — try again, or head back to your channel overview."
      detail={error.digest ? `${error.message}\n\ndigest: ${error.digest}` : error.message || String(error)}
      actions={
        <>
          <Button variant="primary" onClick={reset}>
            <IconRefresh />
            Try again
          </Button>
          <Button variant="secondary" href="/business/channel">
            <IconHome />
            Channel overview
          </Button>
        </>
      }
    >
      <StatusLinks
        links={[
          { label: "Videos", href: "/business/videos" },
          { label: "Campaigns", href: "/business/campaigns" },
          { label: "Leads", href: "/business/leads" },
          { label: "Billing", href: "/business/billing" },
        ]}
      />
    </StatusScreen>
  );
}
