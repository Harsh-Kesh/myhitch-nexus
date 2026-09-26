"use client";

import { IconBuildingSkyscraper, IconCheck, IconMail, IconX } from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { formatDate, relativeTime } from "@/lib/utils";

interface EnterpriseApplication {
  id: string;
  name: string;
  country: string | null;
  enterpriseStatus: "pending" | "active" | "rejected" | null;
  enterpriseDecidedAt: string | null;
  enterpriseDecidedByName: string | null;
  enterpriseNotes: string | null;
  createdAt: string;
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
  active: "published",
  rejected: "rejected",
} as const;

export default function AdminEnterprisePage() {
  const { toast } = useToast();
  const [applications, setApplications] = React.useState<EnterpriseApplication[]>([]);
  const [inquiries, setInquiries] = React.useState<SalesInquiry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState("pending");

  const [selected, setSelected] = React.useState<EnterpriseApplication | null>(null);
  const [decision, setDecision] = React.useState<"active" | "rejected">("active");
  const [notes, setNotes] = React.useState("");
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

  const counts = {
    pending: applications.filter((a) => a.enterpriseStatus === "pending").length,
    active: applications.filter((a) => a.enterpriseStatus === "active").length,
    rejected: applications.filter((a) => a.enterpriseStatus === "rejected").length,
  };

  const filtered = tab === "all" ? applications : applications.filter((a) => a.enterpriseStatus === tab);

  const submitDecision = async () => {
    if (!selected) return;
    setDeciding(true);
    try {
      const res = await fetch(`/api/admin/enterprise/${selected.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: decision, notes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to record the decision.");
      toast({
        title: decision === "active" ? "Enterprise plan activated" : "Application rejected",
        description: "Recorded in the audit log.",
        tone: decision === "active" ? "success" : "warning",
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
        description="Nexus Enterprise has no self-serve checkout — activate a real account here once a sales deal actually closes."
      />

      <PageBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Awaiting approval" value={String(counts.pending)} icon={<IconBuildingSkyscraper />} />
          <Stat label="Active" value={String(counts.active)} />
          <Stat label="Rejected" value={String(counts.rejected)} />
        </div>

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "pending", label: "Pending", count: counts.pending },
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
                      <Badge tone={STATUS_TONE[app.enterpriseStatus ?? "pending"]} size="sm">
                        {app.enterpriseStatus ?? "pending"}
                      </Badge>
                    </span>
                  }
                  description={`${app.ownerEmail ?? "No owner"} · ${app.country ?? "—"} · registered ${relativeTime(app.createdAt)}`}
                  action={
                    app.enterpriseStatus === "pending" ? (
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
                            setDecision("active");
                            setNotes("");
                          }}
                        >
                          <IconCheck />
                          Activate
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelected(app);
                          setDecision(app.enterpriseStatus === "active" ? "rejected" : "active");
                          setNotes("");
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
        title={`${decision === "active" ? "Activate" : "Reject"} ${selected?.name ?? ""}`}
        description={
          decision === "active"
            ? "The organisation's owner gets real access to Business Studio and the Enterprise Hub immediately."
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
              variant={decision === "active" ? "primary" : "danger"}
              loading={deciding}
              onClick={submitDecision}
            >
              {decision === "active" ? "Activate" : "Reject"}
            </Button>
          </>
        }
      >
        <Field label="Notes" htmlFor="ent-notes" hint="Written to the audit log. Optional.">
          <Textarea
            id="ent-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder={
              decision === "active"
                ? "Signed contract confirmed 2026-09-26, annual term."
                : "No response to follow-up after 3 attempts."
            }
          />
        </Field>
      </Modal>
    </>
  );
}
