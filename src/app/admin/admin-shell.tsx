"use client";

import {
  IconBroadcast,
  IconBuildingCommunity,
  IconChartBar,
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

type AdminTier = "moderator" | "finance-admin" | "super-admin";

interface AdminNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  /** Which scoped tiers can use this page — a UX complement to the real server-side
   * checks (docs/openapi.yaml's matrix), never a substitute for them: hiding a link a
   * tier can't use avoids a dead-end 403, it doesn't do the actual enforcing. */
  tiers: AdminTier[];
}

const ALL_ADMIN_TIERS: AdminTier[] = ["moderator", "finance-admin", "super-admin"];

export function AdminShell({ children }: { children: React.ReactNode }) {
  // Every admin data function (getModerationQueue, getAdminUsers, ...) branches
  // real/mock on store.user.id, which only gets hydrated to the real signed-in
  // account once useCurrentUser() resolves and calls applyRealAccount() — see
  // mock-api/index.ts's header comment on that function. Without gating children on
  // it, a page's own queries (e.g. useModerationQueue() in /admin/reviews) fire in
  // the same render pass as this shell, before that hydration has happened, and
  // permanently cache the wrong (mock) branch's result — found by actually logging
  // in as a real admin and seeing the seeded mock queue instead of the real one.
  const { data: currentUser, isLoading: isUserLoading } = useCurrentUser();
  const { data: summary } = useAdminSummary();

  const myTiers = ALL_ADMIN_TIERS.filter((tier) => currentUser?.roles.includes(tier));
  const canSee = (item: AdminNavItem) => item.tiers.some((tier) => myTiers.includes(tier));

  const reviewCount =
    (summary?.pendingContent ?? 0) +
    (summary?.reportedContent ?? 0) +
    (summary?.copyrightClaims ?? 0) +
    (summary?.liveIncidents ?? 0) +
    (summary?.verificationQueue ?? 0);

  const groups: Array<{ title?: string; items: AdminNavItem[] }> = [
    {
      items: [
        { href: "/admin", label: "Dashboard", icon: <IconLayoutDashboard />, tiers: ALL_ADMIN_TIERS },
        { href: "/admin/analytics", label: "Analytics", icon: <IconChartBar />, tiers: ALL_ADMIN_TIERS },
        {
          href: "/admin/reviews",
          label: "Review queue",
          icon: <IconListCheck />,
          badge: reviewCount,
          tiers: ["moderator", "super-admin"],
        },
      ],
    },
    {
      title: "Manage",
      items: [
        { href: "/admin/users", label: "Users", icon: <IconUsers />, tiers: ["super-admin"] },
        {
          href: "/admin/organisations",
          label: "Organisations",
          icon: <IconBuildingCommunity />,
          tiers: ["moderator", "super-admin"],
        },
        { href: "/admin/content", label: "Content", icon: <IconVideo />, tiers: ["moderator", "super-admin"] },
        { href: "/admin/live", label: "Live", icon: <IconBroadcast />, tiers: ["moderator", "super-admin"] },
        {
          href: "/admin/ads",
          label: "Advertising",
          icon: <IconSpeakerphone />,
          badge: summary?.campaignsAwaitingApproval,
          tiers: ["moderator", "finance-admin", "super-admin"],
        },
      ],
    },
    {
      title: "Oversight",
      items: [
        { href: "/admin/finance", label: "Finance", icon: <IconCoin />, tiers: ["finance-admin", "super-admin"] },
        {
          href: "/admin/reports",
          label: "Cases",
          icon: <IconGavel />,
          tiers: ["moderator", "finance-admin", "super-admin"],
        },
        {
          href: "/admin/audit-logs",
          label: "Audit log",
          icon: <IconFileText />,
          tiers: ALL_ADMIN_TIERS,
        },
        { href: "/admin/settings", label: "Settings", icon: <IconSettings />, tiers: ["super-admin"] },
      ],
    },
  ];

  return (
    <WorkspaceShell
      workspace={{
        title: "Admin console",
        subtitle: "Platform operations",
        href: "/admin",
      }}
      accentLabel="Admin"
      groups={groups
        .map((group) => ({ ...group, items: group.items.filter(canSee) }))
        .filter((group) => group.items.length > 0)}
    >
      {isUserLoading ? null : children}
    </WorkspaceShell>
  );
}
