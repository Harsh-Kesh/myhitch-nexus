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
import { useAdminSummary } from "@/lib/mock-api/hooks";

export function AdminShell({ children }: { children: React.ReactNode }) {
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
      {children}
    </WorkspaceShell>
  );
}
