"use client";

import { IconCreditCard, IconDownload, IconFileInvoice } from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ProgressBar } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { useCampaigns } from "@/lib/mock-api/hooks";
import { formatCurrency, formatDate } from "@/lib/utils";

const CHANNEL_ID = "ch_helio";

interface Invoice {
  id: string;
  number: string;
  period: string;
  issued: string;
  due: string;
  amount: number;
  status: "paid" | "due" | "overdue";
}

const INVOICES: Invoice[] = [
  { id: "inv_8", number: "NX-ADV-2026-0812", period: "August 2026", issued: "2026-08-01", due: "2026-08-31", amount: 7_284_00, status: "due" },
  { id: "inv_7", number: "NX-ADV-2026-0711", period: "July 2026", issued: "2026-07-01", due: "2026-07-31", amount: 9_140_00, status: "paid" },
  { id: "inv_6", number: "NX-ADV-2026-0610", period: "June 2026", issued: "2026-06-01", due: "2026-06-30", amount: 6_402_00, status: "paid" },
  { id: "inv_5", number: "NX-ADV-2026-0509", period: "May 2026", issued: "2026-05-01", due: "2026-05-31", amount: 11_860_00, status: "paid" },
  { id: "inv_4", number: "NX-ADV-2026-0408", period: "April 2026", issued: "2026-04-01", due: "2026-04-30", amount: 5_218_00, status: "paid" },
  { id: "inv_3", number: "NX-ADV-2026-0307", period: "March 2026", issued: "2026-03-01", due: "2026-03-31", amount: 4_940_00, status: "paid" },
];

const STATUS_TONE = { paid: "published", due: "pending", overdue: "rejected" } as const;

export default function BillingPage() {
  const { data: campaigns = [] } = useCampaigns(CHANNEL_ID);
  const { toast } = useToast();

  const committed = campaigns
    .filter((c) => c.status === "active" || c.status === "pending")
    .reduce((total, c) => total + c.budget.amount, 0);
  const spent = campaigns.reduce((total, c) => total + c.spend.amount, 0);
  const outstanding = INVOICES.filter((i) => i.status !== "paid").reduce(
    (total, i) => total + i.amount,
    0,
  );

  const columns: Array<Column<Invoice>> = [
    {
      key: "number",
      header: "Invoice",
      sortValue: (row) => row.number,
      cell: (row) => (
        <span className="font-mono text-xs text-fg">{row.number}</span>
      ),
    },
    {
      key: "period",
      header: "Period",
      sortValue: (row) => row.issued,
      cell: (row) => <span className="text-fg">{row.period}</span>,
    },
    {
      key: "issued",
      header: "Issued",
      secondary: true,
      sortValue: (row) => row.issued,
      cell: (row) => <span className="nx-tnum">{formatDate(row.issued)}</span>,
    },
    {
      key: "due",
      header: "Due",
      secondary: true,
      sortValue: (row) => row.due,
      cell: (row) => <span className="nx-tnum">{formatDate(row.due)}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (row) => row.amount,
      cell: (row) => (
        <span className="nx-tnum font-medium text-fg">
          {formatCurrency(row.amount)}
        </span>
      ),
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
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Button
          variant="ghost"
          size="xs"
          onClick={() =>
            toast({
              title: "Invoice generated",
              description: `${row.number} — mock PDF, nothing is downloaded.`,
              tone: "info",
            })
          }
        >
          <IconDownload />
          PDF
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Billing & Subscription"
        description="Nexus Business subscription plan, commercial advertising spend, campaign invoices, and priority support status."
      />

      <PageBody className="space-y-6">
        {/* Nexus Business Subscription Overview */}
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader
            title="Nexus Business Subscription"
            description="Your active commercial plan and included enterprise features"
            action={
              <Badge tone="published" size="sm">
                Active Plan
              </Badge>
            }
          />
          <CardBody className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-fg-muted">Plan Tier</p>
                <p className="font-semibold text-fg">Nexus Business</p>
                <p className="text-xs text-fg-subtle">£29.00 / month (£290 / year option)</p>
              </div>
              <div>
                <p className="text-xs text-fg-muted">Team Allocation</p>
                <p className="font-semibold text-fg">Up to 5 Team Seats</p>
                <p className="text-xs text-fg-subtle">Admin, Editor, Analyst roles</p>
              </div>
              <div>
                <p className="text-xs text-fg-muted">Priority Business Support</p>
                <p className="font-semibold text-fg">Active SLA Support</p>
                <p className="text-xs text-fg-subtle">Priority ticket routing</p>
              </div>
            </div>
          </CardBody>
        </Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Outstanding"
            value={formatCurrency(outstanding)}
            icon={<IconFileInvoice />}
            hint="Due 31 August"
          />
          <Stat
            label="Spent to date"
            value={formatCurrency(spent, "GBP", { compact: true })}
          />
          <Stat
            label="Committed budget"
            value={formatCurrency(committed, "GBP", { compact: true })}
            hint="Active and pending campaigns"
          />
        </div>

        <Card>
          <CardHeader
            title="Budget utilisation"
            description="How much of your committed campaign budget has been delivered"
          />
          <CardBody className="space-y-4">
            {campaigns
              .filter((campaign) => campaign.budget.amount > 0)
              .map((campaign) => (
                <ProgressBar
                  key={campaign.id}
                  value={(campaign.spend.amount / campaign.budget.amount) * 100}
                  label={campaign.name}
                  valueLabel={`${formatCurrency(campaign.spend.amount, "GBP", { compact: true })} / ${formatCurrency(campaign.budget.amount, "GBP", { compact: true })}`}
                  size="sm"
                  tone={
                    campaign.spend.amount / campaign.budget.amount > 0.9
                      ? "warning"
                      : "accent"
                  }
                />
              ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Payment method"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  toast({
                    title: "Payment details are never collected here",
                    description:
                      "Card capture and gateway integration are explicitly out of scope.",
                    tone: "info",
                  })
                }
              >
                Update
              </Button>
            }
          />
          <CardBody>
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-4">
              <span className="flex size-10 items-center justify-center rounded-full bg-surface-3 text-fg-muted">
                <IconCreditCard className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">
                  Invoiced monthly · Net 30
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  Billing contact: finance@heliomotors.example · VAT DE811907980
                </p>
              </div>
              <Badge tone="published" size="sm">
                Approved for credit
              </Badge>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Invoices" />
          <CardBody className="p-0">
            <DataTable
              columns={columns}
              rows={INVOICES}
              rowKey={(row) => row.id}
              className="rounded-none border-0"
              caption="Advertising invoices"
            />
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
