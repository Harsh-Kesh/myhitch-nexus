"use client";

import {
  IconHeart,
  IconMessage,
  IconPin,
  IconShieldCheck,
  IconTrash,
} from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Switch } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { videoById } from "@/lib/mock-api/data/videos";
import {
  useCurrentUser,
  useModerateComment,
  useModerationComments,
} from "@/lib/mock-api/hooks";
import { relativeTime } from "@/lib/utils";

const DEFAULT_BLOCKED = ["scam", "free money", "click here", "crypto giveaway"];

export default function StudioCommentsPage() {
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId ?? "ch_mara";
  const { data: comments = [] } = useModerationComments(channelId);
  const moderate = useModerateComment(channelId);
  const { toast } = useToast();

  const [tab, setTab] = React.useState("published");
  const [blockedWords, setBlockedWords] = React.useState(DEFAULT_BLOCKED);
  const [wordDraft, setWordDraft] = React.useState("");
  const [holdLinks, setHoldLinks] = React.useState(true);
  const [holdNewAccounts, setHoldNewAccounts] = React.useState(false);

  const counts = {
    published: comments.filter((c) => c.status === "published").length,
    held: comments.filter((c) => c.status === "held").length,
    removed: comments.filter((c) => c.status === "removed").length,
  };

  const reportReasonCounts = React.useMemo(() => {
    const reasonMap: Record<string, number> = {};
    comments.forEach((c) => {
      if (c.heldReason) {
        reasonMap[c.heldReason] = (reasonMap[c.heldReason] || 0) + 1;
      }
    });
    return Object.entries(reasonMap).map(([label, count]) => ({ label, count }));
  }, [comments]);

  const filtered = comments.filter((comment) => comment.status === tab);

  return (
    <>
      <PageHeader
        title="Comments"
        description="Review, hold and remove comments across your channel. Automated filters flag likely problems for a human decision."
      />

      <PageBody>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { value: "published", label: "Published", count: counts.published },
                { value: "held", label: "Held for review", count: counts.held },
                { value: "removed", label: "Removed", count: counts.removed },
              ]}
            />

            {filtered.length === 0 ? (
              <EmptyState
                icon={<IconMessage />}
                title={
                  tab === "held"
                    ? "Nothing waiting"
                    : tab === "removed"
                      ? "Nothing removed"
                      : "No comments yet"
                }
                description={
                  tab === "held"
                    ? "Comments caught by your filters appear here for a decision."
                    : "Comments on your videos appear here."
                }
              />
            ) : (
              <ul className="space-y-3">
                {filtered.map((comment) => {
                  const video = videoById(comment.videoId);
                  return (
                    <li key={comment.id}>
                      <Card className="p-4">
                        <div className="flex gap-3">
                          <Avatar
                            name={comment.authorName}
                            gradient={comment.authorGradient}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-fg">
                                {comment.authorName}
                              </span>
                              <span className="text-xs text-fg-subtle">
                                {relativeTime(comment.createdAt)}
                              </span>
                              {comment.pinned ? (
                                <Badge tone="outline" size="sm">
                                  Pinned
                                </Badge>
                              ) : null}
                              {comment.heartedByCreator ? (
                                <Badge tone="accent" size="sm">
                                  ♥
                                </Badge>
                              ) : null}
                              {comment.heldReason ? (
                                <Badge tone="warning" size="sm">
                                  {comment.heldReason}
                                </Badge>
                              ) : null}
                            </div>

                            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                              {comment.body}
                            </p>

                            {video ? (
                              <Link
                                href={`/video/${video.id}`}
                                className="mt-2 inline-block truncate text-2xs text-fg-subtle transition-colors hover:text-accent"
                              >
                                on “{video.title}”
                              </Link>
                            ) : null}

                            <div className="mt-3 flex flex-wrap gap-2">
                              {comment.status !== "published" ? (
                                <Button
                                  variant="secondary"
                                  size="xs"
                                  onClick={() => {
                                    moderate.mutate({
                                      commentId: comment.id,
                                      action: "publish",
                                    });
                                    toast({ title: "Comment approved" });
                                    // Follow the comment to where it went — it just
                                    // vanished from the current tab's filtered list
                                    // otherwise, with only the toast saying where.
                                    setTab("published");
                                  }}
                                >
                                  Approve
                                </Button>
                              ) : null}
                              {comment.status === "published" ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() =>
                                      moderate.mutate({
                                        commentId: comment.id,
                                        action: "heart",
                                      })
                                    }
                                  >
                                    <IconHeart />
                                    {comment.heartedByCreator ? "Unheart" : "Heart"}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() =>
                                      moderate.mutate({
                                        commentId: comment.id,
                                        action: "pin",
                                      })
                                    }
                                  >
                                    <IconPin />
                                    {comment.pinned ? "Unpin" : "Pin"}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => {
                                      moderate.mutate({
                                        commentId: comment.id,
                                        action: "hold",
                                      });
                                      toast({ title: "Comment held", tone: "warning" });
                                      setTab("held");
                                    }}
                                  >
                                    Hold
                                  </Button>
                                </>
                              ) : null}
                              {comment.status !== "removed" ? (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  className="text-danger"
                                  onClick={() => {
                                    moderate.mutate({
                                      commentId: comment.id,
                                      action: "remove",
                                    });
                                    toast({
                                      title: "Comment removed",
                                      tone: "warning",
                                    });
                                    setTab("removed");
                                  }}
                                >
                                  <IconTrash />
                                  Remove
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Filter settings */}
          <aside className="min-w-0 space-y-4">
            <Card>
              <CardHeader
                title="Automated filters"
                description="Nothing is deleted automatically — filters only hold comments for your review."
              />
              <CardBody className="space-y-4">
                <Switch
                  checked={holdLinks}
                  onCheckedChange={setHoldLinks}
                  label="Hold comments containing links"
                />
                <Switch
                  checked={holdNewAccounts}
                  onCheckedChange={setHoldNewAccounts}
                  label="Hold comments from accounts under 7 days old"
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Blocked words"
                description="Comments containing these are held for review."
              />
              <CardBody className="space-y-3">
                <Input
                  value={wordDraft}
                  onChange={(event) => setWordDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && wordDraft.trim()) {
                      event.preventDefault();
                      setBlockedWords((current) =>
                        Array.from(new Set([...current, wordDraft.trim().toLowerCase()])),
                      );
                      setWordDraft("");
                    }
                  }}
                  placeholder="Add a word, press Enter"
                  sizeVariant="sm"
                />
                <div className="flex flex-wrap gap-1.5">
                  {blockedWords.map((word) => (
                    <Badge key={word} tone="neutral" size="sm">
                      {word}
                      <button
                        type="button"
                        aria-label={`Remove ${word}`}
                        onClick={() =>
                          setBlockedWords((current) => current.filter((w) => w !== word))
                        }
                        className="-mr-1 rounded-full px-0.5 hover:text-fg"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Report reasons" description="What viewers reported" />
              <CardBody>
                {reportReasonCounts.length === 0 ? (
                  <p className="text-xs text-fg-muted">No comment reports yet. Viewers&rsquo; reported comments will appear here.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {reportReasonCounts.map((reason) => (
                      <li
                        key={reason.label}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="text-fg-muted">{reason.label}</span>
                        <Badge tone="outline" size="sm">
                          {reason.count} {reason.count === 1 ? "report" : "reports"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 flex items-start gap-2 text-2xs leading-relaxed text-fg-subtle">
                  <IconShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                  Serious reports are escalated to platform moderation and appear
                  in the Admin queue.
                </p>
              </CardBody>
            </Card>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
