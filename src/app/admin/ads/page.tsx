"use client";

import {
  IconCheck,
  IconEye,
  IconShieldCheck,
  IconSpeakerphone,
  IconX,
} from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge, CampaignStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useCampaigns, useUpdateCampaignStatus } from "@/lib/mock-api/hooks";
import type { Campaign } from "@/lib/mock-api/types";
import {
  compactNumber,
  formatCurrency,
  formatDate,
  formatPercent,
  relativeTime,
} from "@/lib/utils";

export default function AdminAdsPage() {
  const { data: campaigns = [] } = useCampaigns();
  const updateStatus = useUpdateCampaignStatus();
  const { toast } = useToast();

  const [tab, setTab] = React.useState("pending");
  const [review, setReview] = React.useState<{
    campaign: Campaign;
    decision: "approve" | "reject";
  } | null>(null);
  const [reason, setReason] = React.useState("");

  const pending = campaigns.filter((c) => c.status === "pending");
  const active = campaigns.filter((c) => c.status === "active");
  const rejected = campaigns.filter((c) => c.status === "rejected");

  const shown =
    tab === "pending"
      ? pending
      : tab === "active"
        ? active
        : tab === "rejected"
          ? rejected
          : campaigns;

  const platformSpend = campaigns.reduce(
    (total, campaign) => total + campaign.spend.amount,
    0,
  );
  const platformImpressions = campaigns.reduce(
    (total, campaign) => total + campaign.metrics.impressions,
    0,
  );

  return (
    <>
      <PageHeader
        title="Advertising"
        description="Approve campaigns before they deliver, and monitor what is running across the platform."
      />

      <PageBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Awaiting approval"
            value={String(pending.length)}
            icon={<IconSpeakerphone />}
          />
          <Stat label="Active campaigns" value={String(active.length)} />
          <Stat
            label="Impressions delivered"
            value={compactNumber(platformImpressions)}
            icon={<IconEye />}
          />
          <Stat
            label="Advertiser spend"
            value={formatCurrency(platformSpend, "AUD", { compact: true })}
          />
        </div>

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "pending", label: "Awaiting approval", count: pending.length },
            { value: "active", label: "Active", count: active.length },
            { value: "rejected", label: "Rejected", count: rejected.length },
            { value: "all", label: "All", count: campaigns.length },
          ]}
        />

        {shown.length === 0 ? (
          <EmptyState
            icon={<IconCheck />}
            title={tab === "pending" ? "Nothing awaiting approval" : "Nothing here"}
            description={
              tab === "pending"
                ? "Every submitted campaign has been reviewed."
                : "No campaigns match this filter."
            }
          />
        ) : (
          <div className="space-y-4">
            {shown.map((campaign) => (
              <Card key={campaign.id}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {campaign.name}
                      <CampaignStatusBadge status={campaign.status} size="sm" />
                      <Badge tone="outline" size="sm">
                        {campaign.objective}
                      </Badge>
                    </span>
                  }
                  description={
                    <>
                      {campaign.advertiserName} · budget{" "}
                      {formatCurrency(campaign.budget.amount)} ·{" "}
                      {formatDate(campaign.startDate)} → {formatDate(campaign.endDate)}
                      {campaign.submittedAt
                        ? ` · submitted ${relativeTime(campaign.submittedAt)}`
                        : ""}
                    </>
                  }
                  action={
                    campaign.status === "pending" ? (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setReview({ campaign, decision: "reject" });
                            setReason("");
                          }}
                        >
                          <IconX />
                          Reject
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setReview({ campaign, decision: "approve" });
                            setReason("");
                          }}
                        >
                          <IconCheck />
                          Approve
                        </Button>
                      </div>
                    ) : campaign.status === "active" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={() => {
                          setReview({ campaign, decision: "reject" });
                          setReason("");
                        }}
                      >
                        Suspend
                      </Button>
                    ) : null
                  }
                />
                <CardBody className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                        Creatives ({campaign.creatives.length})
                      </p>
                      {campaign.creatives.length === 0 ? (
                        <p className="mt-1.5 text-sm text-fg-subtle">
                          No creatives attached — cannot approve.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {campaign.creatives.map((creative) => (
                            <li
                              key={creative.id}
                              className="flex items-center gap-3 rounded border border-border bg-surface-2 p-2.5"
                            >
                              <span
                                aria-hidden
                                className="h-11 w-20 shrink-0 rounded"
                                style={{
                                  backgroundImage: `linear-gradient(140deg, ${creative.gradient[0]}, ${creative.gradient[1]})`,
                                }}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-fg">
                                  {creative.name}
                                </span>
                                <span className="block text-2xs text-fg-subtle">
                                  {creative.format} · {creative.durationSeconds}s ·{" "}
                                  “{creative.clickThroughLabel}”
                                </span>
                              </span>
                              <Badge
                                tone={
                                  creative.status === "approved"
                                    ? "published"
                                    : creative.status === "rejected"
                                      ? "rejected"
                                      : "pending"
                                }
                                size="sm"
                              >
                                {creative.status}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                        Targeting
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {campaign.targeting.countries.map((code) => (
                          <Badge key={code} tone="neutral" size="sm">
                            {code}
                          </Badge>
                        ))}
                        {campaign.targeting.ageBands.map((band) => (
                          <Badge key={band} tone="outline" size="sm">
                            {band}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                        Brand safety
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <Badge tone="info" size="sm">
                          <IconShieldCheck />
                          min {campaign.brandSafety.minAgeRating}
                        </Badge>
                        {campaign.brandSafety.blockUserGenerated ? (
                          <Badge tone="warning" size="sm">
                            excludes UGC
                          </Badge>
                        ) : null}
                        {campaign.brandSafety.excludedLabels.map((label) => (
                          <Badge key={label} tone="danger" size="sm">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {campaign.metrics.impressions > 0 ? (
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <MiniStat
                          label="Impressions"
                          value={compactNumber(campaign.metrics.impressions)}
                        />
                        <MiniStat
                          label="CTR"
                          value={formatPercent(campaign.metrics.ctr, 1)}
                        />
                        <MiniStat
                          label="Spend"
                          value={formatCurrency(campaign.spend.amount, "AUD", {
                            compact: true,
                          })}
                        />
                      </div>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <Modal
        open={Boolean(review)}
        onClose={() => setReview(null)}
        title={
          review?.decision === "approve"
            ? `Approve “${review.campaign.name}”?`
            : `Reject “${review?.campaign.name ?? ""}”?`
        }
        description={
          review?.decision === "approve"
            ? "The campaign starts delivering on its scheduled start date."
            : "The advertiser is notified with your reason and can resubmit."
        }
        tone={review?.decision === "reject" ? "danger" : "default"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button
              variant={review?.decision === "approve" ? "primary" : "danger"}
              disabled={review?.decision === "reject" && reason.trim().length < 8}
              loading={updateStatus.isPending}
              onClick={async () => {
                if (!review) return;
                await updateStatus.mutateAsync({
                  id: review.campaign.id,
                  status: review.decision === "approve" ? "active" : "rejected",
                  reason:
                    reason.trim() ||
                    "Approved: targeting, creatives and brand-safety settings meet policy.",
                });
                toast({
                  title:
                    review.decision === "approve"
                      ? "Campaign approved"
                      : "Campaign rejected",
                  description: "Recorded in the audit log.",
                  tone: review.decision === "approve" ? "success" : "warning",
                });
                setReview(null);
              }}
            >
              {review?.decision === "approve" ? "Approve" : "Reject"}
            </Button>
          </>
        }
      >
        <Field
          label="Reason"
          htmlFor="ad-reason"
          required={review?.decision === "reject"}
          hint={
            review?.decision === "approve"
              ? "Optional. Recorded in the audit log."
              : "Required. Sent to the advertiser with a policy reference."
          }
        >
          <Textarea
            id="ad-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder={
              review?.decision === "approve"
                ? "Creatives and targeting meet policy."
                : "Creative copy makes unsubstantiated health claims."
            }
          />
        </Field>
      </Modal>
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-surface-2 p-2">
      <p className="text-2xs uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-fg nx-tnum">{value}</p>
    </div>
  );
}
