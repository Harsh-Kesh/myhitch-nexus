"use client";

import {
  IconBuildingStore,
  IconChartHistogram,
  IconCreditCard,
  IconLink,
  IconShieldCheck,
  IconSpeakerphone,
  IconUsers,
  IconVideo,
} from "@tabler/icons-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { useCampaigns, useLeads } from "@/lib/mock-api/hooks";

const BUSINESS_CHANNEL = "ch_helio";

export function BusinessShell({ children }: { children: React.ReactNode }) {
  const { data: leads = [] } = useLeads(BUSINESS_CHANNEL);
  const { data: campaigns = [] } = useCampaigns(BUSINESS_CHANNEL);

  const newLeads = leads.filter((lead) => lead.status === "new").length;
  const pendingCampaigns = campaigns.filter((c) => c.status === "pending").length;

  return (
    <WorkspaceShell
      workspace={{
        title: "Business Studio",
        subtitle: "Helio Motors",
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
              href: "/business/verification",
              label: "Verification",
              icon: <IconShieldCheck />,
            },
          ],
        },
      ]}
    >
      {children}
    </WorkspaceShell>
  );
}
