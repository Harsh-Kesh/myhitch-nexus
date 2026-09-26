"use client";

import { IconCreditCard, IconDownload, IconFileInvoice, IconHeadset } from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ProgressBar } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { looksLikeRealId } from "@/lib/mock-api";
import { useCampaigns, useCurrentUser } from "@/lib/mock-api/hooks";
import { formatCurrency, formatDate } from "@/lib/utils";

// The real /api/campaigns route resolves the org from the signed-in account's own
// session regardless of what's passed here, so this only ever mattered for the React
// Query cache key — still worth getting right rather than caching every real business's
// campaigns under the shared demo account's key.
const MOCK_CHANNEL_ID = "ch_helio";

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
  const { data: user } = useCurrentUser();
  const channelId =
    user?.channelId && looksLikeRealId(user.channelId) ? user.channelId : MOCK_CHANNEL_ID;
  const { data: campaigns = [] } = useCampaigns(channelId);
  const { toast } = useToast();

  // "Priority business support" is a real, included Business-plan benefit (see /plans'
  // own Business-tier copy) — the only place to actually file a ticket used to be the
  // Enterprise Hub page, which is now correctly gated to Nexus Enterprise only. This is
  // the real entry point Business accounts need so that benefit still does something.
  const [supportOpen, setSupportOpen] = React.useState(false);
  const [supportSubject, setSupportSubject] = React.useState("");
  const [supportMessage, setSupportMessage] = React.useState("");
  const [submittingTicket, setSubmittingTicket] = React.useState(false);

  const submitSupportTicket = async () => {
    setSubmittingTicket(true);
    try {
      const res = await fetch("/api/business/support/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: supportSubject, message: supportMessage, priority: "high" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Couldn't submit your ticket.");
      }
      toast({ title: "Support ticket sent", description: "Our team will follow up shortly." });
      setSupportOpen(false);
      setSupportSubject("");
      setSupportMessage("");
    } catch (err) {
      toast({
        title: "Couldn't submit your ticket",
        description: err instanceof Error ? err.message : "Something went wrong — try again.",
        tone: "error",
      });
    } finally {
      setSubmittingTicket(false);
    }
  };

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
                <p className="text-xs text-fg-subtle">$29.00 / month ($290 / year option)</p>
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
                <Button
                  variant="secondary"
                  size="xs"
                  className="mt-2"
                  onClick={() => setSupportOpen(true)}
                >
                  <IconHeadset className="size-3.5" />
                  Contact support
                </Button>
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
            value={formatCurrency(spent, "AUD", { compact: true })}
          />
          <Stat
            label="Committed budget"
            value={formatCurrency(committed, "AUD", { compact: true })}
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
                  valueLabel={`${formatCurrency(campaign.spend.amount, "AUD", { compact: true })} / ${formatCurrency(campaign.budget.amount, "AUD", { compact: true })}`}
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

      <Modal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        title="Contact support"
        description="Priority routing — included with Nexus Business."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSupportOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={submittingTicket}
              disabled={!supportSubject.trim() || !supportMessage.trim()}
              onClick={submitSupportTicket}
            >
              Send
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Subject" htmlFor="support-subject" required>
            <Input
              id="support-subject"
              value={supportSubject}
              onChange={(e) => setSupportSubject(e.target.value)}
              placeholder="Campaign not delivering impressions"
            />
          </Field>
          <Field label="Message" htmlFor="support-message" required>
            <Textarea
              id="support-message"
              rows={4}
              value={supportMessage}
              onChange={(e) => setSupportMessage(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
