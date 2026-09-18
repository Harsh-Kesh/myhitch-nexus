"use client";

import {
  IconBroadcast,
  IconBuildingCommunity,
  IconCoin,
  IconFileText,
  IconGavel,
  IconLayoutDashboard,
  IconListCheck,
  IconSettings,
  IconSpeakerphone,
  IconUsers,
  IconVideo,
} from "@tabler/icons-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { useAdminSummary, useCurrentUser } from "@/lib/mock-api/hooks";

export function AdminShell({ children }: { children: React.ReactNode }) {
  // Every admin data function (getModerationQueue, getAdminUsers, ...) branches
  // real/mock on store.user.id, which only gets hydrated to the real signed-in
  // account once useCurrentUser() resolves and calls applyRealAccount() — see
  // mock-api/index.ts's header comment on that function. Without gating children on
  // it, a page's own queries (e.g. useModerationQueue() in /admin/reviews) fire in
  // the same render pass as this shell, before that hydration has happened, and
  // permanently cache the wrong (mock) branch's result — found by actually logging
  // in as a real admin and seeing the seeded mock queue instead of the real one.
  const { isLoading: isUserLoading } = useCurrentUser();
  const { data: summary } = useAdminSummary();

  const reviewCount =
    (summary?.pendingContent ?? 0) +
    (summary?.reportedContent ?? 0) +
    (summary?.copyrightClaims ?? 0) +
    (summary?.liveIncidents ?? 0) +
    (summary?.verificationQueue ?? 0);

  return (
    <WorkspaceShell
      workspace={{
        title: "Admin console",
        subtitle: "Platform operations",
        href: "/admin",
      }}
      accentLabel="Admin"
      groups={[
        {
          items: [
            { href: "/admin", label: "Dashboard", icon: <IconLayoutDashboard /> },
            {
              href: "/admin/reviews",
              label: "Review queue",
              icon: <IconListCheck />,
              badge: reviewCount,
            },
          ],
        },
        {
          title: "Manage",
          items: [
            { href: "/admin/users", label: "Users", icon: <IconUsers /> },
            {
              href: "/admin/organisations",
              label: "Organisations",
              icon: <IconBuildingCommunity />,
            },
            { href: "/admin/content", label: "Content", icon: <IconVideo /> },
            { href: "/admin/live", label: "Live", icon: <IconBroadcast /> },
            {
              href: "/admin/ads",
              label: "Advertising",
              icon: <IconSpeakerphone />,
              badge: summary?.campaignsAwaitingApproval,
            },
          ],
        },
        {
          title: "Oversight",
          items: [
            { href: "/admin/finance", label: "Finance", icon: <IconCoin /> },
            { href: "/admin/reports", label: "Cases", icon: <IconGavel /> },
            {
              href: "/admin/audit-logs",
              label: "Audit log",
              icon: <IconFileText />,
            },
            { href: "/admin/settings", label: "Settings", icon: <IconSettings /> },
          ],
        },
      ]}
    >
      {isUserLoading ? null : children}
    </WorkspaceShell>
  );
}
