"use client";

import {
  IconBroadcast,
  IconBuildingCommunity,
  IconCoin,
  IconCopyright,
  IconFlag,
  IconListCheck,
  IconSpeakerphone,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { RailSkeleton } from "@/components/ui/empty-state";
import {
  CHART_COLORS,
  chartAxis,
  chartGrid,
  chartTooltip,
} from "@/components/charts/chart-theme";
import { channelById } from "@/lib/mock-api/data/channels";
import {
  useAdminSummary,
  useAuditLog,
  useModerationQueue,
} from "@/lib/mock-api/hooks";
import { cn, compactNumber, formatCurrency, formatDate, relativeTime } from "@/lib/utils";

const QUEUE_CARDS = [
  {
    key: "pendingContent" as const,
    label: "Pending content",
    description: "Awaiting first review",
    href: "/admin/reviews?queue=pending-review",
    icon: <IconListCheck />,
    tone: "pending",
  },
  {
    key: "reportedContent" as const,
    label: "Reported",
    description: "Flagged by viewers",
    href: "/admin/reviews?queue=reported",
    icon: <IconFlag />,
    tone: "warning",
  },
  {
    key: "copyrightClaims" as const,
    label: "Copyright claims",
    description: "Rights disputes",
    href: "/admin/reports",
    icon: <IconCopyright />,
    tone: "danger",
  },
  {
    key: "liveIncidents" as const,
    label: "Live incidents",
    description: "Active streams needing attention",
    href: "/admin/reviews?queue=live-incident",
    icon: <IconBroadcast />,
    tone: "live",
  },
  {
    key: "verificationQueue" as const,
    label: "Verification",
    description: "Organisation applications",
    href: "/admin/reviews?queue=verification",
    icon: <IconBuildingCommunity />,
    tone: "info",
  },
  {
    key: "campaignsAwaitingApproval" as const,
    label: "Campaigns",
    description: "Advertising awaiting approval",
    href: "/admin/ads",
    icon: <IconSpeakerphone />,
    tone: "accent",
  },
];

export default function AdminDashboardPage() {
  const { data: summary, isLoading } = useAdminSummary();
  const { data: queue = [] } = useModerationQueue();
  const { data: audit = [] } = useAuditLog();

  const urgent = queue.filter(
    (item) => item.status === "open" && (item.priority === "urgent" || item.priority === "high"),
  );

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Moderation load, live operations and platform health."
        actions={
          <Button variant="primary" href="/admin/reviews">
            <IconListCheck />
            Open review queue
          </Button>
        }
      />

      <PageBody className="space-y-6">
        {isLoading || !summary ? (
          <RailSkeleton count={6} />
        ) : (
          <>
            {/* Queue widgets */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {QUEUE_CARDS.map((card) => {
                const value = summary[card.key];
                return (
                  <Link key={card.key} href={card.href}>
                    <Card
                      interactive
                      className={cn(
                        "h-full p-4",
                        value > 0 && card.tone === "danger" && "border-danger/40",
                        value > 0 && card.tone === "live" && "border-live/40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            "flex size-8 items-center justify-center rounded-full [&_svg]:size-4",
                            card.tone === "danger"
                              ? "bg-danger/15 text-danger"
                              : card.tone === "live"
                                ? "bg-live-soft text-live"
                                : card.tone === "warning"
                                  ? "bg-warning/15 text-warning"
                                  : card.tone === "info"
                                    ? "bg-info/15 text-info"
                                    : card.tone === "accent"
                                      ? "bg-accent-soft text-accent"
                                      : "bg-status-pending/15 text-status-pending",
                          )}
                        >
                          {card.icon}
                        </span>
                        <span className="font-display text-2xl font-semibold text-fg nx-tnum">
                          {value}
                        </span>
                      </div>
                      <p className="mt-2.5 text-sm font-medium text-fg">{card.label}</p>
                      <p className="mt-0.5 text-2xs leading-snug text-fg-subtle">
                        {card.description}
                      </p>
                    </Card>
                  </Link>
                );
              })}
            </div>

            {/* Platform stats */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Total users"
                value={compactNumber(summary.totalUsers)}
                icon={<IconUsers />}
              />
              <Stat
                label="Live now"
                value={String(summary.activeLiveEvents)}
                icon={<IconBroadcast />}
              />
              <Stat
                label="Revenue (30d)"
                value={formatCurrency(summary.revenue30d.amount, "AUD", {
                  compact: true,
                })}
                icon={<IconCoin />}
              />
              <Stat
                label="Payouts due"
                value={formatCurrency(summary.payoutsDue.amount, "AUD", {
                  compact: true,
                })}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
              <Card>
                <CardHeader
                  title="Moderation load"
                  description="Reviews completed and new reports, last 30 days"
                />
                <CardBody>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary.trend}>
                        <CartesianGrid {...chartGrid} />
                        <XAxis
                          dataKey="date"
                          {...chartAxis}
                          tickFormatter={(value: string) => formatDate(value, "short")}
                          minTickGap={28}
                        />
                        <YAxis {...chartAxis} width={36} />
                        <Tooltip
                          {...chartTooltip}
                          labelFormatter={(value) => formatDate(String(value), "long")}
                        />
                        <Bar
                          dataKey="reviews"
                          name="Reviews completed"
                          fill={CHART_COLORS[2]}
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          dataKey="reports"
                          name="New reports"
                          fill={CHART_COLORS[0]}
                          radius={[3, 3, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Needs attention"
                  description="High and urgent priority, still open"
                  action={
                    <Button variant="ghost" size="sm" href="/admin/reviews">
                      All
                    </Button>
                  }
                />
                <CardBody className="p-0">
                  {urgent.length === 0 ? (
                    <p className="p-5 text-sm text-fg-subtle">
                      Nothing urgent. The queue is under control.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {urgent.map((item) => {
                        const channel = channelById(item.channelId);
                        return (
                          <li key={item.id}>
                            <Link
                              href="/admin/reviews"
                              className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                            >
                              <span
                                className={cn(
                                  "mt-1 size-2 shrink-0 rounded-full",
                                  item.priority === "urgent" ? "bg-live" : "bg-warning",
                                )}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-fg">
                                  {item.title}
                                </span>
                                <span className="mt-0.5 block text-2xs text-fg-subtle">
                                  {channel?.name} · {relativeTime(item.submittedAt)}
                                </span>
                              </span>
                              <Badge
                                tone={item.priority === "urgent" ? "danger" : "warning"}
                                size="sm"
                              >
                                {item.priority}
                              </Badge>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </div>

            {/* Recent audit */}
            <Card>
              <CardHeader
                title="Recent platform activity"
                description="Every administrative action is recorded"
                action={
                  <Button variant="ghost" size="sm" href="/admin/audit-logs">
                    Full audit log
                  </Button>
                }
              />
              <CardBody className="p-0">
                <ul className="divide-y divide-border">
                  {audit.slice(0, 8).map((entry) => (
                    <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                      <span
                        className={cn(
                          "mt-1 size-2 shrink-0 rounded-full",
                          entry.severity === "critical"
                            ? "bg-danger"
                            : entry.severity === "warning"
                              ? "bg-warning"
                              : entry.severity === "notice"
                                ? "bg-info"
                                : "bg-fg-subtle",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <code className="font-mono text-xs text-accent">
                            {entry.action}
                          </code>
                          <span className="text-2xs text-fg-subtle">
                            {entry.actor} · {relativeTime(entry.createdAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
                          {entry.reason}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </>
        )}
      </PageBody>
    </>
  );
}
