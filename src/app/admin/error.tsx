"use client";

import { IconAlertTriangle, IconHome, IconRefresh } from "@tabler/icons-react";
import * as Sentry from "@sentry/nextjs";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { StatusLinks, StatusScreen } from "@/components/layout/status-screen";

// Segment-level error boundary — renders inside admin/layout.tsx, so the admin nav
// (AdminShell) stays on screen instead of falling back to the root error.tsx and
// losing the workspace chrome.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[nexus] admin route error:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <StatusScreen
      tone="danger"
      icon={<IconAlertTriangle />}
      title="Something broke in the admin panel"
      description="This page failed to load. Nothing was lost — try again, or head back to the admin summary."
      detail={error.digest ? `${error.message}\n\ndigest: ${error.digest}` : error.message || String(error)}
      actions={
        <>
          <Button variant="primary" onClick={reset}>
            <IconRefresh />
            Try again
          </Button>
          <Button variant="secondary" href="/admin">
            <IconHome />
            Admin home
          </Button>
        </>
      }
    >
      <StatusLinks
        links={[
          { label: "Reviews", href: "/admin/reviews" },
          { label: "Users", href: "/admin/users" },
          { label: "Finance", href: "/admin/finance" },
          { label: "Audit log", href: "/admin/audit-logs" },
        ]}
      />
    </StatusScreen>
  );
}
