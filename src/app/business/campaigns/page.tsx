"use client";

import {
  IconClick,
  IconEye,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconSpeakerphone,
  IconTargetArrow,
} from "@tabler/icons-react";
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge, CampaignStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ProgressBar } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import {
  CHART_COLORS,
  chartAxis,
  chartGrid,
  chartTooltip,
} from "@/components/charts/chart-theme";
import {
  useCampaignSeries,
  useCampaigns,
  useUpdateCampaignStatus,
} from "@/lib/mock-api/hooks";
import type { Campaign } from "@/lib/mock-api/types";
import {
  compactNumber,
  formatCurrency,
  formatDate,
  formatPercent,
} from "@/lib/utils";

export default function CampaignsPage() {
  const { data: campaigns = [] } = useCampaigns();
  const updateStatus = useUpdateCampaignStatus();
  const { toast } = useToast();

  const [tab, setTab] = React.useState("all");
  const [detail, setDetail] = React.useState<Campaign | null>(null);

  const filtered =
    tab === "all" ? campaigns : campaigns.filter((c) => c.status === tab);

  const totals = campaigns.reduce(
    (acc, campaign) => ({
      spend: acc.spend + campaign.spend.amount,
      impressions: acc.impressions + campaign.metrics.impressions,
      clicks: acc.clicks + campaign.metrics.clicks,
      conversions: acc.conversions + campaign.metrics.conversions,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
  );

  const overallCtr = totals.impressions
    ? (totals.clicks / totals.impressions) * 100
    : 0;

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Plan, launch and measure advertising across the Nexus catalogue."
        actions={
          <Button variant="primary" href="/business/campaigns/new">
            <IconPlus />
            New campaign
          </Button>
        }
      />

      <PageBody className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Total spend"
            value={formatCurrency(totals.spend, "AUD", { compact: true })}
            icon={<IconSpeakerphone />}
          />
          <Stat
            label="Impressions"
            value={compactNumber(totals.impressions)}
            icon={<IconEye />}
          />
          <Stat
            label="Clicks"
            value={compactNumber(totals.clicks)}
            hint={`${formatPercent(overallCtr, 2)} CTR`}
            icon={<IconClick />}
          />
          <Stat
            label="Conversions"
            value={compactNumber(totals.conversions)}
            icon={<IconTargetArrow />}
          />
        </div>

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "all", label: "All", count: campaigns.length },
            {
              value: "active",
              label: "Active",
              count: campaigns.filter((c) => c.status === "active").length,
            },
            {
              value: "pending",
              label: "Pending approval",
              count: campaigns.filter((c) => c.status === "pending").length,
            },
            {
              value: "paused",
              label: "Paused",
              count: campaigns.filter((c) => c.status === "paused").length,
            },
            {
              value: "draft",
              label: "Drafts",
              count: campaigns.filter((c) => c.status === "draft").length,
            },
            {
              value: "rejected",
              label: "Rejected",
              count: campaigns.filter((c) => c.status === "rejected").length,
            },
          ]}
        />

        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconSpeakerphone />}
            title="No campaigns here"
            description="Create a campaign to reach viewers across films, education, news and creator content."
            action={{ label: "New campaign", href: "/business/campaigns/new" }}
          />
        ) : (
          <div className="space-y-4">
            {filtered.map((campaign) => {
              const spendPercent =
                campaign.budget.amount > 0
                  ? (campaign.spend.amount / campaign.budget.amount) * 100
                  : 0;
              return (
                <Card key={campaign.id}>
                  <CardHeader
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        {campaign.name}
                        <CampaignStatusBadge status={campaign.status} size="sm" />
                        <Badge tone="outline" size="sm">
                          {campaign.objective}
                        </Badge>
                      </span>
                    }
                    description={`${formatDate(campaign.startDate)} → ${formatDate(campaign.endDate)} · ${campaign.advertiserName}`}
                    action={
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setDetail(campaign)}
                        >
                          Details
                        </Button>
                        {campaign.status === "active" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              updateStatus.mutate({
                                id: campaign.id,
                                status: "paused",
                                reason: "Paused by advertiser",
                              });
                              toast({ title: "Campaign paused" });
                            }}
                          >
                            <IconPlayerPause />
                            Pause
                          </Button>
                        ) : null}
                        {campaign.status === "paused" ? (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              updateStatus.mutate({
                                id: campaign.id,
                                status: "active",
                                reason: "Resumed by advertiser",
                              });
                              toast({ title: "Campaign resumed" });
                            }}
                          >
                            <IconPlayerPlay />
                            Resume
                          </Button>
                        ) : null}
                      </div>
                    }
                  />
                  <CardBody className="space-y-4">
                    <ProgressBar
                      value={spendPercent}
                      label="Budget used"
                      valueLabel={`${formatCurrency(campaign.spend.amount)} of ${formatCurrency(campaign.budget.amount)}`}
                      tone={spendPercent > 90 ? "warning" : "accent"}
                    />

                    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                      <Metric
                        label="Impressions"
                        value={compactNumber(campaign.metrics.impressions)}
                      />
                      <Metric
                        label="Completed views"
                        value={compactNumber(campaign.metrics.completedViews)}
                      />
                      <Metric label="Clicks" value={compactNumber(campaign.metrics.clicks)} />
                      <Metric label="CTR" value={formatPercent(campaign.metrics.ctr, 1)} />
                      <Metric
                        label="Conversions"
                        value={compactNumber(campaign.metrics.conversions)}
                      />
                      <Metric
                        label="CPM"
                        value={formatCurrency(campaign.metrics.cpm)}
                      />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {campaign.targeting.countries.map((code) => (
                        <Badge key={code} tone="neutral" size="sm">
                          {code}
                        </Badge>
                      ))}
                      {campaign.placements.map((placement) => (
                        <Badge key={placement} tone="outline" size="sm">
                          {placement}
                        </Badge>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </PageBody>

      <CampaignDetail campaign={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-surface-2 p-2.5">
      <p className="text-2xs uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-fg nx-tnum">{value}</p>
    </div>
  );
}

function CampaignDetail({
  campaign,
  onClose,
}: {
  campaign: Campaign | null;
  onClose: () => void;
}) {
  const { data: series = [] } = useCampaignSeries(campaign?.id ?? "");

  return (
    <Modal
      open={Boolean(campaign)}
      onClose={onClose}
      title={campaign?.name}
      description={
        campaign
          ? `${campaign.objective} · ${formatDate(campaign.startDate)} → ${formatDate(campaign.endDate)}`
          : undefined
      }
      size="xl"
    >
      {campaign ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="Spend"
              value={formatCurrency(campaign.spend.amount, "AUD", { compact: true })}
            />
            <Stat
              label="Impressions"
              value={compactNumber(campaign.metrics.impressions)}
            />
            <Stat label="CTR" value={formatPercent(campaign.metrics.ctr, 1)} />
            <Stat
              label="Conversions"
              value={compactNumber(campaign.metrics.conversions)}
            />
          </div>

          {series.length > 0 ? (
            <Card>
              <CardHeader title="Delivery" description="Impressions and clicks by day" />
              <CardBody>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series}>
                      <CartesianGrid {...chartGrid} />
                      <XAxis
                        dataKey="date"
                        {...chartAxis}
                        tickFormatter={(value: string) => formatDate(value, "short")}
                        minTickGap={24}
                      />
                      <YAxis {...chartAxis} tickFormatter={compactNumber} width={44} />
                      <Tooltip
                        {...chartTooltip}
                        labelFormatter={(value) => formatDate(String(value), "long")}
                      />
                      <Bar
                        dataKey="impressions"
                        name="Impressions"
                        fill={CHART_COLORS[1]}
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
          ) : null}

          {series.length > 0 ? (
            <Card>
              <CardHeader title="Conversions" />
              <CardBody>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series}>
                      <CartesianGrid {...chartGrid} />
                      <XAxis
                        dataKey="date"
                        {...chartAxis}
                        tickFormatter={(value: string) => formatDate(value, "short")}
                        minTickGap={24}
                      />
                      <YAxis {...chartAxis} width={40} />
                      <Tooltip {...chartTooltip} />
                      <Line
                        type="monotone"
                        dataKey="conversions"
                        stroke={CHART_COLORS[2]}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader title="Targeting" />
              <CardBody className="space-y-2 text-sm">
                <DetailRow label="Countries" value={campaign.targeting.countries.join(", ")} />
                <DetailRow label="Languages" value={campaign.targeting.languages.join(", ")} />
                <DetailRow
                  label="Age bands"
                  value={campaign.targeting.ageBands.join(", ") || "All"}
                />
                <DetailRow
                  label="Interests"
                  value={campaign.targeting.interests.join(", ") || "All"}
                />
                <DetailRow
                  label="Devices"
                  value={campaign.targeting.devices.join(", ") || "All"}
                />
                <DetailRow
                  label="Frequency cap"
                  value={`${campaign.frequencyCap.impressions} per ${campaign.frequencyCap.perHours}h`}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Brand safety" />
              <CardBody className="space-y-2 text-sm">
                <DetailRow
                  label="Excluded labels"
                  value={campaign.brandSafety.excludedLabels.join(", ") || "None"}
                />
                <DetailRow
                  label="Min age rating"
                  value={campaign.brandSafety.minAgeRating}
                />
                <DetailRow
                  label="User-generated"
                  value={campaign.brandSafety.blockUserGenerated ? "Excluded" : "Included"}
                />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Creatives" />
            <CardBody>
              {campaign.creatives.length === 0 ? (
                <p className="text-sm text-fg-subtle">No creatives attached.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {campaign.creatives.map((creative) => (
                    <li
                      key={creative.id}
                      className="flex items-center gap-3 rounded border border-border p-2.5"
                    >
                      <span
                        aria-hidden
                        className="h-12 w-20 shrink-0 rounded"
                        style={{
                          backgroundImage: `linear-gradient(140deg, ${creative.gradient[0]}, ${creative.gradient[1]})`,
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">
                          {creative.name}
                        </span>
                        <span className="mt-0.5 block text-2xs text-fg-subtle">
                          {creative.format} · {creative.durationSeconds}s ·{" "}
                          {creative.clickThroughLabel}
                        </span>
                      </span>
                      <Badge
                        tone={
                          creative.status === "approved"
                            ? "published"
                            : creative.status === "pending"
                              ? "pending"
                              : "rejected"
                        }
                        size="sm"
                      >
                        {creative.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-32 shrink-0 text-fg-subtle">{label}</span>
      <span className="min-w-0 text-fg">{value}</span>
    </div>
  );
}
