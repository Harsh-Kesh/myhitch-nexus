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
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { useCurrentUser, useModerationComments } from "@/lib/mock-api/hooks";

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
  const { data: user } = useCurrentUser();
  const [activeChannelId, setActiveChannelId] = React.useState<string>(user?.channelId ?? "ch_mara");

  React.useEffect(() => {
    if (user?.channelId) setActiveChannelId(user.channelId);
  }, [user?.channelId]);

  // Dynamically resolves real channels for the active user — no static mock placeholders
  const userChannelName = user?.name ? `${user.name}'s Channel` : "My Channel";
  const userPrimaryChannelId = user?.channelId ?? "ch_mara";

  const channels = React.useMemo(() => {
    const list = [
      { id: userPrimaryChannelId, name: userChannelName, role: "Owner" },
    ];
    return list;
  }, [userPrimaryChannelId, userChannelName]);

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? channels[0];
  const { data: comments = [] } = useModerationComments(activeChannel.id);
  const heldCount = comments.filter((comment) => comment.status === "held").length;
  const accentLabel =
    STUDIO_ACCENTS.find((entry) => user?.roles.includes(entry.role as (typeof user.roles)[number]))?.accent ??
    "Creator";
  const title = accentLabel === "Creator" ? "Creator Studio" : "Content Studio";

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
            {
              href: "/studio/analytics",
              label: "Analytics",
              icon: <IconChartHistogram />,
            },
            { href: "/studio/revenue", label: "Revenue", icon: <IconCoin /> },
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
