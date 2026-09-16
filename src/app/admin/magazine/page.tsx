"use client";

import { IconCheck, IconEdit, IconNews, IconX } from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useMagazineReviewQueue, useReviewMagazineArticle } from "@/lib/mock-api/hooks";
import type { MagazineArticle } from "@/lib/mock-api/types";
import { relativeTime } from "@/lib/utils";

type Decision = "publish" | "request_changes" | "reject";

export default function AdminMagazinePage() {
  const { data: queue = [], isLoading } = useMagazineReviewQueue();
  const review = useReviewMagazineArticle();
  const { toast } = useToast();

  const [reading, setReading] = React.useState<MagazineArticle | null>(null);
  const [deciding, setDeciding] = React.useState<{ article: MagazineArticle; decision: Decision } | null>(null);
  const [notes, setNotes] = React.useState("");

  const decide = async () => {
    if (!deciding) return;
    try {
      await review.mutateAsync({ id: deciding.article.id, decision: deciding.decision, notes: notes.trim() || undefined });
      toast({
        title:
          deciding.decision === "publish"
            ? "Article published"
            : deciding.decision === "reject"
              ? "Article rejected"
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
        title="Magazine review"
        description="Every submitted analysis is reviewed before it goes live — the boss's flagged editorial-integrity gate: filmmakers writing about their own work, disclosed and labelled, not disguised as independent criticism."
      />

      <PageBody className="space-y-4">
        {isLoading ? null : queue.length === 0 ? (
          <EmptyState icon={<IconNews />} title="Nothing waiting" description="Submitted analyses will appear here." />
        ) : (
          <div className="space-y-3">
            {queue.map((article) => (
              <Card key={article.id}>
                <CardBody className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{article.title}</p>
                    <p className="mt-0.5 truncate text-xs text-fg-muted">
                      By {article.authorName} · about {article.aboutTitle} · submitted{" "}
                      {article.submittedAt ? relativeTime(article.submittedAt) : "—"}
                    </p>
                  </div>
                  <Badge tone="accent" size="sm">
                    Filmmaker&rsquo;s analysis
                  </Badge>
                  <Button variant="secondary" size="sm" onClick={() => setReading(article)}>
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
        title={reading?.title ?? ""}
        description={reading ? `By ${reading.authorName} · about ${reading.aboutTitle}` : undefined}
        size="lg"
        footer={
          reading ? (
            <>
              <Button variant="ghost" onClick={() => setDeciding({ article: reading, decision: "reject" })}>
                <IconX />
                Reject
              </Button>
              <Button
                variant="secondary"
                onClick={() => setDeciding({ article: reading, decision: "request_changes" })}
              >
                <IconEdit />
                Request changes
              </Button>
              <Button variant="primary" onClick={() => setDeciding({ article: reading, decision: "publish" })}>
                <IconCheck />
                Publish
              </Button>
            </>
          ) : null
        }
      >
        {reading ? (
          <div className="space-y-4">
            {reading.dek ? <p className="text-sm italic text-fg-muted">{reading.dek}</p> : null}
            <div
              className="nx-article-body"
              // Reviewer-only render of the author's own submission — same trust boundary
              // as any other admin content-review surface in this app (e.g. moderation
              // queues already render submitted video synopses/comments this way).
              dangerouslySetInnerHTML={{ __html: reading.bodyHtml }}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deciding)}
        onClose={() => setDeciding(null)}
        title={
          deciding?.decision === "publish"
            ? "Publish this article?"
            : deciding?.decision === "reject"
              ? "Reject this article?"
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
          label={deciding?.decision === "publish" ? "Note (optional)" : "Note for the author"}
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
                ? "Why this can't be published as-is."
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
