"use client";

import { IconClick, IconEye, IconTargetArrow, IconUsers } from "@tabler/icons-react";
import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { ProgressBar } from "@/components/ui/progress";
import {
  CHART_COLORS,
  chartAxis,
  chartGrid,
  chartTooltip,
} from "@/components/charts/chart-theme";
import { RANGE_LABELS } from "@/lib/mock-api/data/analytics";
import { looksLikeRealId } from "@/lib/mock-api";
import {
  useCampaigns,
  useCreatorAnalytics,
  useCurrentUser,
  useProductLinks,
} from "@/lib/mock-api/hooks";
import type { AnalyticsRange } from "@/lib/mock-api/types";
import {
  compactNumber,
  formatCurrency,
  formatDate,
  formatPercent,
  formatWatchHours,
} from "@/lib/utils";

// Same fallback business/channel/page.tsx uses for a mock/demo account with no real
// channel of its own.
const MOCK_BUSINESS_CHANNEL = "ch_helio";

export default function BusinessAnalyticsPage() {
  const [range, setRange] = React.useState<AnalyticsRange>("28d");
  const { data: user } = useCurrentUser();
  // Real bug fixed 2026-09-19: this page always analyzed the mock "ch_helio" channel
  // regardless of who was signed in — a real business account saw someone else's data,
  // not even a mock view of its own. Same real/mock resolution as business/channel/page.tsx.
  const channelId =
    user?.channelId && looksLikeRealId(user.channelId) ? user.channelId : MOCK_BUSINESS_CHANNEL;
  const isRealChannel = looksLikeRealId(channelId);
  const { data, isLoading } = useCreatorAnalytics(channelId, range);
  const { data: campaigns = [] } = useCampaigns(channelId);
  const { data: productLinks = [] } = useProductLinks(channelId);

  const adTotals = campaigns.reduce(
    (acc, campaign) => ({
      impressions: acc.impressions + campaign.metrics.impressions,
      clicks: acc.clicks + campaign.metrics.clicks,
      conversions: acc.conversions + campaign.metrics.conversions,
      spend: acc.spend + campaign.spend.amount,
    }),
    { impressions: 0, clicks: 0, conversions: 0, spend: 0 },
  );

  const commerceTotals = productLinks.reduce(
    (acc, link) => ({
      clicks: acc.clicks + link.clicks,
      conversions: acc.conversions + link.conversions,
    }),
    { clicks: 0, conversions: 0 },
  );

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Channel performance, advertising delivery and commerce attribution in one view."
        actions={
          <Select
            value={range}
            onChange={(event) => setRange(event.target.value as AnalyticsRange)}
            sizeVariant="sm"
            className="w-44"
            aria-label="Date range"
          >
            {(Object.keys(RANGE_LABELS) as AnalyticsRange[]).map((key) => (
              <option key={key} value={key}>
                {RANGE_LABELS[key]}
              </option>
            ))}
          </Select>
        }
      />

      <PageBody className="space-y-6">
        {isLoading || !data ? (
          <RailSkeleton count={4} />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Views"
                value={compactNumber(data.totals.views)}
                delta={data.deltas.views}
                icon={<IconEye />}
              />
              <Stat
                label="Watch time"
                value={formatWatchHours(data.totals.watchTimeSeconds)}
                delta={data.deltas.watchTime}
              />
              <Stat
                label="Unique viewers"
                value={compactNumber(data.totals.uniqueViewers)}
                delta={data.deltas.uniqueViewers}
                icon={<IconUsers />}
              />
              <Stat
                label="Completion"
                value={formatPercent(data.totals.completionRate, 0)}
              />
            </div>

            <Card>
              <CardHeader
                title="Audience over time"
                description={RANGE_LABELS[range]}
              />
              <CardBody>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.timeSeries}>
                      <defs>
                        <linearGradient id="bizFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CHART_COLORS[1]} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={CHART_COLORS[1]} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...chartGrid} />
                      <XAxis
                        dataKey="date"
                        {...chartAxis}
                        tickFormatter={(value: string) => formatDate(value, "short")}
                        minTickGap={28}
                      />
                      <YAxis {...chartAxis} tickFormatter={compactNumber} width={44} />
                      <Tooltip
                        {...chartTooltip}
                        labelFormatter={(value) => formatDate(String(value), "long")}
                      />
                      <Area
                        type="monotone"
                        dataKey="views"
                        name="Views"
                        stroke={CHART_COLORS[1]}
                        strokeWidth={2}
                        fill="url(#bizFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Advertising performance"
                  description="Across all campaigns from this account"
                />
                <CardBody className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Stat
                      label="Impressions"
                      value={compactNumber(adTotals.impressions)}
                      className="border-0 p-0"
                    />
                    <Stat
                      label="Clicks"
                      value={compactNumber(adTotals.clicks)}
                      className="border-0 p-0"
                      icon={<IconClick />}
                    />
                    <Stat
                      label="Conversions"
                      value={compactNumber(adTotals.conversions)}
                      className="border-0 p-0"
                      icon={<IconTargetArrow />}
                    />
                    <Stat
                      label="Spend"
                      value={formatCurrency(adTotals.spend, "GBP", { compact: true })}
                      className="border-0 p-0"
                    />
                  </div>
                  <ProgressBar
                    value={
                      adTotals.impressions
                        ? (adTotals.clicks / adTotals.impressions) * 100 * 20
                        : 0
                    }
                    label="Click-through rate"
                    valueLabel={formatPercent(
                      adTotals.impressions
                        ? (adTotals.clicks / adTotals.impressions) * 100
                        : 0,
                      2,
                    )}
                    size="sm"
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Commerce attribution"
                  description="Product-link performance across your videos"
                />
                <CardBody className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Stat
                      label="Link clicks"
                      value={compactNumber(commerceTotals.clicks)}
                      className="border-0 p-0"
                    />
                    <Stat
                      label="Conversions"
                      value={compactNumber(commerceTotals.conversions)}
                      className="border-0 p-0"
                    />
                  </div>
                  <ul className="space-y-2.5">
                    {productLinks.map((link, index) => (
                      <li key={link.id}>
                        <ProgressBar
                          value={
                            commerceTotals.clicks
                              ? (link.clicks / commerceTotals.clicks) * 100
                              : 0
                          }
                          label={link.productName}
                          valueLabel={`${compactNumber(link.clicks)} clicks`}
                          size="sm"
                          tone={index === 0 ? "accent" : "info"}
                        />
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Audience by country" />
                <CardBody>
                  {data.countries.length === 0 ? (
                    <EmptyState
                      compact
                      title={isRealChannel ? "Not tracked yet" : "No data"}
                      description={
                        isRealChannel
                          ? "Real viewer location isn't captured yet — this needs real IP-based geolocation, not built in this pass."
                          : undefined
                      }
                    />
                  ) : (
                    <ul className="space-y-3">
                      {data.countries.map((slice, index) => (
                        <li key={slice.label}>
                          <ProgressBar
                            value={slice.share}
                            label={slice.label}
                            valueLabel={`${slice.share}%`}
                            size="sm"
                            tone={index === 0 ? "accent" : "info"}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Devices" />
                <CardBody>
                  {data.devices.length === 0 ? (
                    <EmptyState
                      compact
                      title={isRealChannel ? "Not tracked yet" : "No data"}
                      description={
                        isRealChannel
                          ? "Real device/browser breakdown isn't captured yet — no client-side instrumentation for it exists."
                          : undefined
                      }
                    />
                  ) : (
                    <>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={data.devices}
                              dataKey="value"
                              nameKey="label"
                              innerRadius="55%"
                              outerRadius="82%"
                              paddingAngle={2}
                              stroke="none"
                            >
                              {data.devices.map((_, index) => (
                                <Cell
                                  key={index}
                                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              {...chartTooltip}
                              formatter={(value: number) => compactNumber(value)}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3">
                        {data.devices.map((slice, index) => (
                          <span
                            key={slice.label}
                            className="flex items-center gap-1.5 text-xs text-fg-muted"
                          >
                            <span
                              aria-hidden
                              className="size-2.5 rounded-sm"
                              style={{
                                background: CHART_COLORS[index % CHART_COLORS.length],
                              }}
                            />
                            {slice.label}
                            <span className="text-fg-subtle nx-tnum">{slice.share}%</span>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </CardBody>
              </Card>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
