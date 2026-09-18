"use client";

import { IconCoin, IconDownload, IconWallet } from "@tabler/icons-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { RailSkeleton } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { CHART_COLORS, chartTooltip } from "@/components/charts/chart-theme";
import { looksLikeRealId } from "@/lib/mock-api";
import { useCurrentUser, useRevenueSummary } from "@/lib/mock-api/hooks";
import type { RevenueSummary } from "@/lib/mock-api/types";
import { formatCurrency, formatDate } from "@/lib/utils";

type Txn = RevenueSummary["transactions"][number];

export default function StudioRevenuePage() {
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId ?? "ch_mara";
  const isRealChannel = looksLikeRealId(channelId);
  const { data, isLoading } = useRevenueSummary(channelId);
  const { toast } = useToast();

  const columns: Array<Column<Txn>> = [
    {
      key: "date",
      header: "Date",
      sortValue: (row) => row.date,
      cell: (row) => <span className="nx-tnum">{formatDate(row.date)}</span>,
    },
    {
      key: "description",
      header: "Description",
      sortValue: (row) => row.description,
      cell: (row) => <span className="text-fg">{row.description}</span>,
    },
    {
      key: "kind",
      header: "Type",
      secondary: true,
      sortValue: (row) => row.kind,
      cell: (row) => (
        <Badge tone={row.kind === "payout" ? "info" : "neutral"} size="sm">
          {row.kind}
        </Badge>
      ),
    },
    {
      key: "gross",
      header: "Gross",
      align: "right",
      secondary: true,
      sortValue: (row) => row.gross,
      cell: (row) => <span className="nx-tnum">{formatCurrency(row.gross)}</span>,
    },
    {
      key: "fee",
      header: "Commission",
      align: "right",
      secondary: true,
      sortValue: (row) => row.fee,
      cell: (row) => (
        <span className="nx-tnum text-fg-subtle">
          {row.fee ? `−${formatCurrency(row.fee)}` : "—"}
        </span>
      ),
    },
    {
      key: "net",
      header: "Net",
      align: "right",
      sortValue: (row) => row.net,
      cell: (row) => (
        <span
          className={`nx-tnum font-medium ${row.net < 0 ? "text-fg-muted" : "text-fg"}`}
        >
          {formatCurrency(row.net)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Revenue"
        description={
          isRealChannel
            ? "Real gross revenue from Stripe purchases and rentals. Commission and payouts aren't configured yet — see the note below."
            : "Earnings, commission and payouts. All figures are simulated — no payment or settlement provider exists in this build."
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => toast({ title: "CSV export isn't built yet", tone: "info" })}
          >
            <IconDownload />
            Export statement
          </Button>
        }
      />

      <PageBody className="space-y-6">
        {isLoading || !data ? (
          <RailSkeleton count={4} />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Available to withdraw"
                value={isRealChannel ? "—" : formatCurrency(data.available)}
                icon={<IconWallet />}
                hint={isRealChannel ? "Payouts aren't built yet" : `Next payout ${formatDate(data.nextPayoutDate)}`}
              />
              <Stat
                label="Pending clearance"
                value={isRealChannel ? "—" : formatCurrency(data.pending)}
                hint={isRealChannel ? "Payouts aren't built yet" : "Held 30 days"}
              />
              <Stat
                label="Lifetime earnings"
                value={formatCurrency(data.lifetime, "GBP", { compact: true })}
                icon={<IconCoin />}
              />
              <Stat
                label="This month"
                value={formatCurrency(
                  data.transactions
                    .filter((txn) => txn.kind !== "payout")
                    .reduce((total, txn) => total + txn.net, 0),
                  "GBP",
                  { compact: true },
                )}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
              <Card>
                <CardHeader
                  title="Revenue by stream"
                  description="Lifetime split"
                />
                <CardBody>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.byStream}
                          dataKey="value"
                          nameKey="label"
                          innerRadius="56%"
                          outerRadius="84%"
                          paddingAngle={2}
                          stroke="none"
                        >
                          {data.byStream.map((_, index) => (
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
                  <ul className="mt-3 space-y-2">
                    {data.byStream.map((slice, index) => (
                      <li
                        key={slice.label}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          aria-hidden
                          className="size-2.5 shrink-0 rounded-sm"
                          style={{
                            background: CHART_COLORS[index % CHART_COLORS.length],
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate text-fg-muted">
                          {slice.label}
                        </span>
                        <span className="text-fg-subtle nx-tnum">{slice.share}%</span>
                        <span className="w-20 text-right text-fg nx-tnum">
                          {formatCurrency(slice.value, "GBP", { compact: true })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Payout settings"
                  description="Where your earnings go"
                />
                <CardBody className="space-y-4">
                  {isRealChannel ? (
                    <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-subtle">
                      Payouts aren&apos;t built yet — that needs a Stripe Connect
                      integration and bank-account verification for creators, which is
                      separate work. The transactions below are real; nothing has been
                      paid out against them yet.
                    </p>
                  ) : (
                    <>
                      <div className="rounded-lg border border-border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-fg">
                              Bank transfer · ••••4417
                            </p>
                            <p className="mt-0.5 text-xs text-fg-muted">
                              Monthly on the 28th · 30-day hold · minimum £50.00
                            </p>
                          </div>
                          <Badge tone="published" size="sm">
                            Verified
                          </Badge>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            toast({
                              title: "Withdrawal requested",
                              description: `${formatCurrency(data.available)} — mock action, no funds move.`,
                            })
                          }
                        >
                          Withdraw {formatCurrency(data.available)}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            toast({
                              title: "Payment details are never collected here",
                              tone: "info",
                            })
                          }
                        >
                          Change payout method
                        </Button>
                      </div>

                      <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-subtle">
                        Commission is applied per revenue stream and configured by
                        platform admins under Settings → Commissions. Current split on
                        memberships is 85/15 in your favour.
                      </p>
                    </>
                  )}
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardHeader title="Transactions" description="Most recent first" />
              <CardBody className="p-0">
                <DataTable
                  columns={columns}
                  rows={data.transactions}
                  rowKey={(row) => row.id}
                  pageSize={10}
                  className="rounded-none border-0"
                  caption="Revenue transactions"
                />
              </CardBody>
            </Card>
          </>
        )}
      </PageBody>
    </>
  );
}
