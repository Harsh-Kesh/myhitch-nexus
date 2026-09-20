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
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import {
  CHART_COLORS,
  chartAxis,
  chartGrid,
  chartTooltip,
} from "@/components/charts/chart-theme";
import { buildAdminTrend } from "@/lib/mock-api/data/analytics";
import { channels } from "@/lib/mock-api/data/channels";
import { usePlatformConfig } from "@/lib/mock-api/hooks";
import {
  formatCurrency,
  formatDate,
  formatPercent,
  hashString,
  seededRandom,
} from "@/lib/utils";

interface PayoutRow {
  id: string;
  channelId: string;
  channelName: string;
  gross: number;
  commission: number;
  tax: number;
  net: number;
  method: string;
  status: "scheduled" | "processing" | "paid" | "failed";
  dueDate: string;
}

/** Deterministic payout ledger derived from the channel fixtures. */
function buildPayouts(): PayoutRow[] {
  const methods = ["Bank transfer", "International wire", "Platform wallet"];
  const statuses: PayoutRow["status"][] = [
    "scheduled",
    "processing",
    "paid",
    "paid",
    "failed",
    "scheduled",
  ];
  return channels.map((channel, index) => {
    const random = seededRandom(hashString(`${channel.id}:payout`));
    const gross = Math.round(80_000 + random() * 1_400_000);
    const commission = Math.round(gross * 0.3);
    const tax = Math.round((gross - commission) * 0.2);
    return {
      id: `po_${channel.id}`,
      channelId: channel.id,
      channelName: channel.name,
      gross,
      commission,
      tax,
      net: gross - commission - tax,
      method: methods[index % methods.length],
      status: statuses[index % statuses.length],
      dueDate: "2026-08-28",
    };
  });
}

const STATUS_TONE = {
  scheduled: "scheduled",
  processing: "pending",
  paid: "published",
  failed: "rejected",
} as const;

