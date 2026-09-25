"use client";

import { IconCoin, IconDownload, IconWallet } from "@tabler/icons-react";
import * as React from "react";
import {
  Bar,
  BarChart,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import {
  CHART_COLORS,
  chartAxis,
  chartGrid,
  chartTooltip,
} from "@/components/charts/chart-theme";
import { csvSection, downloadCsv } from "@/lib/csv";
import { useAdminFinance, usePlatformConfig } from "@/lib/mock-api/hooks";
import type { OrgPayoutSummary } from "@/lib/mock-api/types";
import { formatCurrency, formatDate } from "@/lib/utils";

type PayoutAccountState = "not_connected" | "awaiting_verification" | "ready";

function accountState(row: OrgPayoutSummary): PayoutAccountState {
  if (!row.connected) return "not_connected";
  if (!row.payoutsEnabled) return "awaiting_verification";
  return "ready";
}

const ACCOUNT_STATE_LABEL: Record<PayoutAccountState, string> = {
  not_connected: "Not connected",
  awaiting_verification: "Awaiting verification",
  ready: "Ready",
};

const ACCOUNT_STATE_TONE = {
  not_connected: "archived",
  awaiting_verification: "pending",
  ready: "published",
} as const;

export default function AdminFinancePage() {
  const { data, isLoading } = useAdminFinance();
  const { data: config } = usePlatformConfig();
  const { toast } = useToast();
  const [tab, setTab] = React.useState("payouts");

  const organizations = data?.organizations ?? [];
  const trend = data?.trend ?? [];
  const revenueByStream = data?.revenueByStream ?? [];
  const platform = data?.platform;

  // Gross (30d) isn't returned as its own field — it's already sitting in the trend
  // series (which covers exactly the last 30 days), so summing it client-side avoids a
  // duplicate server-side aggregate for the same number.
  const gross30dMinor = trend.reduce((sum, point) => sum + point.grossMinor, 0);

  const columns: Array<Column<OrgPayoutSummary>> = [
    {
      key: "organization",
      header: "Organisation",
      sortValue: (row) => row.organizationName,
      cell: (row) => <span className="font-medium text-fg">{row.organizationName}</span>,
    },
    {
      key: "gross",
      header: "Gross (all-time)",
      align: "right",
      sortValue: (row) => row.grossMinor,
      cell: (row) => <span className="nx-tnum">{formatCurrency(row.grossMinor)}</span>,
    },
    {
      key: "available",
      header: "Available / due",
      align: "right",
      sortValue: (row) => row.availableMinor,
      cell: (row) => <span className="nx-tnum font-medium text-fg">{formatCurrency(row.availableMinor)}</span>,
    },
    {
      key: "paid",
      header: "Paid out (all-time)",
      align: "right",
      secondary: true,
      sortValue: (row) => row.paidMinor,
      cell: (row) => <span className="nx-tnum text-fg-subtle">{formatCurrency(row.paidMinor)}</span>,
    },
    {
      key: "status",
      header: "Payout account",
      sortValue: (row) => accountState(row),
      cell: (row) => {
        const state = accountState(row);
        return (
          <Badge tone={ACCOUNT_STATE_TONE[state]} size="sm">
            {ACCOUNT_STATE_LABEL[state]}
          </Badge>
        );
      },
    },
    {
      key: "lastPayout",
      header: "Last payout",
      secondary: true,
      sortValue: (row) => row.lastPayoutAt ?? "",
      cell: (row) => <span className="text-xs">{row.lastPayoutAt ? formatDate(row.lastPayoutAt) : "Never"}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Finance"
        description="Real platform revenue and creator payout status — Stripe Checkout and Stripe Connect, live."
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={!data || organizations.length === 0}
            onClick={() => {
              if (!data) return;
              const csv = csvSection(
                "Organisation payouts",
                ["Organisation", "Gross (all-time)", "Available / due", "Paid out (all-time)", "Payout account", "Last payout"],
                organizations.map((row) => [
                  row.organizationName,
                  formatCurrency(row.grossMinor),
                  formatCurrency(row.availableMinor),
                  formatCurrency(row.paidMinor),
                  ACCOUNT_STATE_LABEL[accountState(row)],
                  row.lastPayoutAt ? formatDate(row.lastPayoutAt) : "Never",
                ]),
              );
              downloadCsv(`finance-ledger-${new Date().toISOString().slice(0, 10)}.csv`, [csv]);
              toast({
                title: "Ledger exported",
                description: `${organizations.length} organisation${organizations.length === 1 ? "" : "s"} downloaded.`,
              });
            }}
          >
            <IconDownload />
            Export ledger
          </Button>
        }
      />

      <PageBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Gross revenue (30d)"
            value={formatCurrency(gross30dMinor, "AUD", { compact: true })}
            icon={<IconCoin />}
          />
          <Stat
            label="Platform revenue (30d)"
            value={formatCurrency(platform?.commission30dMinor ?? 0, "AUD", { compact: true })}
            hint="Commission + subscriptions"
          />
          <Stat
            label="Payouts due"
            value={formatCurrency(platform?.payoutsDueMinor ?? 0, "AUD", { compact: true })}
            icon={<IconWallet />}
            hint="Owed to creators, all-time"
          />
          <Stat
            label="Failed payouts"
            value={String(data?.failedPayoutCount ?? 0)}
            invertDelta
            hint={data?.failedPayoutCount ? "Needs finance action" : "All clear"}
          />
        </div>

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "payouts", label: "Organisations", count: organizations.length },
            { value: "revenue", label: "Revenue" },
            { value: "rules", label: "Commission & tax" },
          ]}
        />

        {tab === "payouts" ? (
          <>
            {(data?.failedPayoutCount ?? 0) > 0 ? (
              <Card className="border-danger/40">
                <CardBody className="flex flex-wrap items-center gap-3">
                  <Badge tone="danger">Action needed</Badge>
                  <p className="min-w-0 flex-1 text-sm text-fg-muted">
                    {data!.failedPayoutCount} payout{data!.failedPayoutCount === 1 ? "" : "s"} failed. Usually an
                    account-name mismatch at the receiving bank.
                  </p>
                  <Button variant="secondary" size="sm" href="/admin/reports">
                    Open cases
                  </Button>
                </CardBody>
              </Card>
            ) : null}

            {isLoading ? (
              <EmptyState compact title="Loading…" />
            ) : organizations.length === 0 ? (
              <EmptyState
                compact
                title="No organisations with revenue yet"
                description="Real purchases, subscriptions or memberships will show up here as they happen."
              />
            ) : (
              <DataTable
                columns={columns}
                rows={organizations}
                rowKey={(row) => row.organizationId}
                pageSize={12}
                caption="Organisation payout status"
              />
            )}
          </>
        ) : null}

        {tab === "revenue" ? (
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader
                title="Platform revenue"
                description="Gross vs. platform's own take, last 30 days"
              />
              <CardBody>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trend}>
                      <CartesianGrid {...chartGrid} />
                      <XAxis
                        dataKey="date"
                        {...chartAxis}
                        tickFormatter={(value: string) => formatDate(value, "short")}
                        minTickGap={28}
                      />
                      <YAxis {...chartAxis} width={36} tickFormatter={(value: number) => formatCurrency(value, "AUD", { compact: true })} />
                      <Tooltip
                        {...chartTooltip}
                        labelFormatter={(value) => formatDate(String(value), "long")}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Bar dataKey="grossMinor" name="Gross" fill={CHART_COLORS[1]} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="commissionMinor" name="Platform revenue" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Revenue by stream" description="Gross, last 30 days" />
              <CardBody>
                {revenueByStream.length === 0 ? (
                  <EmptyState compact title="No revenue in this window" />
                ) : (
                  <>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={revenueByStream}
                            dataKey="grossMinor"
                            nameKey="label"
                            innerRadius="55%"
                            outerRadius="84%"
                            paddingAngle={2}
                            stroke="none"
                          >
                            {revenueByStream.map((_, index) => (
                              <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip {...chartTooltip} formatter={(value: number) => formatCurrency(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {revenueByStream.map((slice, index) => (
                        <li key={slice.label} className="flex items-center gap-2 text-sm">
                          <span
                            aria-hidden
                            className="size-2.5 shrink-0 rounded-sm"
                            style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                          />
                          <span className="min-w-0 flex-1 truncate text-fg-muted">{slice.label}</span>
                          <span className="text-fg nx-tnum">
                            {formatCurrency(slice.grossMinor, "AUD", { compact: true })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardBody>
            </Card>
          </div>
        ) : null}

        {tab === "rules" ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Commission rules"
                description="Applied per revenue stream"
                action={
                  <Button variant="ghost" size="sm" href="/admin/settings">
                    Edit
                  </Button>
                }
              />
              <CardBody className="p-0">
                <ul className="divide-y divide-border">
                  {config?.commissions.map((rule) => (
                    <li key={rule.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">
                          {rule.scope}
                        </span>
                        <span className="mt-0.5 block text-2xs text-fg-subtle nx-tnum">
                          from {formatDate(rule.effectiveFrom)}
                        </span>
                      </span>
                      <Badge tone="neutral" size="sm">
                        platform {rule.platformShare}%
                      </Badge>
                      <Badge tone="published" size="sm">
                        creator {rule.creatorShare}%
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Tax" description="Withholding and remittance" />
              <CardBody>
                <p className="text-sm leading-relaxed text-fg-muted">
                  No tax computation or withholding is built yet — every figure on this page is gross of tax.
                  Subscription revenue is 100% platform revenue (no creator commission split applies, since a
                  platform-wide plan has no per-transaction creator attribution).
                </p>
              </CardBody>
            </Card>
          </div>
        ) : null}
      </PageBody>
    </>
  );
}
