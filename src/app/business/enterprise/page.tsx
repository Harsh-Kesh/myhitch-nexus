"use client";

import {
  IconClipboardList,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconFileZip,
  IconHeadset,
  IconKey,
  IconPlus,
  IconRefresh,
  IconServer,
  IconSettings,
  IconShieldCheck,
  IconTrash,
  IconVideo,
} from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { Field, Input, Switch, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useCurrentUser } from "@/lib/mock-api/hooks";
import { formatDate, relativeTime } from "@/lib/utils";

interface ClientReviewItem {
  id: string;
  org_id: string;
  video_id: string;
  token: string;
  title: string;
  client_name: string;
  client_email: string | null;
  status: "pending" | "approved" | "changes_requested";
  feedback: string | null;
  version: number;
  expires_at: string | null;
  created_at: string;
}

interface EnterpriseTransferItem {
  id: string;
  org_id: string;
  title: string;
  file_name: string;
  file_size_bytes: string;
  download_url: string | null;
  asset_path: string | null;
  resolvedDownloadUrl: string | null;
  status: "active" | "expired";
  download_count: number;
  expires_at: string;
  created_at: string;
}

interface ApiKeyItem {
  id: string;
  org_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface AuditLogEntry {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  severity: string;
  createdAt: string;
}

interface SsoConfigItem {
  organizationId: string;
  idpMetadataUrl: string | null;
  ssoDomain: string | null;
  enabled: boolean;
  metadataVerified: boolean;
  metadataCheckedAt: string | null;
  updatedAt: string;
}

interface SupportTicketItem {
  id: string;
  organizationId: string;
  accountId: string | null;
  subject: string;
  message: string;
  priority: "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
}

export default function EnterpriseHubPage() {
  const { toast } = useToast();
  const { data: user } = useCurrentUser();
  // This whole hub — reviews, transfers, version control, audit trail, API keys — is a
  // Nexus Enterprise add-on, not part of Nexus Business (see the /plans page's own
  // feature list: "All Business features" plus these on the Enterprise tier). The API
  // routes behind every tab now enforce this for real; this just avoids firing eight
  // doomed requests and shows an honest blocked state instead of a broken-looking page
  // for a Business-tier account that lands here directly.
  const isEnterprise = Boolean(user?.roles.includes("producer"));
  const [activeTab, setActiveTab] = React.useState("overview");
  const [loading, setLoading] = React.useState(true);

  const [reviews, setReviews] = React.useState<ClientReviewItem[]>([]);
  const [transfers, setTransfers] = React.useState<EnterpriseTransferItem[]>([]);
  const [keys, setKeys] = React.useState<ApiKeyItem[]>([]);
  const [auditLogs, setAuditLogs] = React.useState<AuditLogEntry[]>([]);
  const [ssoConfig, setSsoConfig] = React.useState<SsoConfigItem | null>(null);
  const [tickets, setTickets] = React.useState<SupportTicketItem[]>([]);

  // Modals
  const [createReviewOpen, setCreateReviewOpen] = React.useState(false);
  const [createTransferOpen, setCreateTransferOpen] = React.useState(false);
  const [createKeyOpen, setCreateKeyOpen] = React.useState(false);
  const [revealedKey, setRevealedKey] = React.useState<string | null>(null);
  const [supportOpen, setSupportOpen] = React.useState(false);

  // SSO form
  const [ssoForm, setSsoForm] = React.useState({ idpMetadataUrl: "", ssoDomain: "", enabled: false });
  const [savingSso, setSavingSso] = React.useState(false);

  // Support ticket form
  const [ticketForm, setTicketForm] = React.useState<{ subject: string; message: string; priority: "normal" | "high" | "urgent" }>({
    subject: "",
    message: "",
    priority: "urgent",
  });
  const [submittingTicket, setSubmittingTicket] = React.useState(false);

  // Form states
  const [reviewForm, setReviewForm] = React.useState({
    videoId: "vid_nordic_echoes",
    title: "Brand Anthem — Director's Cut",
    clientName: "Acme Global Media",
    clientEmail: "reviews@acmeglobal.com",
    version: 1,
    expiresDays: 14,
  });

  const [transferForm, setTransferForm] = React.useState({
    title: "",
    expiresDays: 14,
  });
  const [transferFile, setTransferFile] = React.useState<File | null>(null);
  const [transferUploading, setTransferUploading] = React.useState(false);

  const [keyForm, setKeyForm] = React.useState({
    name: "Production CMS Integration",
    scopes: ["read:catalogue", "embed:player"],
    expiresDays: 90,
  });

  const [submitting, setSubmitting] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [resReviews, resTransfers, resKeys, resAudit, resSso, resTickets] = await Promise.all([
        fetch("/api/enterprise/reviews").then((r) => r.json()),
        fetch("/api/enterprise/transfers").then((r) => r.json()),
        fetch("/api/enterprise/keys").then((r) => r.json()),
        fetch("/api/enterprise/audit-logs").then((r) => r.json()),
        fetch("/api/enterprise/sso").then((r) => r.json()),
        fetch("/api/business/support").then((r) => r.json()),
      ]);

      if (resReviews.reviews) setReviews(resReviews.reviews);
      if (resTransfers.transfers) setTransfers(resTransfers.transfers);
      if (resKeys.keys) setKeys(resKeys.keys);
      if (resAudit.entries) setAuditLogs(resAudit.entries);
      if (resSso.config) {
        setSsoConfig(resSso.config);
        setSsoForm({
          idpMetadataUrl: resSso.config.idpMetadataUrl ?? "",
          ssoDomain: resSso.config.ssoDomain ?? "",
          enabled: resSso.config.enabled ?? false,
        });
      }
      if (resTickets.tickets) setTickets(resTickets.tickets);
    } catch (err: unknown) {
      toast({
        title: "Error loading enterprise data",
        description: err instanceof Error ? err.message : "An error occurred",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (isEnterprise) loadData();
    else setLoading(false);
  }, [loadData, isEnterprise]);

  // Review Submission
  const handleCreateReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/enterprise/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reviewForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create review");

      setReviews((prev) => [data.review, ...prev]);
      setCreateReviewOpen(false);

      navigator.clipboard.writeText(data.reviewUrl).catch(() => {});
      toast({
        title: "Review link generated",
        description: "Review URL copied to clipboard.",
        tone: "success",
      });
    } catch (err: unknown) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "An error occurred", tone: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  // Transfer Submission — a real signed-upload-then-register round trip (same shape as
  // the video-versions upload flow): get a signed URL, PUT the actual file bytes to
  // storage, then register the transfer row once the upload is confirmed to exist.
  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferFile) return;
    setSubmitting(true);
    setTransferUploading(true);
    try {
      const urlRes = await fetch("/api/enterprise/transfers/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: transferFile.name, fileSizeBytes: transferFile.size }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error ?? "Failed to start the upload.");

      const putRes = await fetch(urlData.signedUrl, { method: "PUT", body: transferFile });
      if (!putRes.ok) throw new Error("The file upload failed partway through — try again.");

      const res = await fetch("/api/enterprise/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: transferForm.title,
          fileName: transferFile.name,
          fileSizeBytes: transferFile.size,
          assetPath: urlData.path,
          expiresDays: transferForm.expiresDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create transfer");

      setTransfers((prev) => [data.transfer, ...prev]);
      setCreateTransferOpen(false);
      setTransferForm({ title: "", expiresDays: 14 });
      setTransferFile(null);
      toast({
        title: "Transfer created",
        description: "Large file transfer is now active.",
        tone: "success",
      });
    } catch (err: unknown) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "An error occurred", tone: "error" });
    } finally {
      setSubmitting(false);
      setTransferUploading(false);
    }
  };

  // Key Generation
  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/enterprise/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keyForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate key");

      setKeys((prev) => [data.key, ...prev]);
      setCreateKeyOpen(false);
      setRevealedKey(data.key.rawKey);
      toast({
        title: "API key generated",
        description: "Copy your API key before closing this prompt.",
        tone: "success",
      });
    } catch (err: unknown) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "An error occurred", tone: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  // Revoke Key
  const handleRevokeKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This action is immediate and irreversible.")) {
      return;
    }
    try {
      const res = await fetch(`/api/enterprise/keys?id=${keyId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke API key");
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
      toast({
        title: "API Key Revoked",
        description: "The key can no longer make requests.",
        tone: "info",
      });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "An error occurred", tone: "error" });
    }
  };

  const handleSaveSso = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSso(true);
    try {
      const res = await fetch("/api/enterprise/sso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ssoForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save SSO configuration");
      setSsoConfig(data.config);
      toast({
        title: "SSO configuration saved",
        description: data.config.idpMetadataUrl
          ? data.config.metadataVerified
            ? "Metadata URL verified — it resolves to real SAML metadata."
            : "Couldn't verify that metadata URL — check it's reachable and points to real SAML metadata XML."
          : undefined,
        tone: data.config.idpMetadataUrl && !data.config.metadataVerified ? "warning" : "success",
      });
    } catch (err: unknown) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "An error occurred", tone: "error" });
    } finally {
      setSavingSso(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingTicket(true);
    try {
      const res = await fetch("/api/business/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ticketForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit ticket");
      setTickets((prev) => [data.ticket, ...prev]);
      setSupportOpen(false);
      setTicketForm({ subject: "", message: "", priority: "urgent" });
      toast({ title: "Support ticket submitted", description: "Our team will reach out shortly.", tone: "success" });
    } catch (err: unknown) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "An error occurred", tone: "error" });
    } finally {
      setSubmittingTicket(false);
    }
  };

  const copyToClipboard = (text: string, label = "Copied") => {
    navigator.clipboard.writeText(text);
    toast({ title: label, description: text, tone: "success" });
  };

  const tabItems: TabItem[] = [
    { value: "overview", label: "Overview", icon: <IconServer className="size-4" /> },
    {
      value: "reviews",
      label: "Client Reviews",
      icon: <IconVideo className="size-4" />,
      count: reviews.length,
    },
    {
      value: "transfers",
      label: "Large File Transfers",
      icon: <IconFileZip className="size-4" />,
      count: transfers.length,
    },
    {
      value: "api",
      label: "Developer & Partner API",
      icon: <IconKey className="size-4" />,
      count: keys.length,
    },
    {
      value: "audit",
      label: "Audit Trail",
      icon: <IconClipboardList className="size-4" />,
      count: auditLogs.length,
    },
    {
      value: "settings",
      label: "Settings",
      icon: <IconSettings className="size-4" />,
    },
  ];

  const pendingReviews = reviews.filter((r) => r.status === "pending").length;
  const approvedReviews = reviews.filter((r) => r.status === "approved").length;
  const activeTransfers = transfers.filter((t) => t.status === "active").length;

  if (user && !isEnterprise) {
    return (
      <>
        <PageHeader
          title="Enterprise Suite"
          description="Secure media workspace, client review & approval workflows, large file transfers, version control, and Partner API integrations."
        />
        <PageBody>
          <Card>
            <CardBody className="flex flex-col items-center gap-3 py-16 text-center">
              <IconKey className="size-10 text-fg-muted/40" />
              <p className="text-base font-medium text-fg">Included with Nexus Enterprise</p>
              <p className="max-w-md text-sm text-fg-muted">
                Client review workflows, large file transfers, version control, an audit
                trail and API access are part of the Nexus Enterprise plan. Your current
                plan doesn&apos;t include them.
              </p>
              <Button href="/plans">View plans</Button>
            </CardBody>
          </Card>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Enterprise Suite"
        description="Secure media workspace, client review & approval workflows, large file transfers (up to 500GB), version control, Partner API integrations (TPI-9), and dedicated infrastructure."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSupportOpen(true)}>
              <IconHeadset className="size-4" />
              Priority Support
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={loading}
              onClick={loadData}
            >
              <IconRefresh className="size-4" />
              Refresh
            </Button>
            {activeTab === "reviews" && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateReviewOpen(true)}
              >
                <IconPlus className="size-4" />
                New Review Link
              </Button>
            )}
            {activeTab === "transfers" && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateTransferOpen(true)}
              >
                <IconPlus className="size-4" />
                New File Transfer
              </Button>
            )}
            {activeTab === "api" && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateKeyOpen(true)}
              >
                <IconPlus className="size-4" />
                Generate API Key
              </Button>
            )}
          </div>
        }
      >
        <Tabs items={tabItems} value={activeTab} onChange={setActiveTab} />
      </PageHeader>

      <PageBody className="space-y-6">
        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Pending Reviews" value={pendingReviews} hint="Awaiting client sign-off" />
              <Stat label="Approved Deliverables" value={approvedReviews} hint="Client approved" />
              <Stat label="Active File Transfers" value={activeTransfers} hint="Ready for download" />
              <Stat label="Active API Keys" value={keys.length} hint="Partner integrations" />
            </div>

            {/* Quick Actions */}
            <Card>
              <CardHeader title="Enterprise Capabilities" description="Select a workflow to initiate" />
              <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div
                  onClick={() => setCreateReviewOpen(true)}
                  className="group flex cursor-pointer flex-col justify-between rounded-xl border border-border/60 bg-bg-subtle/30 p-5 transition hover:border-accent/50 hover:bg-bg-subtle"
                >
                  <div className="space-y-2">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
                      <IconVideo className="size-5" />
                    </span>
                    <h3 className="font-semibold text-fg">Client Review Links</h3>
                    <p className="text-xs leading-relaxed text-fg-muted">
                      Generate zero-friction, watermarked preview links for external clients to approve or request changes without creating accounts.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-xs font-medium text-accent">
                    <span>Create link</span>
                    <IconPlus className="size-3.5" />
                  </div>
                </div>

                <div
                  onClick={() => setCreateTransferOpen(true)}
                  className="group flex cursor-pointer flex-col justify-between rounded-xl border border-border/60 bg-bg-subtle/30 p-5 transition hover:border-accent/50 hover:bg-bg-subtle"
                >
                  <div className="space-y-2">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
                      <IconFileZip className="size-5" />
                    </span>
                    <h3 className="font-semibold text-fg">Large File Transfers</h3>
                    <p className="text-xs leading-relaxed text-fg-muted">
                      Deliver uncompressed master files, ProRes masters, and raw footage packages up to 500GB with custom expiration windows.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-xs font-medium text-accent">
                    <span>Initiate transfer</span>
                    <IconPlus className="size-3.5" />
                  </div>
                </div>

                <div
                  onClick={() => setCreateKeyOpen(true)}
                  className="group flex cursor-pointer flex-col justify-between rounded-xl border border-border/60 bg-bg-subtle/30 p-5 transition hover:border-accent/50 hover:bg-bg-subtle"
                >
                  <div className="space-y-2">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
                      <IconKey className="size-5" />
                    </span>
                    <h3 className="font-semibold text-fg">Partner & Developer API</h3>
                    <p className="text-xs leading-relaxed text-fg-muted">
                      Syndicate videos to partner websites with signed embed iframes, query catalogue endpoints, or ingest media programmatically (TPI-9).
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-xs font-medium text-accent">
                    <span>Generate key</span>
                    <IconPlus className="size-3.5" />
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Regional Infrastructure & Compliance Notice — deliberately no certification
                claims here: this platform has not undergone a SOC 2, HIPAA or APP
                compliance audit, and the database region below must match the real
                Supabase project region, not an aspirational one. Update this copy only
                when a real audit/region change has actually happened, not preemptively. */}
            <div className="flex items-start gap-4 rounded-xl border border-border/50 bg-bg-surface p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
                <IconShieldCheck className="size-5" />
              </span>
              <div className="space-y-1 text-sm">
                <h4 className="font-semibold text-fg">Data residency and compliance</h4>
                <p className="text-xs leading-relaxed text-fg-muted">
                  Enterprise assets and review data are stored in this platform&apos;s
                  Postgres database. No SOC 2, HIPAA or formal regional-residency
                  certification has been completed yet — talk to your account manager
                  about compliance requirements before storing regulated data here.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CLIENT REVIEWS */}
        {activeTab === "reviews" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-fg">Client Review & Approval Workflows</h3>
                <p className="text-xs text-fg-muted">
                  Share watermarked video drafts with clients for timestamped feedback and sign-off.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateReviewOpen(true)}
              >
                <IconPlus className="size-4" />
                New Review Link
              </Button>
            </div>

            {reviews.length === 0 ? (
              <Card>
                <CardBody className="py-12 text-center">
                  <IconVideo className="mx-auto size-10 text-fg-muted/40" />
                  <h3 className="mt-3 font-semibold text-fg">No client reviews created yet</h3>
                  <p className="mt-1 text-xs text-fg-muted">
                    Generate your first review link to send to clients for approval.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-4"
                    onClick={() => setCreateReviewOpen(true)}
                  >
                    Create Review Link
                  </Button>
                </CardBody>
              </Card>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/60 bg-bg-surface">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border/60 bg-bg-subtle/40 text-xs text-fg-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">Deliverable / Video</th>
                      <th className="px-4 py-3 font-medium">Client</th>
                      <th className="px-4 py-3 font-medium">Version</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Expires</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {reviews.map((r) => {
                      const reviewUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/review/${r.token}`;
                      return (
                        <tr key={r.id} className="hover:bg-bg-subtle/30">
                          <td className="px-4 py-3">
                            <div className="font-medium text-fg">{r.title}</div>
                            {r.feedback && (
                              <p className="mt-0.5 max-w-xs truncate text-xs text-fg-muted">
                                Note: {r.feedback}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-fg">{r.client_name}</div>
                            {r.client_email && (
                              <div className="text-xs text-fg-muted">{r.client_email}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone="neutral" size="sm">
                              v{r.version}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              tone={
                                r.status === "approved"
                                  ? "success"
                                  : r.status === "changes_requested"
                                  ? "danger"
                                  : "warning"
                              }
                              size="sm"
                            >
                              {r.status === "approved"
                                ? "Approved"
                                : r.status === "changes_requested"
                                ? "Changes Requested"
                                : "Pending Review"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-fg-muted">
                            {r.expires_at ? formatDate(r.expires_at) : "Never"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(reviewUrl, "Review link copied")}
                              >
                                <IconCopy className="size-3.5" />
                                Copy Link
                              </Button>
                              <a
                                href={`/review/${r.token}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-fg-muted hover:text-fg rounded hover:bg-surface-2"
                              >
                                <IconExternalLink className="size-3.5" />
                                View
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LARGE FILE TRANSFERS */}
        {activeTab === "transfers" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-fg">Large File Transfers</h3>
                <p className="text-xs text-fg-muted">
                  Securely deliver full-resolution ProRes masters, raw assets, and project files.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateTransferOpen(true)}
              >
                <IconPlus className="size-4" />
                New File Transfer
              </Button>
            </div>

            {transfers.length === 0 ? (
              <Card>
                <CardBody className="py-12 text-center">
                  <IconFileZip className="mx-auto size-10 text-fg-muted/40" />
                  <h3 className="mt-3 font-semibold text-fg">No file transfers active</h3>
                  <p className="mt-1 text-xs text-fg-muted">
                    Create a high-speed transfer package for client deliverables.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-4"
                    onClick={() => setCreateTransferOpen(true)}
                  >
                    Initiate Transfer
                  </Button>
                </CardBody>
              </Card>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/60 bg-bg-surface">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border/60 bg-bg-subtle/40 text-xs text-fg-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">Package Title</th>
                      <th className="px-4 py-3 font-medium">File Name</th>
                      <th className="px-4 py-3 font-medium">Size</th>
                      <th className="px-4 py-3 font-medium">Downloads</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Expires</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {transfers.map((t) => {
                      const sizeInGB = (
                        parseInt(t.file_size_bytes, 10) /
                        (1024 * 1024 * 1024)
                      ).toFixed(2);
                      return (
                        <tr key={t.id} className="hover:bg-bg-subtle/30">
                          <td className="px-4 py-3 font-medium text-fg">{t.title}</td>
                          <td className="px-4 py-3 font-mono text-xs text-fg-muted">
                            {t.file_name}
                          </td>
                          <td className="px-4 py-3 text-xs text-fg">{sizeInGB} GB</td>
                          <td className="px-4 py-3 text-xs text-fg-muted">{t.download_count}</td>
                          <td className="px-4 py-3">
                            <Badge
                              tone={t.status === "active" ? "success" : "neutral"}
                              size="sm"
                            >
                              {t.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-fg-muted">
                            {formatDate(t.expires_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {t.resolvedDownloadUrl && (
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    window.open(t.resolvedDownloadUrl!, "_blank", "noopener,noreferrer")
                                  }
                                >
                                  <IconDownload className="size-3.5" />
                                  Download
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(t.resolvedDownloadUrl!, "Download link copied")}
                                >
                                  <IconCopy className="size-3.5" />
                                  Copy link
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: DEVELOPER & PARTNER API (TPI-9) */}
        {activeTab === "api" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-fg">Developer & Partner API (TPI-9)</h3>
                <p className="text-xs text-fg-muted">
                  Integrate Nexus video catalogue, syndicate responsive embed players, and automate media pipelines.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/api/v1/partner/openapi.json"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border-strong text-fg rounded hover:bg-surface-2"
                >
                  <IconExternalLink className="size-4" />
                  OpenAPI Spec
                </a>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setCreateKeyOpen(true)}
                >
                  <IconPlus className="size-4" />
                  Generate API Key
                </Button>
              </div>
            </div>

            {/* Keys Table */}
            <Card>
              <CardHeader
                title="Active API Keys"
                description="Keys grant programmatic access to partner endpoints"
              />
              <CardBody className="p-0">
                {keys.length === 0 ? (
                  <div className="py-8 text-center text-xs text-fg-muted">
                    No active API keys found. Generate a key to begin using the Partner API.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border/60 bg-bg-subtle/40 text-xs text-fg-muted">
                        <tr>
                          <th className="px-4 py-3 font-medium">Name</th>
                          <th className="px-4 py-3 font-medium">Key Prefix</th>
                          <th className="px-4 py-3 font-medium">Scopes</th>
                          <th className="px-4 py-3 font-medium">Last Used</th>
                          <th className="px-4 py-3 font-medium">Created</th>
                          <th className="px-4 py-3 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {keys.map((k) => (
                          <tr key={k.id} className="hover:bg-bg-subtle/30">
                            <td className="px-4 py-3 font-medium text-fg">{k.name}</td>
                            <td className="px-4 py-3 font-mono text-xs text-fg-muted">
                              {k.key_prefix}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {k.scopes.map((s) => (
                                  <Badge key={s} tone="neutral" size="sm">
                                    {s}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-fg-muted">
                              {k.last_used_at ? formatDate(k.last_used_at) : "Never"}
                            </td>
                            <td className="px-4 py-3 text-xs text-fg-muted">
                              {formatDate(k.created_at)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-danger hover:bg-danger/10 hover:text-danger"
                                onClick={() => handleRevokeKey(k.id)}
                              >
                                <IconTrash className="size-3.5" />
                                Revoke
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Quickstart Integration Guide */}
            <Card>
              <CardHeader
                title="Partner API Quickstart"
                description="Authenticate requests with Bearer tokens or the X-API-Key header"
              />
              <CardBody className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-fg-muted">
                    <span className="font-semibold text-fg">1. Query Catalogue Videos (GET /api/v1/partner/videos)</span>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          `curl -H "Authorization: Bearer nx_live_YOUR_KEY" "${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/partner/videos?limit=10"`,
                        )
                      }
                      className="flex items-center gap-1 hover:text-fg"
                    >
                      <IconCopy className="size-3" />
                      <span>Copy cURL</span>
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded-lg bg-bg-subtle p-3 font-mono text-xs text-fg">
                    {`curl -X GET "${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/partner/videos?limit=10" \\
  -H "Authorization: Bearer nx_live_YOUR_API_KEY"`}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-fg-muted">
                    <span className="font-semibold text-fg">2. Generate Syndicated Embed Player (POST /api/v1/partner/embed)</span>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          `curl -X POST -H "Authorization: Bearer nx_live_YOUR_KEY" -H "Content-Type: application/json" -d '{"videoId":"vid_nordic_echoes"}' "${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/partner/embed"`,
                        )
                      }
                      className="flex items-center gap-1 hover:text-fg"
                    >
                      <IconCopy className="size-3" />
                      <span>Copy cURL</span>
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded-lg bg-bg-subtle p-3 font-mono text-xs text-fg">
                    {`curl -X POST "${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/partner/embed" \\
  -H "Authorization: Bearer nx_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"videoId": "vid_nordic_echoes", "theme": "dark"}'`}
                  </pre>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {/* TAB 5: AUDIT TRAIL */}
        {activeTab === "audit" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-fg">Audit Trail</h3>
              <p className="text-xs text-fg-muted">
                Real actions taken by anyone on your team — the platform&apos;s own audit log, scoped to your
                organization&apos;s members.
              </p>
            </div>
            {auditLogs.length === 0 ? (
              <Card>
                <CardBody className="py-12 text-center">
                  <IconClipboardList className="mx-auto size-10 text-fg-muted/40" />
                  <h3 className="mt-3 font-semibold text-fg">No audit events yet</h3>
                  <p className="mt-1 text-xs text-fg-muted">
                    Actions your team takes across Studio and Business will show up here.
                  </p>
                </CardBody>
              </Card>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/60 bg-bg-surface">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border/60 bg-bg-subtle/40 text-xs text-fg-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">Actor</th>
                      <th className="px-4 py-3 font-medium">Action</th>
                      <th className="px-4 py-3 font-medium">Target</th>
                      <th className="px-4 py-3 font-medium">Severity</th>
                      <th className="px-4 py-3 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {auditLogs.map((entry) => (
                      <tr key={entry.id} className="hover:bg-bg-subtle/30">
                        <td className="px-4 py-3">
                          <div className="font-medium text-fg">{entry.actorName}</div>
                          <div className="text-xs text-fg-muted">{entry.actorRole}</div>
                        </td>
                        <td className="px-4 py-3 text-fg">{entry.action}</td>
                        <td className="px-4 py-3 font-mono text-xs text-fg-muted">
                          {entry.targetType}/{entry.targetId.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={entry.severity === "danger" ? "danger" : entry.severity === "warning" ? "warning" : "neutral"}
                            size="sm"
                          >
                            {entry.severity}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-fg-muted">{relativeTime(entry.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 6: SETTINGS (SSO) */}
        {activeTab === "settings" && (
          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Single Sign-On (SSO / SAML)"
                description="Store your identity provider's metadata so your team can be provisioned for SSO."
              />
              <CardBody>
                <form onSubmit={handleSaveSso} className="space-y-4">
                  <Field label="IdP Metadata URL" htmlFor="sso-metadata">
                    <Input
                      id="sso-metadata"
                      type="url"
                      placeholder="https://your-idp.example.com/metadata.xml"
                      value={ssoForm.idpMetadataUrl}
                      onChange={(e) => setSsoForm({ ...ssoForm, idpMetadataUrl: e.target.value })}
                    />
                    {ssoConfig?.idpMetadataUrl ? (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs">
                        {ssoConfig.metadataVerified ? (
                          <Badge tone="published" size="sm">Metadata verified</Badge>
                        ) : (
                          <Badge tone="rejected" size="sm">Couldn&apos;t verify metadata</Badge>
                        )}
                        {ssoConfig.metadataCheckedAt ? (
                          <span className="text-fg-subtle">checked {relativeTime(ssoConfig.metadataCheckedAt)}</span>
                        ) : null}
                      </p>
                    ) : null}
                  </Field>
                  <Field label="SSO domain" htmlFor="sso-domain" hint="Employees signing in with this email domain will use SSO once enabled.">
                    <Input
                      id="sso-domain"
                      placeholder="yourcompany.com"
                      value={ssoForm.ssoDomain}
                      onChange={(e) => setSsoForm({ ...ssoForm, ssoDomain: e.target.value })}
                    />
                  </Field>
                  <Switch
                    checked={ssoForm.enabled}
                    onCheckedChange={(checked) => setSsoForm({ ...ssoForm, enabled: checked })}
                    label="Enable SSO for this organization"
                  />
                  <p className="text-xs leading-relaxed text-fg-subtle">
                    This stores your real configuration — actually authenticating a sign-in against it needs a
                    real SAML identity-provider integration, which doesn&apos;t exist yet (this app&apos;s own sign-in
                    is Auth0-backed, not a SAML relying party). Disclosed here rather than implied as working.
                  </p>
                  <div className="flex items-center justify-between">
                    {ssoConfig?.updatedAt ? (
                      <span className="text-xs text-fg-subtle">Last saved {relativeTime(ssoConfig.updatedAt)}</span>
                    ) : (
                      <span />
                    )}
                    <Button type="submit" variant="primary" loading={savingSso}>
                      Save configuration
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Priority Support" description="Your recent tickets" />
              <CardBody className="space-y-3">
                {tickets.length === 0 ? (
                  <p className="text-sm text-fg-muted">No support tickets submitted yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {tickets.map((ticket) => (
                      <li key={ticket.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-fg">{ticket.subject}</p>
                          <p className="text-xs text-fg-muted">{relativeTime(ticket.createdAt)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge tone={ticket.priority === "urgent" ? "danger" : "warning"} size="sm">
                            {ticket.priority}
                          </Badge>
                          <Badge tone={ticket.status === "resolved" ? "success" : "neutral"} size="sm">
                            {ticket.status}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        )}
      </PageBody>

      {/* MODAL 1: Create Review Link */}
      <Modal
        open={createReviewOpen}
        onClose={() => setCreateReviewOpen(false)}
        title="Create Client Review Link"
        description="Issue a watermarked preview link with expiration for client sign-off."
      >
        <form onSubmit={handleCreateReview} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-fg-muted">Deliverable Title</label>
            <input
              type="text"
              required
              value={reviewForm.title}
              onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-fg"
              placeholder="e.g. Commercial Director's Cut v2"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-fg-muted">Client Name</label>
              <input
                type="text"
                required
                value={reviewForm.clientName}
                onChange={(e) => setReviewForm({ ...reviewForm, clientName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-fg"
                placeholder="e.g. Acme Corp"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg-muted">Client Email (optional)</label>
              <input
                type="email"
                value={reviewForm.clientEmail}
                onChange={(e) => setReviewForm({ ...reviewForm, clientEmail: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-fg"
                placeholder="client@company.com"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-fg-muted">Version</label>
              <input
                type="number"
                min={1}
                value={reviewForm.version}
                onChange={(e) => setReviewForm({ ...reviewForm, version: parseInt(e.target.value, 10) || 1 })}
                className="mt-1 w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-fg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg-muted">Expires In (Days)</label>
              <input
                type="number"
                min={1}
                max={90}
                value={reviewForm.expiresDays}
                onChange={(e) => setReviewForm({ ...reviewForm, expiresDays: parseInt(e.target.value, 10) || 14 })}
                className="mt-1 w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-fg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="ghost" type="button" onClick={() => setCreateReviewOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submitting}>
              Generate Review Link
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Create File Transfer — a real signed upload, not a pasted-in URL */}
      <Modal
        open={createTransferOpen}
        onClose={() => setCreateTransferOpen(false)}
        title="Create Large File Transfer"
        description="Upload a file — it's stored privately and a fresh download link is minted every time someone opens this page."
      >
        <form onSubmit={handleCreateTransfer} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-fg-muted">Transfer Title</label>
            <input
              type="text"
              required
              value={transferForm.title}
              onChange={(e) => setTransferForm({ ...transferForm, title: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-fg"
              placeholder="e.g. Master ProRes Package"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-muted">File</label>
            <input
              type="file"
              required
              onChange={(e) => setTransferFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-fg file:mr-3 file:rounded file:border-0 file:bg-surface-3 file:px-2 file:py-1 file:text-xs"
            />
            {transferFile ? (
              <p className="mt-1 text-2xs text-fg-subtle">
                {transferFile.name} · {(transferFile.size / (1024 * 1024)).toFixed(1)}MB
              </p>
            ) : null}
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-muted">Expires after (days)</label>
            <input
              type="number"
              min="1"
              value={transferForm.expiresDays}
              onChange={(e) => setTransferForm({ ...transferForm, expiresDays: parseInt(e.target.value, 10) || 14 })}
              className="mt-1 w-32 rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-fg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="ghost" type="button" onClick={() => setCreateTransferOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submitting} disabled={!transferFile}>
              {transferUploading ? "Uploading…" : "Upload & Publish"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: Generate API Key */}
      <Modal
        open={createKeyOpen}
        onClose={() => setCreateKeyOpen(false)}
        title="Generate Partner API Key (TPI-9)"
        description="Keys allow programmatic access to video feeds and embed iframes."
      >
        <form onSubmit={handleCreateKey} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-fg-muted">Key Name / Description</label>
            <input
              type="text"
              required
              value={keyForm.name}
              onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-fg"
              placeholder="e.g. Mobile App Partner"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-muted">Scopes</label>
            <div className="mt-2 space-y-2">
              {[
                { id: "read:catalogue", label: "read:catalogue — Browse published videos & metadata" },
                { id: "embed:player", label: "embed:player — Generate syndicated embed player iframes" },
                { id: "write:catalogue", label: "write:catalogue — Programmatically upload & ingest media" },
              ].map((scope) => {
                const checked = keyForm.scopes.includes(scope.id);
                return (
                  <label key={scope.id} className="flex items-center gap-2 text-xs text-fg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setKeyForm({ ...keyForm, scopes: [...keyForm.scopes, scope.id] });
                        } else {
                          setKeyForm({ ...keyForm, scopes: keyForm.scopes.filter((s) => s !== scope.id) });
                        }
                      }}
                      className="rounded border-border accent-accent"
                    />
                    <span>{scope.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-muted">Expires In (Days)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={keyForm.expiresDays}
              onChange={(e) => setKeyForm({ ...keyForm, expiresDays: parseInt(e.target.value, 10) || 90 })}
              className="mt-1 w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-fg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="ghost" type="button" onClick={() => setCreateKeyOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submitting}>
              Generate Key
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 4: Reveal Raw API Key */}
      <Modal
        open={Boolean(revealedKey)}
        onClose={() => setRevealedKey(null)}
        title="Copy Your API Key"
        description="This key will never be shown again. Save it in your secret manager now."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-bg-subtle p-3 font-mono text-xs text-fg">
            <span className="break-all">{revealedKey}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(revealedKey!, "API key copied to clipboard")}
            >
              <IconCopy className="size-3.5" />
              Copy
            </Button>
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={() => setRevealedKey(null)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 5: Priority Support Ticket */}
      <Modal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        title="Priority Support"
        description="Your enterprise ticket goes straight to the front of the queue."
      >
        <form onSubmit={handleCreateTicket} className="space-y-4">
          <Field label="Subject" htmlFor="ticket-subject" required>
            <Input
              id="ticket-subject"
              required
              value={ticketForm.subject}
              onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
              placeholder="e.g. Playback failing for our Enterprise account"
            />
          </Field>
          <Field label="Priority" htmlFor="ticket-priority">
            <select
              id="ticket-priority"
              value={ticketForm.priority}
              onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value as typeof ticketForm.priority })}
              className="w-full rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-fg"
            >
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </select>
          </Field>
          <Field label="Message" htmlFor="ticket-message" required>
            <Textarea
              id="ticket-message"
              rows={4}
              required
              value={ticketForm.message}
              onChange={(e) => setTicketForm({ ...ticketForm, message: e.target.value })}
              placeholder="Describe the issue in detail."
            />
          </Field>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="ghost" type="button" onClick={() => setSupportOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submittingTicket}>
              Submit ticket
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
