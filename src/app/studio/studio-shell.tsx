"use client";

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
  IconVideo,
} from "@tabler/icons-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { useCurrentUser, useModerationComments } from "@/lib/mock-api/hooks";

export function StudioShell({ children }: { children: React.ReactNode }) {
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId ?? "ch_mara";
  const { data: comments = [] } = useModerationComments(channelId);
  const heldCount = comments.filter((comment) => comment.status === "held").length;

  return (
    <WorkspaceShell
      workspace={{
        title: "Creator Studio",
        subtitle: user?.name ?? "Your channel",
        href: "/studio/dashboard",
      }}
      accentLabel="Creator"
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
