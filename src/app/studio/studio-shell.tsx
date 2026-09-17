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
  const channelId = user?.channelId ?? "ch_mara";
  const { data: comments = [] } = useModerationComments(channelId);
  const heldCount = comments.filter((comment) => comment.status === "held").length;
  const accentLabel =
    STUDIO_ACCENTS.find((entry) => user?.roles.includes(entry.role as (typeof user.roles)[number]))?.accent ??
    "Creator";
  const title = accentLabel === "Creator" ? "Creator Studio" : "Content Studio";

  return (
    <WorkspaceShell
      workspace={{
        title,
        subtitle: user?.name ?? "Your channel",
        href: "/studio/dashboard",
      }}
      accentLabel={accentLabel}
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
