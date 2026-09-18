"use client";

import {
  IconBell,
  IconBookmark,
  IconCreditCard,
  IconGavel,
  IconHistory,
  IconReceipt,
  IconSettings,
  IconClock,
  IconUser,
} from "@tabler/icons-react";
import { AuthGuard } from "@/components/layout/auth-guard";
import { NavTabs } from "@/components/ui/tabs";

const TABS = [
  { href: "/account/profile", label: "Profile", icon: <IconUser /> },
  { href: "/account/watchlist", label: "Watchlist", icon: <IconBookmark /> },
  { href: "/account/history", label: "History", icon: <IconHistory /> },
  { href: "/account/purchases", label: "Purchases", icon: <IconReceipt /> },
  { href: "/account/rentals", label: "Rentals", icon: <IconClock /> },
  { href: "/account/subscriptions", label: "Subscriptions", icon: <IconCreditCard /> },
  { href: "/account/copyright", label: "Copyright", icon: <IconGavel /> },
  { href: "/account/notifications", label: "Notifications", icon: <IconBell /> },
  { href: "/account/settings", label: "Settings", icon: <IconSettings /> },
];

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="mx-auto max-w-[86rem] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="font-display text-2xl font-semibold text-fg sm:text-3xl">
          Your account
        </h1>
        <p className="mt-1.5 text-sm text-fg-muted">
          Profiles, viewing activity, purchases and preferences.
        </p>
        <NavTabs items={TABS} className="mt-5" />
        <div className="py-6">{children}</div>
      </div>
    </AuthGuard>
  );
}