export default function AdminFinancePage() {
  const { data: config } = usePlatformConfig();
  const { toast } = useToast();
  const [tab, setTab] = React.useState("payouts");

  const payouts = React.useMemo(buildPayouts, []);
  const trend = React.useMemo(() => buildAdminTrend(30), []);

  const totals = payouts.reduce(
    (acc, row) => ({
      gross: acc.gross + row.gross,
      commission: acc.commission + row.commission,
      tax: acc.tax + row.tax,
      net: acc.net + row.net,
    }),
    { gross: 0, commission: 0, tax: 0, net: 0 },
  );

  const failed = payouts.filter((row) => row.status === "failed");

  // Advertising (free tier) and Subscriptions (Premium/Family/Business) are the only two
  // real revenue streams under the current pricing model — rentals, per-video purchases
  // and channel memberships were retired (2026-09-20). Commerce is Business-tier product
  // links/leads.
  const revenueMix = [
    { label: "Advertising", value: Math.round(totals.gross * 0.42) },
    { label: "Subscriptions", value: Math.round(totals.gross * 0.52) },
    { label: "Commerce", value: Math.round(totals.gross * 0.06) },
  ];

  const columns: Array<Column<PayoutRow>> = [
    {
      key: "channel",
      header: "Channel",
      sortValue: (row) => row.channelName,
      cell: (row) => <span className="font-medium text-fg">{row.channelName}</span>,
    },
    {
      key: "gross",
      header: "Gross",
      align: "right",
      sortValue: (row) => row.gross,
      cell: (row) => <span className="nx-tnum">{formatCurrency(row.gross)}</span>,
    },
    {
      key: "commission",
      header: "Commission",
      align: "right",
      secondary: true,
      sortValue: (row) => row.commission,
      cell: (row) => (
        <span className="nx-tnum text-fg-subtle">−{formatCurrency(row.commission)}</span>
      ),
    },
    {
      key: "tax",
      header: "Tax withheld",
      align: "right",
      secondary: true,
      sortValue: (row) => row.tax,
      cell: (row) => (
        <span className="nx-tnum text-fg-subtle">−{formatCurrency(row.tax)}</span>
      ),
    },
    {
      key: "net",
      header: "Net payable",
      align: "right",
      sortValue: (row) => row.net,
      cell: (row) => (
        <span className="nx-tnum font-medium text-fg">{formatCurrency(row.net)}</span>
      ),
    },
    {
      key: "method",
      header: "Method",
      secondary: true,
      sortValue: (row) => row.method,
      cell: (row) => <span className="text-xs">{row.method}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      cell: (row) => (
        <Badge tone={STATUS_TONE[row.status]} size="sm">
          {row.status}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Finance"
        description="Platform revenue, commission and the creator payout run. Figures are simulated — no settlement, tax or payout provider is integrated."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              toast({
                title: "Statement exported",
                description: "Mock CSV — nothing leaves the browser.",
                tone: "info",
              })
            }
          >
            <IconDownload />
            Export ledger
          </Button>
        }
      />

      <PageBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Gross revenue"
            value={formatCurrency(totals.gross, "GBP", { compact: true })}
            icon={<IconCoin />}
          />
          <Stat
            label="Platform commission"
            value={formatCurrency(totals.commission, "GBP", { compact: true })}
            hint={formatPercent((totals.commission / (totals.gross || 1)) * 100, 0)}
          />
          <Stat
            label="Payouts due"
            value={formatCurrency(totals.net, "GBP", { compact: true })}
            icon={<IconWallet />}
            hint="28 August run"
          />
          <Stat
            label="Failed payouts"
            value={String(failed.length)}
            invertDelta
            hint={failed.length ? "Needs finance action" : "All clear"}
          />
        </div>

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "payouts", label: "Payout run", count: payouts.length },
            { value: "revenue", label: "Revenue" },
            { value: "rules", label: "Commission & tax" },
          ]}
        />

        {tab === "payouts" ? (
          <>
            {failed.length > 0 ? (
              <Card className="border-danger/40">
                <CardBody className="flex flex-wrap items-center gap-3">
                  <Badge tone="danger">Action needed</Badge>
                  <p className="min-w-0 flex-1 text-sm text-fg-muted">
                    {failed.length} payout{failed.length === 1 ? "" : "s"} failed —{" "}
                    {failed.map((row) => row.channelName).join(", ")}. Usually an
                    account-name mismatch at the receiving bank.
                  </p>
                  <Button variant="secondary" size="sm" href="/admin/reports">
                    Open cases
                  </Button>
                </CardBody>
              </Card>
            ) : null}

            <DataTable
              columns={columns}
              rows={payouts}
              rowKey={(row) => row.id}
              pageSize={12}
              caption="Creator payout run"
            />
          </>
        ) : null}

        {tab === "revenue" ? (
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader
                title="Platform activity"
                description="Reviews and reports, last 30 days"
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
                      <YAxis {...chartAxis} width={36} />
                      <Tooltip
                        {...chartTooltip}
                        labelFormatter={(value) => formatDate(String(value), "long")}
                      />
                      <Bar
                        dataKey="reviews"
                        name="Transactions"
                        fill={CHART_COLORS[0]}
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Revenue mix" description="Share of gross" />
              <CardBody>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={revenueMix}
                        dataKey="value"
                        nameKey="label"
                        innerRadius="55%"
                        outerRadius="84%"
                        paddingAngle={2}
                        stroke="none"
                      >
                        {revenueMix.map((_, index) => (
                          <Cell
                            key={index}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        {...chartTooltip}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {revenueMix.map((slice, index) => (
                    <li key={slice.label} className="flex items-center gap-2 text-sm">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-sm"
                        style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="min-w-0 flex-1 truncate text-fg-muted">
                        {slice.label}
                      </span>
                      <span className="text-fg nx-tnum">
                        {formatCurrency(slice.value, "GBP", { compact: true })}
                      </span>
                    </li>
                  ))}
                </ul>
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
              <CardHeader
                title="Tax rates"
                description="Applied at checkout by billing country"
                action={
                  <Button variant="ghost" size="sm" href="/admin/settings">
                    Edit
                  </Button>
                }
              />
              <CardBody className="p-0">
                <ul className="divide-y divide-border">
                  {config?.taxes.map((tax) => (
                    <li key={tax.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">
                          {tax.country}
                        </span>
                        <span className="mt-0.5 block text-2xs text-fg-subtle">
                          {tax.name} · {tax.appliesTo}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-medium text-fg nx-tnum">
                        {tax.rate}%
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        ) : null}
      </PageBody>
    </>
  );
}
