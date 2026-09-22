"use client";

import {
  IconCheck,
  IconClock,
  IconEdit,
  IconLock,
  IconShieldCheck,
  IconThumbUp,
} from "@tabler/icons-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";

interface ReviewData {
  review: {
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
    updated_at: string;
  };
  video: {
    id: string;
    title: string;
    synopsis: string | null;
    thumbnailUrl: string | null;
    sampleSrc: string;
    durationSeconds: number;
  };
}

export function ReviewClient({
  initialData,
  token,
}: {
  initialData: ReviewData;
  token: string;
}) {
  const { toast } = useToast();
  const [data, setData] = React.useState(initialData);
  const [submitting, setSubmitting] = React.useState(false);
  const [showFeedbackBox, setShowFeedbackBox] = React.useState(false);
  const [feedbackText, setFeedbackText] = React.useState(data.review.feedback ?? "");
  const [actionType, setActionType] = React.useState<"approved" | "changes_requested" | null>(null);

  const review = data.review;
  const video = data.video;

  const handleSubmitDecision = async (status: "approved" | "changes_requested") => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          feedback: feedbackText.trim() || undefined,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error ?? "Failed to submit review decision");
      }

      setData((prev) => ({
        ...prev,
        review: result.review,
      }));
      setShowFeedbackBox(false);

      if (status === "approved") {
        toast({
          title: "Video Approved",
          description: "Thank you! Your approval has been recorded.",
          tone: "success",
        });
      } else {
        toast({
          title: "Feedback Submitted",
          description: "Your change requests have been sent to the production team.",
          tone: "info",
        });
      }
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "An error occurred",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
      setActionType(null);
    }
  };

  const statusTone = {
    pending: "warning",
    approved: "success",
    changes_requested: "danger",
  } as const;

  const statusLabel = {
    pending: "Pending Review",
    approved: "Approved",
    changes_requested: "Changes Requested",
  } as const;

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* Top Banner */}
      <header className="border-b border-border/40 bg-bg-surface/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <IconLock className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-semibold tracking-tight text-fg">
                  MYHitch Nexus Enterprise
                </span>
                <Badge tone="outline" size="sm">
                  Client Review Portal
                </Badge>
              </div>
              <p className="text-xs text-fg-muted">
                Private review environment • Confidential draft
              </p>
            </div>
          </div>
          <Badge tone={statusTone[review.status]} size="md">
            {statusLabel[review.status]}
          </Badge>
        </div>
      </header>

      {/* Main Review Body */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="space-y-6">
          {/* Metadata Header */}
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone="neutral" size="sm">
                  Version {review.version}
                </Badge>
                {review.expires_at && (
                  <span className="flex items-center gap-1 text-xs text-fg-muted">
                    <IconClock className="size-3.5" />
                    Expires {formatDate(review.expires_at)}
                  </span>
                )}
              </div>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                {review.title}
              </h1>
              <p className="mt-1 text-sm text-fg-muted">
                Review link issued for: <strong className="text-fg">{review.client_name}</strong>
                {review.client_email && ` (${review.client_email})`}
              </p>
            </div>

            {/* Status Quick Action Buttons */}
            {review.status === "pending" && !showFeedbackBox && (
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  className="border-danger/50 text-danger hover:bg-danger/10"
                  onClick={() => {
                    setActionType("changes_requested");
                    setShowFeedbackBox(true);
                  }}
                >
                  <IconEdit className="size-4" />
                  Request Changes
                </Button>
                <Button
                  variant="primary"
                  className="bg-success text-white hover:bg-success/90"
                  loading={submitting}
                  onClick={() => handleSubmitDecision("approved")}
                >
                  <IconThumbUp className="size-4" />
                  Approve Video
                </Button>
              </div>
            )}
          </div>

          {/* Video Player Container */}
          <Card className="overflow-hidden border border-border/60 bg-black/95 shadow-xl">
            <div className="relative aspect-video w-full">
              <video
                src={video.sampleSrc}
                controls
                className="size-full object-contain"
                playsInline
                preload="metadata"
              />
              {/* Draft Watermark */}
              <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center opacity-40">
                <span className="rounded bg-black/80 px-3 py-1 text-xs font-semibold tracking-widest text-white uppercase">
                  CONFIDENTIAL CLIENT REVIEW • DO NOT REDISTRIBUTE
                </span>
              </div>
            </div>
          </Card>

          {/* Review Status & Feedback Box */}
          {review.status !== "pending" && (
            <Card className="border border-border/60 bg-bg-surface/50">
              <CardBody className="space-y-3 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {review.status === "approved" ? (
                      <span className="flex size-7 items-center justify-center rounded-full bg-success/20 text-success">
                        <IconCheck className="size-4" />
                      </span>
                    ) : (
                      <span className="flex size-7 items-center justify-center rounded-full bg-danger/20 text-danger">
                        <IconEdit className="size-4" />
                      </span>
                    )}
                    <h3 className="font-semibold text-fg">
                      {review.status === "approved"
                        ? "Video Approved"
                        : "Changes Requested"}
                    </h3>
                  </div>
                  <span className="text-xs text-fg-muted">
                    Updated {formatDate(review.updated_at)}
                  </span>
                </div>
                {review.feedback && (
                  <div className="rounded-lg bg-bg-subtle/60 p-4 text-sm text-fg-muted">
                    <p className="font-medium text-fg">Client Notes:</p>
                    <p className="mt-1 whitespace-pre-wrap">{review.feedback}</p>
                  </div>
                )}
                <div className="pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFeedbackBox(!showFeedbackBox)}
                  >
                    {showFeedbackBox ? "Close Feedback Form" : "Update Decision / Feedback"}
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Feedback Submission Panel */}
          {showFeedbackBox && (
            <Card className="border border-accent/40 bg-bg-surface shadow-lg">
              <CardBody className="space-y-4 p-6">
                <h3 className="font-semibold text-fg">
                  {actionType === "changes_requested"
                    ? "Specify Changes Requested"
                    : "Update Review Feedback"}
                </h3>
                <p className="text-xs text-fg-muted">
                  Provide detailed feedback, timecodes (e.g. 01:24 audio adjustment), or general revision notes for the production team.
                </p>
                <textarea
                  className="w-full rounded-lg border border-border bg-bg-subtle p-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                  rows={4}
                  placeholder="Enter revision notes, timecodes, or compliments..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowFeedbackBox(false);
                      setActionType(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    className="border-danger/50 text-danger hover:bg-danger/10"
                    loading={submitting && actionType === "changes_requested"}
                    onClick={() => handleSubmitDecision("changes_requested")}
                  >
                    Submit Change Request
                  </Button>
                  <Button
                    variant="primary"
                    className="bg-success text-white hover:bg-success/90"
                    loading={submitting && actionType === "approved"}
                    onClick={() => handleSubmitDecision("approved")}
                  >
                    Approve with Notes
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Enterprise Security Notice */}
          <div className="flex items-start gap-3 rounded-xl border border-border/40 bg-bg-subtle/30 p-4 text-xs text-fg-muted">
            <IconShieldCheck className="mt-0.5 size-4 text-accent" />
            <div>
              <p className="font-medium text-fg">Secure Client Review Guarantee</p>
              <p className="mt-0.5">
                This preview stream is protected with token-based access control and watermarked. Access to this draft will expire automatically on{" "}
                {review.expires_at ? formatDate(review.expires_at) : "the set expiration date"}.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
