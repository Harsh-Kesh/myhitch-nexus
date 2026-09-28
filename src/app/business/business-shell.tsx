"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  IconBuildingStore,
  IconChartHistogram,
  IconCreditCard,
  IconKey,
  IconLink,
  IconSpeakerphone,
  IconUsers,
  IconVideo,
} from "@tabler/icons-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { useCampaigns, useChannel, useCurrentUser, useLeads, useOwnedChannelId } from "@/lib/mock-api/hooks";

export function BusinessShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { channelId, isLoading: isUserLoading } = useOwnedChannelId();
  const { data: channel } = useChannel(channelId ?? "");
  const { data: leads = [] } = useLeads(channelId ?? "");
  const { data: campaigns = [] } = useCampaigns(channelId ?? "");

  const newLeads = leads.filter((lead) => lead.status === "new").length;
  const pendingCampaigns = campaigns.filter((c) => c.status === "pending").length;

  // "Enterprise & API" is a Nexus Enterprise-only add-on (large file transfers, client
  // review workflow, video version control + audit trail, developer API access — see
  // the /plans page's own Enterprise-tier feature list), not part of Nexus Business.
  // Previously shown to every Business Studio account regardless of plan — the linked
  // page's own API routes now enforce this too, so this is UX, not the real gate.
  const isEnterprise = Boolean(user?.roles.includes("producer"));

  // No channel is a dead end here, not a normal empty state — this layout only ever
  // renders for an account whose role+plan already passed business/layout.tsx's own
  // gate, so a missing channel means provisioning didn't finish, not "come back once
  // you upgrade." Bounce to /plans rather than stranding them on a page with no nav
  // that works.
  React.useEffect(() => {
    if (!isUserLoading && !channelId) router.replace("/plans");
  }, [isUserLoading, channelId, router]);

  if (isUserLoading || !channelId) return null;

  return (
    <WorkspaceShell
      workspace={{
        title: "Business Studio",
        subtitle: channel?.name ?? "Your business",
        href: "/business/channel",
      }}
      accentLabel="Business"
      groups={[
        {
          items: [
            {
              href: "/business/channel",
              label: "Channel",
              icon: <IconBuildingStore />,
            },
            { href: "/business/videos", label: "Videos", icon: <IconVideo /> },
          ],
        },
        {
          title: "Advertising",
          items: [
            {
              href: "/business/campaigns",
              label: "Campaigns",
              icon: <IconSpeakerphone />,
              badge: pendingCampaigns,
            },
          ],
        },
        {
          title: "Commerce",
          items: [
            {
              href: "/business/product-links",
              label: "Product links",
              icon: <IconLink />,
            },
            {
              href: "/business/leads",
              label: "Leads",
              icon: <IconUsers />,
              badge: newLeads,
            },
          ],
        },
        {
          title: "Measure",
          items: [
            {
              href: "/business/analytics",
              label: "Analytics",
              icon: <IconChartHistogram />,
            },
            {
              href: "/business/billing",
              label: "Billing",
              icon: <IconCreditCard />,
            },
          ],
        },
        {
          title: "Configure",
          items: [
            {
              href: "/business/team",
              label: "Team members",
              icon: <IconUsers />,
            },
          ],
        },
        ...(isEnterprise
          ? [
              {
                title: "Enterprise",
                items: [
                  {
                    href: "/business/enterprise",
                    label: "Enterprise & API",
                    icon: <IconKey />,
                  },
                ],
              },
            ]
          : []),
      ]}
    >
      {children}
    </WorkspaceShell>
  );
}
