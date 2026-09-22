"use client";

import {
  IconBuildingStore,
  IconChartHistogram,
  IconCreditCard,
  IconKey,
  IconLink,
  IconShieldCheck,
  IconSpeakerphone,
  IconUsers,
  IconVideo,
} from "@tabler/icons-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { looksLikeRealId } from "@/lib/mock-api";
import { useCampaigns, useChannel, useCurrentUser, useLeads } from "@/lib/mock-api/hooks";

// Fallback for the shared demo account. Not a plain `?? "ch_helio"`: the demo account's
// own `channelId` is never actually null by the time it reaches here — the backend
// leaves it at the mock-seeded default "ch_mara" (Mara Solace, a creator) when the real
// account has no channel of its own — so a bare `??` would show her creator profile
// under Business Studio instead of the business-appropriate mock demo. Only a genuine
// real id should override this fallback.
const MOCK_BUSINESS_CHANNEL = "ch_helio";

export function BusinessShell({ children }: { children: React.ReactNode }) {
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId && looksLikeRealId(user.channelId) ? user.channelId : MOCK_BUSINESS_CHANNEL;
  const { data: channel } = useChannel(channelId);
  const { data: leads = [] } = useLeads(channelId);
  const { data: campaigns = [] } = useCampaigns(channelId);

  const newLeads = leads.filter((lead) => lead.status === "new").length;
  const pendingCampaigns = campaigns.filter((c) => c.status === "pending").length;

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
            {
              href: "/business/verification",
              label: "Verification",
              icon: <IconShieldCheck />,
            },
          ],
        },
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
      ]}
    >
      {children}
    </WorkspaceShell>
  );
}
