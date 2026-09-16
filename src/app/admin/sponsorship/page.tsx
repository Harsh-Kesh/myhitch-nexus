"use client";

import { IconAward, IconCheck, IconEdit, IconX } from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useReviewSponsorshipListing, useSponsorshipReviewQueue } from "@/lib/mock-api/hooks";
import { SPONSORSHIP_REWARD_LABELS, type SponsorshipListing } from "@/lib/mock-api/types";
import { relativeTime } from "@/lib/utils";

type Decision = "publish" | "request_changes" | "reject";

export default function AdminSponsorshipPage() {
  const { data: queue = [], isLoading } = useSponsorshipReviewQueue();
  const review = useReviewSponsorshipListing();
  const { toast } = useToast();

  const [reading, setReading] = React.useState<SponsorshipListing | null>(null);
  const [deciding, setDeciding] = React.useState<{ listing: SponsorshipListing; decision: Decision } | null>(null);
  const [notes, setNotes] = React.useState("");

  const decide = async () => {
    if (!deciding) return;
    try {
      await review.mutateAsync({ id: deciding.listing.id, decision: deciding.decision, notes: notes.trim() || undefined });
      toast({
        title:
          deciding.decision === "publish"
            ? "Listing published"
            : deciding.decision === "reject"
              ? "Listing rejected"
              : "Changes requested",
      });
      setDeciding(null);
      setNotes("");
      setReading(null);
    } catch (error) {
      toast({
        title: "Couldn't record the decision",
        description: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    }
  };

  return (
    <>
      <PageHeader
        title="Exchange Hub review"
        description="Every submitted sponsorship listing is reviewed before it goes live. Check that the pitch offers only the fixed, non-financial rewards — never a share of profits, revenue, or ownership."
      />

      <PageBody className="space-y-4">
        {isLoading ? null : queue.length === 0 ? (
          <EmptyState icon={<IconAward />} title="Nothing waiting" description="Submitted listings will appear here." />
        ) : (
          <div className="space-y-3">
            {queue.map((listing) => (
              <Card key={listing.id}>
                <CardBody className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{listing.projectName}</p>
                    <p className="mt-0.5 truncate text-xs text-fg-muted">
                      By {listing.authorName} · {listing.channelName} · submitted{" "}
                      {listing.submittedAt ? relativeTime(listing.submittedAt) : "—"}
                    </p>
                  </div>
                  <Badge tone="accent" size="sm">
                    Sponsorship pitch
                  </Badge>
                  <Button variant="secondary" size="sm" onClick={() => setReading(listing)}>
                    Review
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <Modal
        open={Boolean(reading)}
        onClose={() => setReading(null)}
        title={reading?.projectName ?? ""}
        description={reading ? `By ${reading.authorName} · ${reading.channelName}` : undefined}
        size="lg"
        footer={
          reading ? (
            <>
              <Button variant="ghost" onClick={() => setDeciding({ listing: reading, decision: "reject" })}>
                <IconX />
                Reject
              </Button>
              <Button
                variant="secondary"
                onClick={() => setDeciding({ listing: reading, decision: "request_changes" })}
              >
                <IconEdit />
                Request changes
              </Button>
              <Button variant="primary" onClick={() => setDeciding({ listing: reading, decision: "publish" })}>
                <IconCheck />
                Publish
              </Button>
            </>
          ) : null
        }
      >
        {reading ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {reading.rewardTypes.length === 0 ? (
                <span className="text-sm text-fg-muted">No rewards selected.</span>
              ) : (
                reading.rewardTypes.map((reward) => (
                  <Badge key={reward} tone="neutral" size="sm">
                    {SPONSORSHIP_REWARD_LABELS[reward]}
                  </Badge>
                ))
              )}
            </div>
            <div
              className="nx-article-body"
              // Reviewer-only render of the creator's own submission — same trust boundary
              // as the magazine review queue's rendering of submitted article bodies.
              dangerouslySetInnerHTML={{ __html: reading.pitchHtml }}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deciding)}
        onClose={() => setDeciding(null)}
        title={
          deciding?.decision === "publish"
            ? "Publish this listing?"
            : deciding?.decision === "reject"
              ? "Reject this listing?"
              : "Request changes"
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={review.isPending} onClick={decide}>
              Confirm
            </Button>
          </>
        }
      >
        <Field
          label={deciding?.decision === "publish" ? "Note (optional)" : "Note for the creator"}
          htmlFor="review-notes"
          required={deciding?.decision !== "publish"}
        >
          <Textarea
            id="review-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            placeholder={
              deciding?.decision === "reject"
                ? "Why this can't be published as-is — e.g. rewards that imply a financial return."
                : deciding?.decision === "request_changes"
                  ? "What needs to change before this can be reconsidered."
                  : undefined
            }
          />
        </Field>
      </Modal>
    </>
  );
}
