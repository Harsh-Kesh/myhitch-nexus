"use client";

import { IconCreditCard, IconExternalLink, IconFileInvoice, IconHeadset } from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ConfirmModal, Modal } from "@/components/ui/modal";
import { ProgressBar } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { looksLikeRealId } from "@/lib/mock-api";
import {
  useCampaigns,
  useCancelSubscription,
  useCurrentUser,
  usePlanPurchases,
  useResumeSubscription,
  useSubscriptions,
} from "@/lib/mock-api/hooks";
import type { PlanPurchase } from "@/lib/mock-api/types";
import { formatCurrency, formatDate } from "@/lib/utils";

// The real /api/campaigns route resolves the org from the signed-in account's own
// session regardless of what's passed here, so this only ever mattered for the React
// Query cache key — still worth getting right rather than caching every real business's
// campaigns under the shared demo account's key.
const MOCK_CHANNEL_ID = "ch_helio";

export default function BillingPage() {
  const { data: user } = useCurrentUser();
  const channelId =
    user?.channelId && looksLikeRealId(user.channelId) ? user.channelId : MOCK_CHANNEL_ID;
  const { data: campaigns = [] } = useCampaigns(channelId);
  const { toast } = useToast();

  // The real Business plan subscription — /business/layout.tsx's own checkRealPlanActive()
  // gate already guarantees whoever reaches this page holds an active one, so there's
  // always exactly one relevant row here once subscriptions have loaded.
  const isRealAccount = Boolean(user?.id && looksLikeRealId(user.id));
  const { data: subscriptions = [] } = useSubscriptions();
  const { data: purchases = [] } = usePlanPurchases();
  const cancelSubscription = useCancelSubscription();
  const resumeSubscription = useResumeSubscription();
  const [cancelling, setCancelling] = React.useState(false);

  const businessSubscription = subscriptions.find((s) => s.plan === "business");
  const businessPurchases = purchases.filter((p) => p.plan === "business");

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

  const columns: Array<Column<PlanPurchase>> = [
    {
      key: "number",
      header: "Invoice",
      sortValue: (row) => row.invoiceNumber,
      cell: (row) => <span className="font-mono text-xs text-fg">{row.invoiceNumber}</span>,
    },
    {
      key: "purchasedAt",
      header: "Date",
      sortValue: (row) => row.purchasedAt,
      cell: (row) => <span className="nx-tnum">{formatDate(row.purchasedAt)}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (row) => row.price.amount,
      cell: (row) => (
        <span className="nx-tnum font-medium text-fg">
          {formatCurrency(row.price.amount, row.price.currency)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) =>
        row.receiptUrl ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => window.open(row.receiptUrl!, "_blank", "noopener,noreferrer")}
          >
            <IconExternalLink />
            Receipt
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Billing & Subscription"
        description="Nexus Business subscription plan, commercial advertising spend, campaign invoices, and priority support status."
      />

      <PageBody className="space-y-6">
        {/* Nexus Business Subscription Overview — real: sourced from the account's own
            active Stripe subscription, the same one /business/layout.tsx's
            checkRealPlanActive() gate already requires to reach this page at all. */}
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader
            title="Nexus Business Subscription"
            description="Your active commercial plan and included features"
            action={
              businessSubscription ? (
                <Badge
                  tone={businessSubscription.cancelAtPeriodEnd ? "archived" : businessSubscription.status === "past-due" ? "danger" : "published"}
                  size="sm"
                >
                  {businessSubscription.cancelAtPeriodEnd ? "Ending" : businessSubscription.status === "past-due" ? "Payment issue" : "Active"}
                </Badge>
              ) : null
            }
          />
          <CardBody className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-fg-muted">Plan Tier</p>
                <p className="font-semibold text-fg">Nexus Business</p>
                <p className="text-xs text-fg-subtle">
                  {businessSubscription
                    ? `${formatCurrency(businessSubscription.price.amount, businessSubscription.price.currency)} / ${businessSubscription.interval === "annual" ? "year" : "month"}`
                    : "Loading…"}
                </p>
              </div>
              <div>
                <p className="text-xs text-fg-muted">
                  {businessSubscription?.cancelAtPeriodEnd ? "Access ends" : "Renews"}
                </p>
                <p className="font-semibold text-fg">
                  {businessSubscription?.renewsAt ? formatDate(businessSubscription.renewsAt, "long") : "—"}
                </p>
                <p className="text-xs text-fg-subtle">
                  {businessSubscription?.cancelAtPeriodEnd ? "Won't renew" : "Billed automatically"}
                </p>
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
            {businessSubscription ? (
              <div className="flex justify-end gap-2 border-t border-border pt-3">
                {businessSubscription.cancelAtPeriodEnd ? (
                  <Button
                    variant="primary"
                    size="sm"
                    loading={resumeSubscription.isPending}
                    onClick={async () => {
                      try {
                        await resumeSubscription.mutateAsync(businessSubscription.id);
                        toast({ title: "Subscription resumed", description: "It'll keep renewing as normal." });
                      } catch (err) {
                        toast({
                          title: "Couldn't resume",
                          description: err instanceof Error ? err.message : undefined,
                          tone: "error",
                        });
                      }
                    }}
                  >
                    Resume subscription
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setCancelling(true)}>
                    Cancel plan
                  </Button>
                )}
              </div>
            ) : null}
          </CardBody>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat
            label="Spent to date"
            value={formatCurrency(spent, "AUD", { compact: true })}
            icon={<IconFileInvoice />}
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
                    title: "Payment method",
                    description: isRealAccount
                      ? "Changing your card isn't built yet — cancel and re-subscribe with a different card for now."
                      : "Payment details are never collected in this prototype.",
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
                  Billed automatically via Stripe
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  Charged on the card used at checkout — no manual invoicing.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Invoices" description="Real receipts from Stripe for this plan's past payments." />
          <CardBody className="p-0">
            {businessPurchases.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  compact
                  icon={<IconFileInvoice />}
                  title="No invoices yet"
                  description="Receipts appear here after your first billing cycle."
                />
              </div>
            ) : (
              <DataTable
                columns={columns}
                rows={businessPurchases}
                rowKey={(row) => row.id}
                className="rounded-none border-0"
                caption="Business plan invoices"
              />
            )}
          </CardBody>
        </Card>
      </PageBody>

      <ConfirmModal
        open={cancelling}
        onClose={() => setCancelling(false)}
        onConfirm={async () => {
          if (!businessSubscription) return;
          await cancelSubscription.mutateAsync(businessSubscription.id);
          toast({
            title: "Subscription cancelled",
            description: `Access continues until ${formatDate(businessSubscription.renewsAt)}.`,
            tone: "warning",
          });
          setCancelling(false);
        }}
        title="Cancel Nexus Business?"
        description="You keep Business Studio access until the end of the current billing period. Nothing is refunded automatically."
        confirmLabel="Cancel subscription"
        loading={cancelSubscription.isPending}
      />

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
