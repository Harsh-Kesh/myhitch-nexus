"use client";

import { IconClockHour4, IconDownload, IconEye, IconPercentage, IconUsers } from "@tabler/icons-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress";
import { Select } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { CHART_COLORS, chartAxis, chartGrid, chartTooltip } from "@/components/charts/chart-theme";
import { csvSection, downloadCsv } from "@/lib/csv";
import { RANGE_LABELS } from "@/lib/mock-api/data/analytics";
import { useAdminAnalytics } from "@/lib/mock-api/hooks";
import type { AnalyticsRange } from "@/lib/mock-api/types";
import { compactNumber, formatDate, formatDuration, formatPercent, formatWatchHours } from "@/lib/utils";

export default function AdminAnalyticsPage() {
  const { toast } = useToast();
  const [range, setRange] = React.useState<AnalyticsRange>("28d");
  const [tab, setTab] = React.useState("overview");
  const { data, isLoading } = useAdminAnalytics(range);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Platform-wide views, watch time and audience — engagement only. Revenue lives on the Finance page."
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
              disabled={!data}
              onClick={() => {
                if (!data) return;
                const sections = [
                  csvSection(
                    "Summary",
                    ["Metric", "Value"],
                    [
                      ["Range", RANGE_LABELS[range]],
                      ["Views", data.totals.views],
                      ["Watch time (seconds)", data.totals.watchTimeSeconds],
                      ["Unique viewers", data.totals.uniqueViewers],
                      ["Avg. view duration (seconds)", data.totals.averageViewDuration],
                      ["Completion rate (%)", data.totals.completionRate],
                    ],
                  ),
                  csvSection(
                    "Time series",
                    ["Date", "Views", "Watch hours", "Unique viewers"],
                    data.timeSeries.map((point) => [point.date, point.views, point.watchHours, point.uniqueViewers]),
                  ),
                  csvSection(
                    "Top videos",
                    ["Title", "Channel", "Views", "Watch hours", "Completion rate"],
                    data.topVideos.map((row) => [row.title, row.channelName, row.views, row.watchHours, `${row.completionRate}%`]),
                  ),
                  csvSection(
                    "Top channels",
                    ["Channel", "Views", "Watch hours"],
                    data.topChannels.map((row) => [row.channelName, row.views, row.watchHours]),
                  ),
                  csvSection("Countries", ["Country", "Share", "Views"], data.countries.map((s) => [s.label, `${s.share}%`, s.value])),
                  csvSection("Devices", ["Device", "Share", "Views"], data.devices.map((s) => [s.label, `${s.share}%`, s.value])),
                  csvSection("Languages", ["Language", "Share", "Views"], data.languages.map((s) => [s.label, `${s.share}%`, s.value])),
                ];
                downloadCsv(`platform-analytics-${new Date().toISOString().slice(0, 10)}.csv`, sections);
                toast({ title: "Report exported" });
              }}
            >
              <IconDownload />
              Export
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
          ]}
        />
      </PageHeader>

      <PageBody className="space-y-6">
        {isLoading || !data ? (
          <RailSkeleton count={4} />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Views" value={compactNumber(data.totals.views)} delta={data.deltas.views} icon={<IconEye />} />
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
            </div>

            {tab === "overview" ? (
              <>
                <Card>
                  <CardHeader title="Views and unique viewers" description={RANGE_LABELS[range]} />
                  <CardBody>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.timeSeries}>
                          <defs>
                            <linearGradient id="admin-a1" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="admin-a2" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={CHART_COLORS[1]} stopOpacity={0.3} />
                              <stop offset="100%" stopColor={CHART_COLORS[1]} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid {...chartGrid} />
                          <XAxis dataKey="date" {...chartAxis} tickFormatter={(value: string) => formatDate(value, "short")} minTickGap={28} />
                          <YAxis {...chartAxis} tickFormatter={compactNumber} width={44} />
                          <Tooltip {...chartTooltip} labelFormatter={(value) => formatDate(String(value), "long")} />
                          <Area type="monotone" dataKey="views" name="Views" stroke={CHART_COLORS[0]} strokeWidth={2} fill="url(#admin-a1)" />
                          <Area
                            type="monotone"
                            dataKey="uniqueViewers"
                            name="Unique viewers"
                            stroke={CHART_COLORS[1]}
                            strokeWidth={2}
                            fill="url(#admin-a2)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardBody>
                </Card>

                <div className="grid gap-5 lg:grid-cols-2">
                  <Card>
                    <CardHeader title="Top videos" description="By views in range" />
                    <CardBody className={data.topVideos.length === 0 ? undefined : "p-0"}>
                      {data.topVideos.length === 0 ? (
                        <EmptyState compact title="No views in this range yet" />
                      ) : (
                        <ul className="divide-y divide-border">
                          {data.topVideos.map((row, index) => (
                            <li key={row.videoId} className="flex items-center gap-3 px-5 py-3">
                              <span className="w-4 text-center text-xs text-fg-subtle nx-tnum">{index + 1}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-fg">{row.title}</span>
                                <span className="mt-0.5 block text-2xs text-fg-subtle">
                                  {row.channelName} · {compactNumber(row.watchHours)} watch hours
                                </span>
                              </span>
                              <span className="shrink-0 text-sm text-fg nx-tnum">{compactNumber(row.views)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader title="Top channels" description="By views in range" />
                    <CardBody className={data.topChannels.length === 0 ? undefined : "p-0"}>
                      {data.topChannels.length === 0 ? (
                        <EmptyState compact title="No views in this range yet" />
                      ) : (
                        <ul className="divide-y divide-border">
                          {data.topChannels.map((row, index) => (
                            <li key={row.channelId} className="flex items-center gap-3 px-5 py-3">
                              <span className="w-4 text-center text-xs text-fg-subtle nx-tnum">{index + 1}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-fg">{row.channelName}</span>
                                <span className="mt-0.5 block text-2xs text-fg-subtle">
                                  {compactNumber(row.watchHours)} watch hours
                                </span>
                              </span>
                              <span className="shrink-0 text-sm text-fg nx-tnum">{compactNumber(row.views)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardBody>
                  </Card>
                </div>
              </>
            ) : null}

            {tab === "audience" ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Countries" />
                  <CardBody>
                    <BreakdownList
                      slices={data.countries}
                      emptyHint="Real viewer location is captured, but this range doesn't have enough viewers platform-wide to show a breakdown without risking identifying someone."
                    />
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Languages" />
                  <CardBody>
                    <BreakdownList
                      slices={data.languages}
                      emptyHint="Real audience language is captured, but this range doesn't have enough viewers platform-wide to show a breakdown without risking identifying someone."
                    />
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Devices" />
                  <CardBody>
                    {data.devices.length === 0 ? (
                      <EmptyState
                        compact
                        title="Not enough viewers yet"
                        description="Real device tracking is captured, but this range doesn't have enough viewers platform-wide to show a breakdown without risking identifying someone."
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
                                  <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip {...chartTooltip} formatter={(value: number) => compactNumber(value)} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3">
                          {data.devices.map((slice, index) => (
                            <span key={slice.label} className="flex items-center gap-1.5 text-xs text-fg-muted">
                              <span
                                aria-hidden
                                className="size-2.5 rounded-sm"
                                style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
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
  slices: Array<{ label: string; value: number; share: number }>;
  emptyHint?: string;
}) {
  if (slices.length === 0) {
    return <EmptyState compact title="Not enough viewers yet" description={emptyHint} />;
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
