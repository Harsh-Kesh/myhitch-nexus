"use client";

import {
  IconBroadcast,
  IconClockHour4,
  IconCoin,
  IconEye,
  IconMessage,
  IconUpload,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge, LiveBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { chartAxis, chartTooltip } from "@/components/charts/chart-theme";
import {
  useChannelLiveEvents,
  useChannelVideos,
  useCreatorAnalytics,
  useCurrentUser,
  useModerationComments,
} from "@/lib/mock-api/hooks";
import {
  compactNumber,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatWatchHours,
  relativeTime,
} from "@/lib/utils";

export default function StudioDashboardPage() {
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId ?? "ch_mara";

  const { data: analytics, isLoading } = useCreatorAnalytics(channelId, "28d");
  const { data: videos = [] } = useChannelVideos(channelId, true);
  const { data: comments = [] } = useModerationComments(channelId);
  const { data: liveEvents = [] } = useChannelLiveEvents(channelId);

  const drafts = videos.filter((video) => video.status === "draft");
  const pending = videos.filter((video) => video.status === "pending");
  const held = comments.filter((comment) => comment.status === "held");
  const liveNow = liveEvents.find((event) => event.status === "live");

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(" ")[0] ?? "creator"}`}
        description="Last 28 days across your channel."
        actions={
          <>
            <Button variant="secondary" href="/studio/live">
              <IconBroadcast />
              Go live
            </Button>
            <Button variant="primary" href="/studio/upload">
              <IconUpload />
              Upload
            </Button>
          </>
        }
      />

      <PageBody className="space-y-6">
        {/* Attention strip */}
        {(pending.length > 0 || held.length > 0 || drafts.length > 0 || liveNow) && (
          <div className="flex flex-wrap gap-2">
            {liveNow ? (
              <Link href={`/live/${liveNow.id}`}>
                <Card interactive className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <LiveBadge size="sm" />
                  <span className="text-sm text-fg">
                    {liveNow.title} · {compactNumber(liveNow.viewerCount)} watching
                  </span>
                </Card>
              </Link>
            ) : null}
            {pending.length > 0 ? (
              <Link href="/studio/content">
                <Card interactive className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <StatusBadge status="pending" size="sm" />
                  <span className="text-sm text-fg">
                    {pending.length} awaiting review
                  </span>
                </Card>
              </Link>
            ) : null}
            {held.length > 0 ? (
              <Link href="/studio/comments">
                <Card interactive className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <Badge tone="warning" size="sm">
                    <IconMessage />
                    {held.length} held
                  </Badge>
                  <span className="text-sm text-fg">comments need a decision</span>
                </Card>
              </Link>
            ) : null}
            {drafts.length > 0 ? (
              <Link href="/studio/content">
                <Card interactive className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <StatusBadge status="draft" size="sm" />
                  <span className="text-sm text-fg">{drafts.length} unfinished</span>
                </Card>
              </Link>
            ) : null}
          </div>
        )}

        {/* Stats */}
        {isLoading || !analytics ? (
          <RailSkeleton count={4} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Views"
              value={compactNumber(analytics.totals.views)}
              delta={analytics.deltas.views}
              icon={<IconEye />}
            />
            <Stat
              label="Watch time"
              value={formatWatchHours(analytics.totals.watchTimeSeconds)}
              delta={analytics.deltas.watchTime}
              icon={<IconClockHour4 />}
            />
            <Stat
              label="Unique viewers"
              value={compactNumber(analytics.totals.uniqueViewers)}
              delta={analytics.deltas.uniqueViewers}
              icon={<IconUsers />}
            />
            <Stat
              label="Estimated revenue"
              value={formatCurrency(analytics.totals.revenue.amount, "AUD", {
                compact: true,
              })}
              delta={analytics.deltas.revenue}
              icon={<IconCoin />}
            />
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          {/* Views chart */}
          <Card>
            <CardHeader
              title="Views and watch time"
              description="Daily, last 28 days"
              action={
                <Button variant="ghost" size="sm" href="/studio/analytics">
                  Full analytics
                </Button>
              }
            />
            <CardBody>
              {analytics ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.timeSeries}>
                      <defs>
                        <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor="rgb(var(--nx-chart-1))"
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="100%"
                            stopColor="rgb(var(--nx-chart-1))"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgb(var(--nx-border))"
                        vertical={false}
                      />
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
                        formatter={(value: number) => [compactNumber(value), "Views"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="views"
                        stroke="rgb(var(--nx-chart-1))"
                        strokeWidth={2}
                        fill="url(#viewsFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </CardBody>
          </Card>

          {/* Top videos */}
          <Card>
            <CardHeader title="Top performing" description="By views, last 28 days" />
            <CardBody className="p-0">
              {analytics?.topVideos.length ? (
                <ul className="divide-y divide-border">
                  {analytics.topVideos.map((row, index) => (
                    <li key={row.videoId}>
                      <Link
                        href={`/video/${row.videoId}`}
                        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                      >
                        <span className="w-4 shrink-0 text-center text-xs text-fg-subtle nx-tnum">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-fg">
                            {row.title}
                          </span>
                          <span className="mt-0.5 block text-2xs text-fg-subtle nx-tnum">
                            {compactNumber(row.views)} views ·{" "}
                            {row.completionRate}% completion
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-5">
                  <EmptyState compact title="No published videos yet" />
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Recent uploads */}
          <Card>
            <CardHeader
              title="Recent uploads"
              action={
                <Button variant="ghost" size="sm" href="/studio/content">
                  All content
                </Button>
              }
            />
            <CardBody className="p-0">
              {videos.length ? (
                <ul className="divide-y divide-border">
                  {videos.slice(0, 6).map((video) => (
                    <li
                      key={video.id}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      <span
                        aria-hidden
                        className="h-9 w-16 shrink-0 rounded"
                        style={{
                          backgroundImage: `linear-gradient(140deg, ${video.posterGradient[0]}, ${video.posterGradient[1]})`,
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">
                          {video.title}
                        </span>
                        <span className="mt-0.5 block text-2xs text-fg-subtle">
                          {video.publishedAt
                            ? relativeTime(video.publishedAt)
                            : "Not published"}
                        </span>
                      </span>
                      <StatusBadge status={video.status} size="sm" />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-5">
                  <EmptyState
                    compact
                    title="Nothing uploaded yet"
                    action={{ label: "Upload a video", href: "/studio/upload" }}
                  />
                </div>
              )}
            </CardBody>
          </Card>

          {/* Live schedule */}
          <Card>
            <CardHeader
              title="Live schedule"
              action={
                <Button variant="ghost" size="sm" href="/studio/live">
                  Manage
                </Button>
              }
            />
            <CardBody className="p-0">
              {liveEvents.length ? (
                <ul className="divide-y divide-border">
                  {liveEvents.slice(0, 5).map((event) => (
                    <li key={event.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">
                          {event.title}
                        </span>
                        <span className="mt-0.5 block text-2xs text-fg-subtle nx-tnum">
                          {formatDateTime(event.scheduledStart)}
                        </span>
                      </span>
                      {event.status === "live" ? (
                        <LiveBadge size="sm" />
                      ) : (
                        <Badge
                          tone={
                            event.status === "upcoming"
                              ? "scheduled"
                              : event.status === "cancelled"
                                ? "rejected"
                                : "archived"
                          }
                          size="sm"
                        >
                          {event.status}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-5">
                  <EmptyState
                    compact
                    title="No streams scheduled"
                    action={{ label: "Schedule a stream", href: "/studio/live" }}
                  />
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
