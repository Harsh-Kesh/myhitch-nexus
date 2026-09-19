"use client";

import {
  IconClockHour4,
  IconCoin,
  IconDownload,
  IconEye,
  IconPercentage,
  IconUsers,
} from "@tabler/icons-react";
import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress";
import { Select } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import {
  CHART_COLORS,
  chartAxis,
  chartGrid,
  chartTooltip,
} from "@/components/charts/chart-theme";
import { RANGE_LABELS } from "@/lib/mock-api/data/analytics";
import { looksLikeRealId } from "@/lib/mock-api";
import { useCreatorAnalytics, useCurrentUser } from "@/lib/mock-api/hooks";
import type { AnalyticsRange, BreakdownSlice } from "@/lib/mock-api/types";
import {
  compactNumber,
  formatCurrency,
  formatDate,
  formatDuration,
  formatPercent,
  formatWatchHours,
} from "@/lib/utils";

export default function StudioAnalyticsPage() {
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId ?? "ch_mara";
  const isRealChannel = looksLikeRealId(channelId);
  const { toast } = useToast();

  const [range, setRange] = React.useState<AnalyticsRange>("28d");
  const [tab, setTab] = React.useState("overview");

  const { data, isLoading } = useCreatorAnalytics(channelId, range);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Audience, retention and revenue for your channel."
        actions={
          <>
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                toast({
                  title: "Report scheduled",
                  description:
                    "A weekly CSV would be emailed on Mondays. Mock action — no email is sent.",
                  tone: "info",
                })
              }
            >
              <IconDownload />
              Export / schedule
            </Button>
          </>
        }
      >
        <Tabs
          value={tab}
          onChange={setTab}
          variant="pill"
          items={[
            { value: "overview", label: "Overview" },
            { value: "audience", label: "Audience" },
            { value: "retention", label: "Retention" },
            { value: "revenue", label: "Revenue" },
          ]}
        />
      </PageHeader>

      <PageBody className="space-y-6">
        {isLoading || !data ? (
          <RailSkeleton count={4} />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
                icon={<IconClockHour4 />}
              />
              <Stat
                label="Unique viewers"
                value={compactNumber(data.totals.uniqueViewers)}
                delta={data.deltas.uniqueViewers}
                icon={<IconUsers />}
              />
              <Stat
                label="Avg. view duration"
                value={formatDuration(data.totals.averageViewDuration)}
                hint={`${formatPercent(data.totals.completionRate, 0)} completion`}
                icon={<IconPercentage />}
              />
              <Stat
                label="Revenue"
                value={formatCurrency(data.totals.revenue.amount, "GBP", {
                  compact: true,
                })}
                delta={data.deltas.revenue}
                icon={<IconCoin />}
              />
            </div>

            {/* ------------------------------ Overview ---------------------- */}
            {tab === "overview" ? (
              <>
                <Card>
                  <CardHeader
                    title="Views, watch time and unique viewers"
                    description={RANGE_LABELS[range]}
                  />
                  <CardBody>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.timeSeries}>
                          <defs>
                            <linearGradient id="a1" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="a2" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={CHART_COLORS[1]} stopOpacity={0.3} />
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
                            stroke={CHART_COLORS[0]}
                            strokeWidth={2}
                            fill="url(#a1)"
                          />
                          <Area
                            type="monotone"
                            dataKey="uniqueViewers"
                            name="Unique viewers"
                            stroke={CHART_COLORS[1]}
                            strokeWidth={2}
                            fill="url(#a2)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardBody>
                </Card>

                <div className="grid gap-5 lg:grid-cols-2">
                  <Card>
                    <CardHeader
                      title="Traffic sources"
                      description="Where views came from"
                    />
                    <CardBody>
                      <BreakdownList
                        slices={data.trafficSources}
                        emptyHint="Real referrer/source tracking isn't captured yet."
                      />
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader title="Top videos" description="By views in range" />
                    <CardBody className={data.topVideos.length === 0 ? undefined : "p-0"}>
                      {data.topVideos.length === 0 ? (
                        <EmptyState compact title="No views in this range yet" />
                      ) : (
                      <ul className="divide-y divide-border">
                        {data.topVideos.map((row, index) => (
                          <li key={row.videoId} className="flex items-center gap-3 px-5 py-3">
                            <span className="w-4 text-center text-xs text-fg-subtle nx-tnum">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-fg">
                                {row.title}
                              </span>
                              <span className="mt-0.5 block text-2xs text-fg-subtle nx-tnum">
                                {compactNumber(row.watchHours)} watch hours
                              </span>
                            </span>
                            <span className="shrink-0 text-sm text-fg nx-tnum">
                              {compactNumber(row.views)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      )}
                    </CardBody>
                  </Card>
                </div>
              </>
            ) : null}

            {/* ------------------------------ Audience ---------------------- */}
            {tab === "audience" ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Countries" />
                  <CardBody>
                    <BreakdownList
                      slices={data.countries}
                      emptyHint="Real viewer location needs IP-based geolocation, not built in this pass."
                    />
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Languages" />
                  <CardBody>
                    <BreakdownList
                      slices={data.languages}
                      emptyHint="Real audience-language tracking isn't captured yet."
                    />
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Devices" />
                  <CardBody>
                    {data.devices.length === 0 ? (
                      <EmptyState
                        compact
                        title="Not tracked yet"
                        description="Real device/browser tracking isn't captured yet."
                      />
                    ) : (
                      <>
                        <div className="h-64">
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
                <Card>
                  <CardHeader
                    title="Subscribers"
                    description={RANGE_LABELS[range]}
                  />
                  <CardBody className="space-y-4">
                    <div className="flex gap-4">
                      <Stat
                        label="Gained"
                        value={`+${compactNumber(data.totals.subscribersGained)}`}
                        className="flex-1 border-0 p-0"
                      />
                      {isRealChannel ? null : (
                        <>
                          <Stat
                            label="Lost"
                            value={`−${compactNumber(data.totals.subscribersLost)}`}
                            className="flex-1 border-0 p-0"
                          />
                          <Stat
                            label="Net"
                            value={`+${compactNumber(
                              data.totals.subscribersGained - data.totals.subscribersLost,
                            )}`}
                            className="flex-1 border-0 p-0"
                          />
                        </>
                      )}
                    </div>
                    {isRealChannel ? (
                      <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-subtle">
                        &ldquo;Gained&rdquo; is real (real follows in this period).
                        Unfollowing doesn&apos;t keep a history today, so &ldquo;Lost&rdquo;
                        and &ldquo;Net&rdquo; aren&apos;t shown rather than assumed zero.
                      </p>
                    ) : (
                      <div className="h-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={data.timeSeries.slice(-14)}>
                            <CartesianGrid {...chartGrid} />
                            <XAxis
                              dataKey="date"
                              {...chartAxis}
                              tickFormatter={(value: string) => formatDate(value, "short")}
                              minTickGap={20}
                            />
                            <YAxis {...chartAxis} tickFormatter={compactNumber} width={40} />
                            <Tooltip {...chartTooltip} />
                            <Bar
                              dataKey="uniqueViewers"
                              name="Unique viewers"
                              fill={CHART_COLORS[2]}
                              radius={[3, 3, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardBody>
                </Card>
              </div>
            ) : null}

            {/* ----------------------------- Retention ---------------------- */}
            {tab === "retention" ? (
              <Card>
                <CardHeader
                  title="Audience retention"
                  description="Percentage of viewers still watching at each point in the video."
                />
                <CardBody>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.retention}>
                        <CartesianGrid {...chartGrid} />
                        <XAxis
                          dataKey="percent"
                          {...chartAxis}
                          tickFormatter={(value: number) => `${value}%`}
                        />
                        <YAxis
                          {...chartAxis}
                          domain={[0, 100]}
                          tickFormatter={(value: number) => `${value}%`}
                          width={40}
                        />
                        <Tooltip
                          {...chartTooltip}
                          labelFormatter={(value) => `${value}% through`}
                          formatter={(value: number) => [`${value}%`, "Still watching"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="audience"
                          stroke={CHART_COLORS[0]}
                          strokeWidth={2.5}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <Stat
                      label="Intro drop-off"
                      value={formatPercent(
                        100 - (data.retention[5]?.audience ?? 100),
                        0,
                      )}
                      hint="Lost in the first 10%"
                    />
                    <Stat
                      label="Half-way retention"
                      value={formatPercent(data.retention[25]?.audience ?? 0, 0)}
                    />
                    <Stat
                      label="Completion rate"
                      value={formatPercent(data.totals.completionRate, 0)}
                    />
                  </div>
                </CardBody>
              </Card>
            ) : null}

            {/* ------------------------------ Revenue ----------------------- */}
            {tab === "revenue" ? (
              <div className="space-y-5">
                <Card>
                  <CardHeader
                    title="Revenue by content"
                    description={isRealChannel ? "Net, after platform commission" : "Gross before platform commission"}
                  />
                  <CardBody className={data.revenueByContent.length === 0 ? undefined : "p-0"}>
                    {data.revenueByContent.length === 0 ? (
                      <EmptyState compact title="No revenue in this range yet" />
                    ) : (
                    <ul className="divide-y divide-border">
                      {data.revenueByContent.map((row) => (
                        <li key={row.videoId} className="flex items-center gap-4 px-5 py-3">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-fg">
                              {row.title}
                            </span>
                            <span className="mt-0.5 flex items-center gap-2 text-2xs text-fg-subtle">
                              <Badge tone="outline" size="sm">
                                {row.model.replace("-", " ")}
                              </Badge>
                              <span className="nx-tnum">
                                {compactNumber(row.views)} views
                              </span>
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-medium text-fg nx-tnum">
                            {formatCurrency(row.revenue)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    )}
                  </CardBody>
                </Card>

                <div className="grid gap-5 lg:grid-cols-2">
                  <Card>
                    <CardHeader title="Revenue over time" />
                    <CardBody>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={data.timeSeries}>
                            <CartesianGrid {...chartGrid} />
                            <XAxis
                              dataKey="date"
                              {...chartAxis}
                              tickFormatter={(value: string) => formatDate(value, "short")}
                              minTickGap={28}
                            />
                            <YAxis
                              {...chartAxis}
                              width={52}
                              tickFormatter={(value: number) =>
                                formatCurrency(value, "GBP", { compact: true })
                              }
                            />
                            <Tooltip
                              {...chartTooltip}
                              formatter={(value: number) => [
                                formatCurrency(value),
                                "Revenue",
                              ]}
                              labelFormatter={(value) => formatDate(String(value), "long")}
                            />
                            <Bar
                              dataKey="revenue"
                              fill={CHART_COLORS[4]}
                              radius={[3, 3, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader
                      title="Advertising performance"
                      description="Ads served against your content"
                    />
                    <CardBody className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <Stat
                          label="Impressions"
                          value={compactNumber(data.adPerformance.impressions)}
                          className="border-0 p-0"
                        />
                        <Stat
                          label="Fill rate"
                          value={formatPercent(data.adPerformance.fillRate)}
                          className="border-0 p-0"
                        />
                        <Stat
                          label="eCPM"
                          value={`£${data.adPerformance.ecpm.toFixed(2)}`}
                          className="border-0 p-0"
                        />
                        <Stat
                          label="Ad revenue"
                          value={formatCurrency(data.adPerformance.revenue, "GBP", {
                            compact: true,
                          })}
                          className="border-0 p-0"
                        />
                      </div>
                      <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-subtle">
                        {isRealChannel
                          ? "Real advertising isn't built yet — no ad server, targeting or measurement provider exists in this build, so these are honestly zero rather than estimated."
                          : "Advertising figures are simulated. No ad server, targeting or measurement provider is contacted anywhere in this build."}
                      </p>
                    </CardBody>
                  </Card>
                </div>
              </div>
            ) : null}
          </>
        )}
      </PageBody>
    </>
  );
}

function BreakdownList({
  slices,
  emptyHint,
}: {
  slices: BreakdownSlice[];
  emptyHint?: string;
}) {
  if (slices.length === 0) {
    return <EmptyState compact title="Not tracked yet" description={emptyHint} />;
  }
  return (
    <ul className="space-y-3">
      {slices.map((slice, index) => (
        <li key={slice.label}>
          <ProgressBar
            value={slice.share}
            label={slice.label}
            valueLabel={`${slice.share}% · ${compactNumber(slice.value)}`}
            size="sm"
            tone={index === 0 ? "accent" : "info"}
          />
        </li>
      ))}
    </ul>
  );
}
