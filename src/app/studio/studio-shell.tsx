"use client";

import * as React from "react";
import {
  IconBroadcast,
  IconChartHistogram,
  IconCoin,
  IconLayoutDashboard,
  IconMessage,
  IconNews,
  IconPlaylist,
  IconSettings,
  IconSpeakerphone,
  IconUpload,
  IconUsers,
  IconVideo,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { useCurrentUser, useModerationComments, useOwnedChannelId } from "@/lib/mock-api/hooks";

// /studio admits every channel-owning role now (see studio/layout.tsx), not just
// creator — a business/producer/education/organisation account landing here to publish
// content shouldn't see "Creator Studio" branding that isn't theirs. Title stays the
// generic "Content Studio" for a non-creator role (not e.g. "Business Studio" — that
// name already belongs to the distinct /business workspace, with its own
// advertising/commerce surfaces this one doesn't have). `creator` deliberately checked
// *first*, not last: roles are additive (SRS §4), and an account can pick up an extra
// role well after the fact (found live — the shared demo account now also holds
// business/advertiser from earlier testing this session) without that account stopping
// being, in any meaningful sense, a creator. Only an account with no creator role at all
// gets the generic label.
const STUDIO_ACCENTS: Array<{ role: string; accent: string }> = [
  { role: "creator", accent: "Creator" },
  { role: "business", accent: "Business" },
  { role: "advertiser", accent: "Advertiser" },
  { role: "producer", accent: "Producer" },
  { role: "education", accent: "Education" },
  { role: "organisation", accent: "Organisation" },
];

export function StudioShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { channelId, isLoading: isUserLoading } = useOwnedChannelId();
  const [activeChannelId, setActiveChannelId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (channelId) setActiveChannelId(channelId);
  }, [channelId]);

  const { data: comments = [] } = useModerationComments(activeChannelId ?? channelId ?? "");
  const heldCount = comments.filter((comment) => comment.status === "held").length;
  const accentLabel =
    STUDIO_ACCENTS.find((entry) => user?.roles.includes(entry.role as (typeof user.roles)[number]))?.accent ??
    "Creator";
  const title = accentLabel === "Creator" ? "Creator Studio" : "Content Studio";

  // Same reasoning as business-shell.tsx: every channel-owning role already passed
  // studio/layout.tsx's role gate to get here, so no channel means provisioning didn't
  // finish, not "you're not eligible yet." Bounce to /plans instead of stranding them.
  React.useEffect(() => {
    if (!isUserLoading && !channelId) router.replace("/plans");
  }, [isUserLoading, channelId, router]);

  if (isUserLoading || !channelId) return null;

  const userChannelName = user?.name ? `${user.name}'s Channel` : "My Channel";
  const channels = [{ id: activeChannelId ?? channelId, name: userChannelName, role: "Owner" }];
  const activeChannel = channels[0];

  return (
    <WorkspaceShell
      workspace={{
        title,
        subtitle: `${activeChannel.name} (${activeChannel.role})`,
        href: "/studio/dashboard",
      }}
      accentLabel={accentLabel}
      channels={channels}
      activeChannelId={activeChannel.id}
      onSelectChannel={(id) => setActiveChannelId(id)}
      groups={[
        {
          items: [
            {
              href: "/studio/dashboard",
              label: "Dashboard",
              icon: <IconLayoutDashboard />,
            },
            { href: "/studio/content", label: "Content", icon: <IconVideo /> },
            { href: "/studio/upload", label: "Upload", icon: <IconUpload /> },
            { href: "/studio/live", label: "Live", icon: <IconBroadcast /> },
            {
              href: "/studio/playlists",
              label: "Playlists & series",
              icon: <IconPlaylist />,
            },
            {
              href: "/studio/comments",
              label: "Comments",
              icon: <IconMessage />,
              badge: heldCount,
            },
            {
              href: "/studio/community",
              label: "Community",
              icon: <IconUsers />,
            },
            {
              href: "/studio/magazine",
              label: "Magazine",
              icon: <IconNews />,
            },
            {
              href: "/studio/sponsorship",
              label: "Exchange Hub",
              icon: <IconSpeakerphone />,
            },
          ],
        },
        {
          title: "Measure",
          items: [
            ...(user?.roles.includes("viewer") ? [] : [
              { href: "/studio/analytics", label: "Analytics", icon: <IconChartHistogram /> },
              { href: "/studio/revenue", label: "Revenue", icon: <IconCoin /> },
            ])
          ],
        },
        {
          title: "Configure",
          items: [
            {
              href: "/studio/channel-settings",
              label: "Channel settings",
              icon: <IconSettings />,
            },
          ],
        },
      ]}
    >
      {children}
    </WorkspaceShell>
  );
}
