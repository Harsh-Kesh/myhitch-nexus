"use client";

import { IconBuildingCommunity } from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { CHANNEL_KIND_LABELS } from "@/lib/mock-api/data/channels";
import { useOrganisations } from "@/lib/mock-api/hooks";
import { relativeTime } from "@/lib/utils";

const STATUS_TONE = {
  verified: "published",
  pending: "pending",
  rejected: "rejected",
  unverified: "draft",
} as const;

export default function AdminOrganisationsPage() {
  const { data: organisations = [] } = useOrganisations();
  const [tab, setTab] = React.useState("all");

  const filtered =
    tab === "all"
      ? organisations
      : organisations.filter((org) => org.verificationStatus === tab);

  const counts = {
    pending: organisations.filter((o) => o.verificationStatus === "pending").length,
    verified: organisations.filter((o) => o.verificationStatus === "verified").length,
    rejected: organisations.filter((o) => o.verificationStatus === "rejected").length,
  };

  return (
    <>
      <PageHeader
        title="Organisations"
        description="Verification applications from businesses, studios, education providers, government bodies and charities."
      />

      <PageBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Pending (Legacy)"
            value={String(counts.pending)}
            icon={<IconBuildingCommunity />}
          />
          <Stat label="Verified" value={String(counts.verified)} />
          <Stat label="Rejected" value={String(counts.rejected)} />
        </div>

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "all", label: "All", count: organisations.length },
            { value: "pending", label: "Pending", count: counts.pending },
            { value: "verified", label: "Verified", count: counts.verified },
            { value: "rejected", label: "Rejected", count: counts.rejected },
          ]}
        />

        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconBuildingCommunity />}
            title="Nothing here"
            description="No organisations match this filter."
          />
        ) : (
          <div className="space-y-4">
            {filtered.map((org) => (
              <Card key={org.id}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {org.name}
                      <Badge tone={STATUS_TONE[org.verificationStatus]} size="sm">
                        {org.verificationStatus}
                      </Badge>
                      <Badge tone="outline" size="sm">
                        {CHANNEL_KIND_LABELS[org.kind] || org.kind}
                      </Badge>
                    </span>
                  }
                  description={`${org.registrationNumber || "No ABN"} • ${org.country} • submitted ${relativeTime(org.submittedAt)}`}
                />
                <CardBody className="text-sm text-fg-subtle">
                  <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
                    <div className="font-medium text-fg">Contact</div>
                    <div>{org.representativeEmail}</div>
                    
                    
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
