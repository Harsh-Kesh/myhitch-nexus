"use client";

import { IconArrowUp, IconBuildingSkyscraper, IconCheck, IconMail, IconX } from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate, relativeTime } from "@/lib/utils";

interface EnterpriseApplication {
  id: string;
  name: string;
  country: string | null;
  orgType: string;
  isUpgradeRequest: boolean;
  enterpriseStatus: "pending" | "awaiting_payment" | "active" | "rejected" | null;
  enterprisePriceMinor: number | null;
  enterpriseBillingInterval: "month" | "year" | null;
  enterpriseDecidedAt: string | null;
  enterpriseDecidedByName: string | null;
  enterpriseNotes: string | null;
  createdAt: string;
  ownerAccountId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
}

interface SalesInquiry {
  id: string;
  accountId: string | null;
  fullName: string;
  email: string;
  company: string | null;
  message: string | null;
  createdAt: string;
}

const STATUS_TONE = {
  pending: "pending",
  awaiting_payment: "info",
  active: "published",
  rejected: "rejected",
} as const;

const STATUS_LABEL = {
  pending: "pending review",
  awaiting_payment: "awaiting payment",
  active: "active",
  rejected: "rejected",
} as const;

export default function AdminEnterprisePage() {
  const { toast } = useToast();
  const [applications, setApplications] = React.useState<EnterpriseApplication[]>([]);
  const [inquiries, setInquiries] = React.useState<SalesInquiry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState("pending");

  const [selected, setSelected] = React.useState<EnterpriseApplication | null>(null);
  const [decision, setDecision] = React.useState<"approved" | "rejected">("approved");
  const [notes, setNotes] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [billingInterval, setBillingInterval] = React.useState<"month" | "year">("month");
  const [deciding, setDeciding] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/enterprise/");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load.");
      setApplications(data.applications ?? []);
      setInquiries(data.inquiries ?? []);
    } catch (err) {
      toast({
        title: "Couldn't load Enterprise applications",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const statusOf = (app: EnterpriseApplication) => app.enterpriseStatus ?? "pending";

  const counts = {
    pending: applications.filter((a) => statusOf(a) === "pending").length,
    awaiting_payment: applications.filter((a) => statusOf(a) === "awaiting_payment").length,
    active: applications.filter((a) => statusOf(a) === "active").length,
    rejected: applications.filter((a) => statusOf(a) === "rejected").length,
  };

  const filtered = tab === "all" ? applications : applications.filter((a) => statusOf(a) === tab);

  const submitDecision = async () => {
    if (!selected) return;
    if (decision === "approved") {
      const priceMinor = Math.round(Number(price || 0) * 100);
      if (!priceMinor || priceMinor <= 0) {
        toast({ title: "Enter a valid price", tone: "error" });
        return;
      }
    }
    setDeciding(true);
    try {
      const res = await fetch(`/api/admin/enterprise/${selected.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: decision,
          notes,
          ...(decision === "approved"
            ? { priceMinor: Math.round(Number(price || 0) * 100), billingInterval }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to record the decision.");
      toast({
        title: decision === "approved" ? "Price set — awaiting customer payment" : "Application rejected",
        description: "Recorded in the audit log.",
        tone: decision === "approved" ? "success" : "warning",
      });
      setSelected(null);
      loadData();
    } catch (err) {
      toast({
        title: "Couldn't record decision",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    } finally {
      setDeciding(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Enterprise applications"
        description="Nexus Enterprise has no self-serve checkout — set a real negotiated price here once a sales deal closes. Real access unlocks only once the customer actually pays it."
      />

      <PageBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Awaiting review" value={String(counts.pending)} icon={<IconBuildingSkyscraper />} />
          <Stat label="Awaiting payment" value={String(counts.awaiting_payment)} />
          <Stat label="Active" value={String(counts.active)} />
          <Stat label="Rejected" value={String(counts.rejected)} />
        </div>

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "pending", label: "Pending", count: counts.pending },
            { value: "awaiting_payment", label: "Awaiting payment", count: counts.awaiting_payment },
            { value: "active", label: "Active", count: counts.active },
            { value: "rejected", label: "Rejected", count: counts.rejected },
            { value: "all", label: "All", count: applications.length },
          ]}
        />

        {!loading && filtered.length === 0 ? (
          <EmptyState
            icon={<IconBuildingSkyscraper />}
            title="Nothing here"
            description="No Enterprise applications match this filter."
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((app) => (
              <Card key={app.id}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {app.name}
                      <Badge tone={STATUS_TONE[statusOf(app)]} size="sm">
                        {STATUS_LABEL[statusOf(app)]}
                      </Badge>
                      {app.isUpgradeRequest ? (
                        <Badge tone="outline" size="sm">
                          <IconArrowUp className="size-3" />
                          Upgrade from {app.orgType}
                        </Badge>
                      ) : null}
                    </span>
                  }
                  description={`${app.ownerEmail ?? "No owner"} · ${app.country ?? "—"} · registered ${relativeTime(app.createdAt)}${
                    app.enterprisePriceMinor
                      ? ` · ${formatCurrency(app.enterprisePriceMinor, "AUD")}/${app.enterpriseBillingInterval}`
                      : ""
                  }`}
                  action={
                    statusOf(app) === "pending" || statusOf(app) === "awaiting_payment" ? (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelected(app);
                            setDecision("rejected");
                            setNotes("");
                          }}
                        >
                          <IconX />
                          Reject
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setSelected(app);
                            setDecision("approved");
                            setNotes("");
                            setPrice(app.enterprisePriceMinor ? String(app.enterprisePriceMinor / 100) : "");
                            setBillingInterval(app.enterpriseBillingInterval ?? "month");
                          }}
                        >
                          <IconCheck />
                          {statusOf(app) === "awaiting_payment" ? "Update price" : "Approve & set price"}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelected(app);
                          setDecision(statusOf(app) === "active" ? "rejected" : "approved");
                          setNotes("");
                          setPrice(app.enterprisePriceMinor ? String(app.enterprisePriceMinor / 100) : "");
                          setBillingInterval(app.enterpriseBillingInterval ?? "month");
                        }}
                      >
                        Change decision
                      </Button>
                    )
                  }
                />
                {app.enterpriseNotes ? (
                  <CardBody className="text-xs text-fg-muted">
                    <span className="font-medium text-fg-subtle">
                      {app.enterpriseDecidedByName ?? "Admin"} · {app.enterpriseDecidedAt ? formatDate(app.enterpriseDecidedAt) : ""}:
                    </span>{" "}
                    {app.enterpriseNotes}
                  </CardBody>
                ) : null}
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardHeader
            title="Sales inquiries"
            description="Every real 'Contact Sales' submission, including ones with no registered account yet."
          />
          <CardBody className="space-y-3">
            {inquiries.length === 0 ? (
              <p className="text-sm text-fg-subtle">No sales inquiries yet.</p>
            ) : (
              inquiries.slice(0, 20).map((inquiry) => (
                <div key={inquiry.id} className="flex flex-wrap items-start gap-3 rounded border border-border p-3">
                  <IconMail className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">
                      {inquiry.fullName} <span className="text-fg-subtle">· {inquiry.email}</span>
                      {!inquiry.accountId ? (
                        <span className="ml-2 text-2xs text-fg-subtle">(no account — ask them to register)</span>
                      ) : null}
                    </p>
                    {inquiry.company ? <p className="text-xs text-fg-muted">{inquiry.company}</p> : null}
                    {inquiry.message ? <p className="mt-1 text-xs text-fg-muted">{inquiry.message}</p> : null}
                  </div>
                  <span className="text-2xs text-fg-subtle nx-tnum">{relativeTime(inquiry.createdAt)}</span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </PageBody>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={`${decision === "approved" ? "Approve & set price for" : "Reject"} ${selected?.name ?? ""}`}
        description={
          decision === "approved"
            ? "The customer gets a real Stripe checkout for exactly this price — access unlocks once they actually pay it, not immediately."
            : "The organisation stays locked out of Business Studio until reconsidered."
        }
        tone={decision === "rejected" ? "danger" : "default"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Cancel
            </Button>
            <Button
              variant={decision === "approved" ? "primary" : "danger"}
              loading={deciding}
              onClick={submitDecision}
            >
              {decision === "approved" ? "Save price" : "Reject"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {decision === "approved" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price (AUD)" htmlFor="ent-price" required>
                <Input
                  id="ent-price"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  inputMode="decimal"
                  placeholder="1200.00"
                />
              </Field>
              <Field label="Billing interval" htmlFor="ent-interval">
                <Select
                  id="ent-interval"
                  value={billingInterval}
                  onChange={(event) => setBillingInterval(event.target.value as "month" | "year")}
                >
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </Select>
              </Field>
            </div>
          ) : null}
          <Field label="Notes" htmlFor="ent-notes" hint="Written to the audit log. Optional.">
            <Textarea
              id="ent-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder={
                decision === "approved"
                  ? "Signed annual contract 2026-09-26."
                  : "No response to follow-up after 3 attempts."
              }
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
