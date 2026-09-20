"use client";

import * as React from "react";
import { IconCoin, IconDownload, IconWallet } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { csvSection, downloadCsv } from "@/lib/csv";
import { looksLikeRealId } from "@/lib/mock-api";
import { useCurrentUser, useRevenueSummary } from "@/lib/mock-api/hooks";
import type { RevenueSummary } from "@/lib/mock-api/types";
import { formatCurrency, formatDate } from "@/lib/utils";

type Txn = RevenueSummary["transactions"][number];

interface PayoutStatus {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  available: { amountMinor: number; currency: string };
  history: Array<{ id: string; amountMinor: number; currency: string; status: string; createdAt: string }>;
}

/** Real Stripe Connect payout onboarding + withdrawal for a real channel — no mock
 * counterpart exists to preserve a signature for (the mock's own "Payout settings" card
 * is a fully static, pre-verified fake bank account with no real backing concept at
 * all), so this talks to the real API directly rather than through the mock-api layer,
 * same as business/verification/page.tsx did for its own new-real-feature page. */
function usePayoutStatus(channelId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["payout-status", channelId],
    queryFn: async (): Promise<PayoutStatus> => {
      const res = await fetch(`/api/studio/payouts/status/?channelId=${encodeURIComponent(channelId)}`);
      if (!res.ok) throw new Error("Failed to load payout status.");
      return res.json();
    },
    enabled,
  });
}

export default function StudioRevenuePage() {
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId ?? "ch_mara";
  const isRealChannel = looksLikeRealId(channelId);
  const { data, isLoading } = useRevenueSummary(channelId);
  const { data: payout, isLoading: isPayoutLoading } = usePayoutStatus(channelId, isRealChannel);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Landing back from real Stripe Connect onboarding — no session_id to verify here
  // (Account Links don't carry one), just refetch: the webhook (or Stripe's own
  // eventual-consistency on the account object) is the source of truth for whether
  // onboarding actually finished.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connect = params.get("connect");
    if (!connect) return;
    if (connect === "return") {
      toast({ title: "Checking your bank account setup…", tone: "info" });
    }
    queryClient.invalidateQueries({ queryKey: ["payout-status", channelId] });
    window.history.replaceState(null, "", "/studio/revenue/");
    // Only ever run once per real navigation to this exact query string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onboard = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/studio/payouts/onboard/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, returnPath: "/studio/revenue/" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not start onboarding.");
      }
      const { url } = (await res.json()) as { url: string };
      return url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't start onboarding", description: err.message, tone: "error" });
    },
  });

  const withdraw = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/studio/payouts/withdraw/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; amountMinor?: number };
      if (!res.ok) throw new Error(body.error ?? "Could not process the withdrawal.");
      return body.amountMinor ?? 0;
    },
    onSuccess: (amountMinor) => {
      toast({ title: "Withdrawal sent", description: `${formatCurrency(amountMinor)} is on its way.` });
      queryClient.invalidateQueries({ queryKey: ["payout-status", channelId] });
      queryClient.invalidateQueries({ queryKey: ["revenue"] });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't withdraw", description: err.message, tone: "error" });
    },
  });

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
            ? "Real revenue from legacy per-video purchases and rentals, net of platform commission — retired since the move to Nexus subscription plans, kept here for historical statements. Per-channel revenue share from subscriptions isn't built yet. Connect a bank account below to withdraw any available balance."
            : "Earnings, commission and payouts. All figures are simulated — no payment or settlement provider exists in this build."
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={!data}
            onClick={() => {
              if (!data) return;
              const csv = csvSection(
                "Transactions",
                ["Date", "Description", "Type", "Gross", "Commission", "Net"],
                data.transactions.map((txn) => [
                  formatDate(txn.date),
                  txn.description,
                  txn.kind,
                  formatCurrency(txn.gross),
                  txn.fee ? formatCurrency(txn.fee) : "",
                  formatCurrency(txn.net),
                ]),
              );
              downloadCsv(`revenue-statement-${new Date().toISOString().slice(0, 10)}.csv`, [csv]);
              toast({
                title: "Statement exported",
                description: `${data.transactions.length} transaction${data.transactions.length === 1 ? "" : "s"} downloaded.`,
              });
            }}
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
                value={
                  isRealChannel
                    ? payout
                      ? formatCurrency(payout.available.amountMinor, payout.available.currency)
                      : "—"
                    : formatCurrency(data.available)
                }
                icon={<IconWallet />}
                hint={
                  isRealChannel
                    ? payout?.payoutsEnabled
                      ? "No commission deducted yet"
                      : "Connect a bank account to withdraw"
                    : `Next payout ${formatDate(data.nextPayoutDate)}`
                }
              />
              <Stat
                label="Pending clearance"
                value={isRealChannel ? "—" : formatCurrency(data.pending)}
                hint={isRealChannel ? "No holding period is enforced yet" : "Held 30 days"}
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
                    isPayoutLoading || !payout ? (
                      <div className="nx-skeleton h-24 rounded-lg" />
                    ) : payout.payoutsEnabled ? (
                      <>
                        <div className="rounded-lg border border-border p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-fg">Bank account connected</p>
                              <p className="mt-0.5 text-xs text-fg-muted">
                                Via Stripe Connect · minimum £50.00 per withdrawal
                              </p>
                            </div>
                            <Badge tone="published" size="sm">
                              Verified
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          loading={withdraw.isPending}
                          disabled={payout.available.amountMinor < 5000}
                          onClick={() => withdraw.mutate()}
                        >
                          Withdraw {formatCurrency(payout.available.amountMinor, payout.available.currency)}
                        </Button>
                        {payout.history.length > 0 ? (
                          <ul className="space-y-1.5 border-t border-border pt-3">
                            {payout.history.map((item) => (
                              <li key={item.id} className="flex items-center justify-between text-xs text-fg-muted">
                                <span>{formatDate(item.createdAt)}</span>
                                <span className="nx-tnum text-fg">{formatCurrency(item.amountMinor, item.currency)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-subtle">
                          No commission is deducted yet (still unconfigured — see Settings
                          → Commissions) and no holding period is enforced, so this is
                          gross revenue, paid out on request.
                        </p>
                      </>
                    ) : payout.connected ? (
                      <>
                        <p className="rounded border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-fg-muted">
                          Bank account details submitted — Stripe is still verifying them.
                          This can take a few minutes.
                        </p>
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={onboard.isPending}
                          onClick={() => onboard.mutate()}
                        >
                          Check status / finish setup
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-fg-muted">
                          Connect a bank account through Stripe to withdraw your real
                          earnings. MYHitch Nexus never collects or stores your bank
                          details itself.
                        </p>
                        <Button
                          variant="primary"
                          size="sm"
                          loading={onboard.isPending}
                          onClick={() => onboard.mutate()}
                        >
                          Connect a bank account
                        </Button>
                      </>
                    )
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
