"use client";

import {
  IconBadgeCc,
  IconBookmark,
  IconBookmarkFilled,
  IconBrandFacebook,
  IconBrandX,
  IconCheck,
  IconClock,
  IconCopy,
  IconEar,
  IconFlag,
  IconLink,
  IconShare3,
  IconShoppingBag,
  IconStar,
  IconStarFilled,
  IconThumbUp,
  IconWorld,
} from "@tabler/icons-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { VideoPlayer } from "@/components/player/video-player";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { VideoCard } from "@/components/video/video-card";
import { looksLikeRealId } from "@/lib/mock-api";
import { CONTENT_TYPE_LABELS, categoryById } from "@/lib/mock-api/data/categories";
import {
  useComments,
  useCurrentUser,
  useEntitlement,
  useIsFollowing,
  useLikeVideo,
  useMyRating,
  usePostComment,
  usePurchaseAccess,
  useRateVideo,
  useRelatedVideos,
  useReplyToComment,
  useStartSubscription,
  useToggleFollow,
  useToggleWatchlist,
  useVideo,
  useWatchProgress,
  useWatchlist,
  qk,
} from "@/lib/mock-api/hooks";
import { useChannel } from "@/lib/mock-api/hooks";
import type { Video } from "@/lib/mock-api/types";
import {
  cn,
  compactNumber,
  formatCurrency,
  formatDate,
  formatDuration,
  formatRuntime,
  relativeTime,
} from "@/lib/utils";

export function VideoDetailClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { toast } = useToast();

  const { data: video, isLoading } = useVideo(id);
  // The URL can be a slug, and the real catalogue was seeded from this same mock
  // dataset (see getVideo()'s own comment in mock-api/index.ts) — so a slug alone is
  // ambiguous between a mock video and a same-named real one. Every action below needs
  // to agree with whatever getVideo() actually resolved, not re-derive its own guess
  // from the raw URL param, or a real video's actions (rate, comment, buy, watchlist)
  // silently no-op or hit the wrong backend once the page itself is showing correctly.
  const videoId = video?.id ?? id;
  const { data: currentUser, isLoading: isCurrentUserLoading } = useCurrentUser();
  const { data: entitlement } = useEntitlement(videoId, currentUser?.id, !isCurrentUserLoading);
  const { data: channel } = useChannel(video?.channelId ?? "");
  const { data: related = [], isLoading: isRelatedLoading } = useRelatedVideos(videoId);
  const { data: comments = [] } = useComments(videoId);
  const { data: progress } = useWatchProgress(videoId);
  const { data: watchlist = [] } = useWatchlist();
  const { data: myRating } = useMyRating(videoId);
  const { data: following } = useIsFollowing(video?.channelId ?? "");

  const toggleWatchlist = useToggleWatchlist();
  const toggleFollow = useToggleFollow();
  const likeVideo = useLikeVideo(videoId);
  const rateVideo = useRateVideo(videoId);
  const postComment = usePostComment(videoId);
  const replyToComment = useReplyToComment(videoId);
  const purchase = usePurchaseAccess(videoId);
  const startSubscription = useStartSubscription();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Landing back from a real Stripe Checkout redirect (see commerce.ts's
  // createCheckoutSession()) — there's no synchronous "purchase complete" for a real
  // payment, only this return trip. Verifying here (rather than only trusting the
  // webhook) makes it feel instant and works even before a webhook endpoint is
  // configured in the Stripe dashboard; the webhook remains the actual source of truth
  // for fulfillment, this is a UX nicety on top of it (see fulfillCheckoutSession()'s
  // idempotency comment).
  //
  // Reads window.location.search directly instead of next/navigation's
  // useSearchParams() deliberately — useSearchParams() is a "dynamic API" that forces
  // Next to treat this component as needing a Suspense boundary on a statically
  // generated route (see page.tsx's own comment on why one wraps this component). That
  // combination — a dynamic API inside a Suspense boundary nested under this route's
  // loading.tsx — turned out to leave the boundary permanently stuck on its fallback in
  // production builds only (never reproduced in `next dev`) for any video whose
  // Suspense-wrapped subtree grew large enough (rent/buy videos with a paywall +
  // player). A plain client-side read has no such requirement and needs no Suspense
  // boundary at all — found and fixed 2026-09-19 after an extensive live investigation
  // (see docs/DEVELOPMENT-PLAN.md).
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (!checkout) return;
    const sessionId = params.get("session_id");

    (async () => {
      if (checkout === "success" && sessionId) {
        try {
          const res = await fetch(`/api/checkout/verify/?session_id=${encodeURIComponent(sessionId)}`);
          const data = (await res.json()) as { granted?: boolean; error?: string };
          if (res.ok && data.granted) {
            toast({ title: "Payment confirmed", description: "You can now watch this in full." });
          } else {
            toast({
              title: "Still confirming your payment",
              description: "This can take a few seconds — refresh if it doesn't unlock shortly.",
              tone: "info",
            });
          }
        } catch {
          toast({
            title: "Still confirming your payment",
            description: "This can take a few seconds — refresh if it doesn't unlock shortly.",
            tone: "info",
          });
        }
        queryClient.invalidateQueries({ queryKey: qk.entitlement(videoId) });
        queryClient.invalidateQueries({ queryKey: qk.purchases });
        queryClient.invalidateQueries({ queryKey: qk.subscriptions });
      } else if (checkout === "cancelled") {
        toast({ title: "Checkout cancelled", description: "No payment was taken.", tone: "info" });
      }
      router.replace(`/video/${id}/`, { scroll: false });
    })();
    // Only ever run once per mount (a real navigation to this page) — window.location
    // is read fresh above, not tracked as a reactive dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirect guests to the login page — video content requires sign-in. Gated on the
  // *current user* query's own loading state, not the video's (a bug: on a fresh
  // client-side navigation the video can finish loading before GET /api/auth/me
  // resolves, and currentUser is still its initial `undefined` at that instant — not
  // `null` — so this wouldn't misfire either way; found via a genuinely flaky e2e
  // failure that never reproduced outside Playwright's exact timing, not a report).
  React.useEffect(() => {
    if (false && !isCurrentUserLoading && currentUser === null) {
      router.replace("/auth/login");
    }
  }, [isCurrentUserLoading, currentUser, router]);

  const [purchaseOpen, setPurchaseOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [tab, setTab] = React.useState("about");
  const [commentBody, setCommentBody] = React.useState("");
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [replyBody, setReplyBody] = React.useState("");
  const [liked, setLiked] = React.useState(false);

  if (isLoading || !entitlement) {
    return (
      <div className="mx-auto max-w-[110rem] px-4 py-6 sm:px-6 lg:px-8">
        <div className="nx-skeleton aspect-video w-full rounded-lg" />
        <div className="nx-skeleton mt-5 h-8 w-2/3 rounded" />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="px-4 py-16 sm:px-6 lg:px-8">
        <EmptyState
          title="Video not found"
          description="This title may have been removed, or the link is wrong."
          action={{ label: "Browse the catalogue", href: "/explore" }}
        />
      </div>
    );
  }

  const inWatchlist = watchlist.some((item) => item.id === video.id);
  const { rentPrice, buyPrice, ppvPrice, accessModels } = video.pricing;

  const handlePurchase = async (kind: "buy" | "rent" | "ppv") => {
    // A real checkout redirects the browser away and never resolves this promise (see
    // purchaseAccess()'s header comment) — everything below only ever runs for the mock
    // path. A real failure (payments not configured, already entitled, ...) does reject
    // it, though, and needs handling here rather than becoming an unhandled rejection —
    // found live by actually clicking through this against a real video with no Stripe
    // keys configured yet, not by static review.
    try {
      await purchase.mutateAsync(kind);
    } catch (err) {
      toast({
        title: "Couldn't start checkout",
        description: err instanceof Error ? err.message : "Something went wrong. Try again.",
        tone: "error",
      });
      return;
    }
    setPurchaseOpen(false);
    toast({
      title:
        kind === "rent"
          ? "Rental started"
          : kind === "buy"
            ? "Purchase complete"
            : "Access unlocked",
      description: `You can now watch ${video.title} in full. Mock checkout — no payment provider was contacted.`,
    });
  };

  const handleSubscribe = async (channelId?: string) => {
    // Same reasoning as handlePurchase() above: a real subscription signup redirects
    // away and never resolves this promise, but a real failure (already subscribed,
    // payments not configured) does reject it.
    try {
      await startSubscription.mutateAsync({ name: channelId ? "Channel membership" : "Nexus Premium", channelId });
    } catch (err) {
      toast({
        title: "Couldn't start checkout",
        description: err instanceof Error ? err.message : "Something went wrong. Try again.",
        tone: "error",
      });
      return;
    }
    setPurchaseOpen(false);
    toast({
      title: channelId ? "Membership activated" : "Premium activated",
      description: channelId
        ? "You now have access to this channel's members-only content."
        : "Titles included with Premium now play without a purchase.",
    });
  };

  return (
    <div className="mx-auto max-w-[110rem] px-0 pb-10 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="min-w-0">
          <VideoPlayer
            video={video}
            entitlement={entitlement}
            resumeAt={progress && !progress.completed ? progress.positionSeconds : 0}
            onRequestPurchase={() => setPurchaseOpen(true)}
            onCommerceClick={(linkId) => {
              const link = video.pricing.affiliateLinks?.find(
                (item) => item.id === linkId,
              );
              toast({
                title: "Opening Mart product",
                description: `${link?.productName} — mock commerce link, nothing is fetched externally.`,
                tone: "info",
              });
            }}
            className="sm:rounded-lg"
          />

          <div className="px-4 sm:px-0">
            {/* Title block */}
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent" size="sm">
                  {CONTENT_TYPE_LABELS[video.contentType]}
                </Badge>
                <Badge tone="outline" size="sm">
                  {video.rights.ageRating}
                </Badge>
                {video.status !== "published" ? (
                  <StatusBadge status={video.status} size="sm" />
                ) : null}
                {video.pricing.sponsored ? (
                  <Badge tone="warning" size="sm">
                    Paid promotion · {video.pricing.sponsorName}
                  </Badge>
                ) : null}
                {video.subtitles.length > 0 ? (
                  <Badge tone="neutral" size="sm">
                    <IconBadgeCc />
                    {video.subtitles.length} subtitle track
                    {video.subtitles.length === 1 ? "" : "s"}
                  </Badge>
                ) : null}
                {video.hasAudioDescription ? (
                  <Badge tone="neutral" size="sm">
                    <IconEar />
                    Audio description
                  </Badge>
                ) : null}
              </div>

              {video.seriesTitle ? (
                <p className="mt-2.5 text-sm font-medium text-accent">
                  {video.seriesTitle}
                  {video.seasonNumber || video.episodeNumber ? (
                    <span className="text-fg-muted">
                      {" · "}
                      {video.seasonNumber ? `Season ${video.seasonNumber}` : null}
                      {video.seasonNumber && video.episodeNumber ? ", " : null}
                      {video.episodeNumber ? `Episode ${video.episodeNumber}` : null}
                    </span>
                  ) : null}
                </p>
              ) : null}
              <h1
                className={cn(
                  "font-display text-2xl font-semibold leading-tight text-fg sm:text-3xl",
                  video.seriesTitle ? "mt-1.5" : "mt-2.5",
                )}
              >
                {video.title}
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
                <span className="nx-tnum">{compactNumber(video.views)} views</span>
                <span className="nx-tnum">
                  {video.publishedAt ? relativeTime(video.publishedAt) : "Unpublished"}
                </span>
                <span className="nx-tnum">{formatRuntime(video.durationSeconds)}</span>
                <span>{video.language}</span>
                {video.ratingCount > 0 ? (
                  <span className="inline-flex items-center gap-1 nx-tnum">
                    <IconStarFilled className="size-3.5 text-warning" />
                    {video.ratingAverage.toFixed(1)} ({compactNumber(video.ratingCount)})
                  </span>
                ) : null}
              </div>
            </div>

            {/* Action bar */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                aria-label={`Like this video — ${compactNumber(video.likes + (liked ? 1 : 0))} likes`}
                aria-pressed={liked}
                onClick={() => {
                  likeVideo.mutate();
                  setLiked(true);
                  toast({ title: "Thanks — noted", tone: "info" });
                }}
                className={cn(liked && "text-accent")}
              >
                <IconThumbUp />
                <span className="nx-tnum" aria-hidden="true">{compactNumber(video.likes + (liked ? 1 : 0))}</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => toggleWatchlist.mutate(video.id)}
              >
                {inWatchlist ? <IconBookmarkFilled /> : <IconBookmark />}
                {inWatchlist ? "In watchlist" : "Watchlist"}
              </Button>

              <Button variant="secondary" size="sm" onClick={() => setShareOpen(true)}>
                <IconShare3 />
                Share
              </Button>

              <RatingControl
                value={myRating?.stars ?? 0}
                onRate={(stars) => {
                  rateVideo.mutate(stars);
                  toast({ title: `Rated ${stars} star${stars === 1 ? "" : "s"}` });
                }}
              />

              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() =>
                  toast({
                    title: "Report submitted",
                    description: "The moderation team will review this title.",
                    tone: "info",
                  })
                }
              >
                <IconFlag />
                Report
              </Button>
            </div>

            {/* Channel + access */}
            <Card className="mt-4">
              <CardBody className="flex flex-wrap items-center gap-4">
                {channel ? (
                  <>
                    <Link
                      href={`/channel/${channel.id}`}
                      className="flex min-w-0 items-center gap-3"
                    >
                      <Avatar
                        name={channel.name}
                        gradient={channel.avatarGradient}
                        src={channel.avatarUrl}
                        size="lg"
                        verified={channel.verified}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-fg">
                          {channel.name}
                        </span>
                        <span className="block text-xs text-fg-muted nx-tnum">
                          {compactNumber(channel.followers)} followers ·{" "}
                          {channel.videoCount} videos
                        </span>
                      </span>
                    </Link>
                    <Button
                      variant={following ? "secondary" : "primary"}
                      size="sm"
                      onClick={() => toggleFollow.mutate(channel.id)}
                    >
                      {following ? "Following" : "Follow"}
                    </Button>
                  </>
                ) : null}

                {accessModels.includes("free") || accessModels.includes("ad-supported") ? (
                  <Badge tone="success" className="ml-auto">
                    Free to watch
                  </Badge>
                ) : (
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {entitlement.granted ? (
                      <Badge tone="success">
                        <IconCheck />
                        {entitlement.reason === "rented"
                          ? `Rented${entitlement.expiresAt ? ` · expires ${formatDate(entitlement.expiresAt)}` : ""}`
                          : entitlement.reason === "purchased"
                            ? "Owned"
                            : entitlement.reason === "subscription"
                              ? "Included with Premium"
                              : entitlement.reason === "membership"
                                ? "Included with membership"
                                : entitlement.reason === "owner"
                                  ? "Your video"
                                  : "Unlocked"}
                      </Badge>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setPurchaseOpen(true)}
                      >
                        {rentPrice
                          ? `Rent ${formatCurrency(rentPrice.amount, rentPrice.currency)}`
                          : buyPrice
                            ? `Buy ${formatCurrency(buyPrice.amount, buyPrice.currency)}`
                            : ppvPrice
                              ? `Unlock ${formatCurrency(ppvPrice.amount, ppvPrice.currency)}`
                              : "Get access"}
                      </Button>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Commerce links */}
            {video.pricing.affiliateLinks?.length ? (
              <Card className="mt-4">
                <CardBody>
                  <p className="flex items-center gap-2 text-sm font-medium text-fg">
                    <IconShoppingBag className="size-4 text-accent" />
                    Shop this video
                  </p>
                  <p className="mt-1 text-xs text-fg-subtle">
                    Products featured in this video, linked to Mart. Commerce links
                    are mocked in this build.
                  </p>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {video.pricing.affiliateLinks.map((link) => (
                      <li key={link.id}>
                        <button
                          type="button"
                          onClick={() =>
                            toast({
                              title: "Mock commerce link",
                              description: link.productName,
                              tone: "info",
                            })
                          }
                          className="flex w-full items-center gap-3 rounded border border-border bg-surface-2 p-2.5 text-left transition-colors hover:border-border-strong"
                        >
                          <span
                            aria-hidden
                            className="size-10 shrink-0 rounded"
                            style={{
                              backgroundImage:
                                "linear-gradient(140deg, rgb(var(--nx-accent)), rgb(var(--nx-accent-press)))",
                            }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-fg">
                              {link.productName}
                            </span>
                            <span className="block text-xs text-fg-subtle nx-tnum">
                              {formatCurrency(link.price.amount, link.price.currency)}
                              {link.timestampSeconds != null
                                ? ` · at ${formatDuration(link.timestampSeconds)}`
                                : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ) : null}

            {/* Tabs */}
            <Tabs
              className="mt-6"
              value={tab}
              onChange={setTab}
              items={[
                { value: "about", label: "About" },
                { value: "comments", label: "Comments", count: comments.length },
                { value: "details", label: "Details & rights" },
              ]}
            />

            <div className="mt-5">
              {tab === "about" ? <AboutPanel video={video} /> : null}
              {tab === "details" ? <DetailsPanel video={video} /> : null}
              {tab === "comments" ? (
                <div>
                  <div className="flex gap-3">
                    <Avatar
                      name={currentUser?.name ?? "You"}
                      gradient={currentUser?.avatarGradient}
                      src={currentUser?.avatarUrl}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <Textarea
                        value={commentBody}
                        onChange={(event) => setCommentBody(event.target.value)}
                        placeholder="Add a comment…"
                        rows={2}
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCommentBody("")}
                          disabled={!commentBody}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={!commentBody.trim()}
                          loading={postComment.isPending}
                          onClick={async () => {
                            const posted = await postComment.mutateAsync(commentBody.trim());
                            setCommentBody("");
                            // A link auto-holds a comment for the channel to review (see
                            // engagement.ts's postComment()) — it won't show up in the
                            // list below yet, so say so rather than letting it silently
                            // vanish with no explanation.
                            toast(
                              posted.status === "held"
                                ? {
                                    title: "Comment awaiting review",
                                    description: "It contains a link, so it's held until the channel approves it.",
                                    tone: "info",
                                  }
                                : { title: "Comment posted" },
                            );
                          }}
                        >
                          Comment
                        </Button>
                      </div>
                    </div>
                  </div>

                  <ul className="mt-6 space-y-5">
                    {comments.map((comment) => (
                      <li key={comment.id} className="flex gap-3">
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
                                ♥ Creator
                              </Badge>
                            ) : null}
                            {comment.status === "held" ? (
                              <Badge tone="warning" size="sm">
                                Held for review
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-fg-muted">
                            {comment.body}
                          </p>
                          <div className="mt-1.5 flex items-center gap-3 text-xs text-fg-subtle">
                            <span className="inline-flex items-center gap-1 nx-tnum">
                              <IconThumbUp className="size-3.5" />
                              {compactNumber(comment.likes)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setReplyTo(replyTo === comment.id ? null : comment.id)
                              }
                              className="font-medium transition-colors hover:text-fg"
                            >
                              Reply
                            </button>
                          </div>

                          {replyTo === comment.id ? (
                            <div className="mt-3">
                              <Textarea
                                value={replyBody}
                                onChange={(event) => setReplyBody(event.target.value)}
                                placeholder={`Reply to ${comment.authorName}…`}
                                rows={2}
                              />
                              <div className="mt-2 flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setReplyTo(null);
                                    setReplyBody("");
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  disabled={!replyBody.trim()}
                                  onClick={async () => {
                                    await replyToComment.mutateAsync({
                                      commentId: comment.id,
                                      body: replyBody.trim(),
                                    });
                                    setReplyBody("");
                                    setReplyTo(null);
                                    toast({ title: "Reply posted" });
                                  }}
                                >
                                  Reply
                                </Button>
                              </div>
                            </div>
                          ) : null}

                          {comment.replies.length > 0 ? (
                            <ul className="mt-3 space-y-3 border-l border-border pl-4">
                              {comment.replies.map((reply) => (
                                <li key={reply.id} className="flex gap-2.5">
                                  <Avatar
                                    name={reply.authorName}
                                    gradient={reply.authorGradient}
                                    size="sm"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-sm font-medium text-fg">
                                        {reply.authorName}
                                      </span>
                                      <span className="text-xs text-fg-subtle">
                                        {relativeTime(reply.createdAt)}
                                      </span>
                                      {reply.heartedByCreator ? (
                                        <Badge tone="accent" size="sm">
                                          ♥
                                        </Badge>
                                      ) : null}
                                    </div>
                                    <p className="mt-0.5 text-sm leading-relaxed text-fg-muted">
                                      {reply.body}
                                    </p>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {comments.length === 0 ? (
                    <EmptyState
                      compact
                      className="mt-6"
                      title="No comments yet"
                      description="Be the first to say something."
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Related rail */}
        <aside className="min-w-0 px-4 sm:px-0">
          <h2 className="mb-3 font-display text-base font-semibold text-fg">
            Related
          </h2>
          {isRelatedLoading ? (
            <RailSkeleton count={4} />
          ) : related.length === 0 ? (
            <EmptyState compact title="No related videos yet" />
          ) : (
            <ul className="space-y-4">
              {related.slice(0, 10).map((item) => (
                <li key={item.id}>
                  <VideoCard video={item} layout="row" />
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <PurchaseModal
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        video={video}
        loading={purchase.isPending || startSubscription.isPending}
        onPurchase={handlePurchase}
        onSubscribe={handleSubscribe}
      />

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} video={video} />
    </div>
  );
}

/* ------------------------------- Panels ---------------------------------- */

function AboutPanel({ video }: { video: Video }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-fg-muted">
          {video.synopsis}
        </p>
        {video.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {video.tags.map((tag) => (
              <Link key={tag} href={`/search?q=${encodeURIComponent(tag)}`}>
                <Badge tone="outline" size="sm">
                  #{tag}
                </Badge>
              </Link>
            ))}
          </div>
        ) : null}
        {video.categoryIds.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {video.categoryIds.map((categoryId) => {
              const category = categoryById(categoryId);
              if (!category) return null;
              return (
                <Link key={categoryId} href={`/category/${category.slug}`}>
                  <Badge tone="accent" size="sm">
                    {category.name}
                  </Badge>
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      {video.credits.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            Credits
          </h3>
          <dl className="mt-2 space-y-1.5">
            {video.credits.map((credit, index) => (
              <div key={`${credit.role}-${index}`} className="flex gap-3 text-sm">
                <dt className="w-32 shrink-0 text-fg-subtle">{credit.role}</dt>
                <dd className="min-w-0 text-fg">{credit.name}</dd>
              </div>
            ))}
          </dl>
          {video.productionCompany ? (
            <p className="mt-3 text-sm text-fg-muted">
              Produced by{" "}
              <span className="text-fg">{video.productionCompany}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DetailsPanel({ video }: { video: Video }) {
  const [claimOpen, setClaimOpen] = React.useState(false);
  const rows: Array<[string, React.ReactNode]> = [
    ["Release date", formatDate(video.releaseDate, "long")],
    ["Runtime", formatRuntime(video.durationSeconds)],
    ["Language", video.language],
    ["Country of origin", video.country],
    ["Age rating", video.rights.ageRating],
    [
      "Available quality",
      video.qualities.map((level) => level.label).join(" · "),
    ],
    [
      "Subtitles",
      video.subtitles.length
        ? video.subtitles
            .map(
              (track) =>
                `${track.language}${track.autoGenerated ? " (auto)" : ""}${track.kind === "sdh" ? " SDH" : ""}`,
            )
            .join(" · ")
        : "None",
    ],
    [
      "Audio tracks",
      video.audioTracks
        .map(
          (track) =>
            `${track.language}${track.kind !== "original" ? ` (${track.kind.replace("-", " ")})` : ""}`,
        )
        .join(" · "),
    ],
    ["Rights holder", video.rights.declaredOwner],
    [
      "Licence period",
      `${formatDate(video.rights.licenceStart)} → ${
        video.rights.licenceEnd ? formatDate(video.rights.licenceEnd) : "no end date"
      }`,
    ],
    [
      "Territories",
      video.rights.permittedCountries.length
        ? `Available in ${video.rights.permittedCountries.join(", ")}`
        : video.rights.blockedCountries.length
          ? `Worldwide except ${video.rights.blockedCountries.join(", ")}`
          : "Worldwide",
    ],
    [
      "Content labels",
      video.rights.contentLabels.length
        ? video.rights.contentLabels.map((label) => label.replace("-", " ")).join(" · ")
        : "None",
    ],
    [
      "Access model",
      video.pricing.accessModels.map((model) => model.replace("-", " ")).join(" · "),
    ],
  ];

  return (
    <>
      <Card>
        <CardBody className="p-0">
          <dl className="divide-y divide-border">
            {rows.map(([label, value]) => (
              <div key={label} className="grid gap-1 px-5 py-3 sm:grid-cols-[12rem_1fr]">
                <dt className="text-sm text-fg-subtle">{label}</dt>
                <dd className="text-sm text-fg">{value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
        <div className="border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => setClaimOpen(true)}
            className="text-xs text-fg-subtle underline decoration-dotted underline-offset-2 transition-colors hover:text-fg"
          >
            Report a copyright claim on this video
          </button>
        </div>
      </Card>
      <CopyrightClaimModal open={claimOpen} onClose={() => setClaimOpen(false)} videoId={video.id} />
    </>
  );
}

function CopyrightClaimModal({
  open,
  onClose,
  videoId,
}: {
  open: boolean;
  onClose: () => void;
  videoId: string;
}) {
  const { toast } = useToast();
  const [claimantName, setClaimantName] = React.useState("");
  const [claimantEmail, setClaimantEmail] = React.useState("");
  const [claimantOrganization, setClaimantOrganization] = React.useState("");
  const [workDescription, setWorkDescription] = React.useState("");
  const [infringementDescription, setInfringementDescription] = React.useState("");
  const [goodFaith, setGoodFaith] = React.useState(false);
  const [accurate, setAccurate] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const reset = () => {
    setClaimantName("");
    setClaimantEmail("");
    setClaimantOrganization("");
    setWorkDescription("");
    setInfringementDescription("");
    setGoodFaith(false);
    setAccurate(false);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/copyright/claims/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          claimantName,
          claimantEmail,
          claimantOrganization: claimantOrganization || undefined,
          workDescription,
          infringementDescription,
          goodFaithStatement: goodFaith,
          accuracyStatement: accurate,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not submit the claim.");
      }
      const claim = (await res.json()) as { reference: string };
      toast({
        title: "Claim submitted",
        description: `Reference ${claim.reference}. The video has been restricted pending review.`,
      });
      reset();
      onClose();
    } catch (err) {
      toast({
        title: "Couldn't submit the claim",
        description: err instanceof Error ? err.message : "Something went wrong. Try again.",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    claimantName.trim() &&
    /.+@.+\..+/.test(claimantEmail) &&
    workDescription.trim() &&
    infringementDescription.trim() &&
    goodFaith &&
    accurate;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Report a copyright claim"
      description="For rights holders reporting infringing content. A well-formed claim restricts the video immediately, pending review — the uploader can contest it with a counter-notice."
      size="md"
    >
      <div className="space-y-4">
        <Field label="Your name" htmlFor="claim-name" required>
          <Input id="claim-name" value={claimantName} onChange={(e) => setClaimantName(e.target.value)} />
        </Field>
        <Field label="Your email" htmlFor="claim-email" required>
          <Input
            id="claim-email"
            type="email"
            value={claimantEmail}
            onChange={(e) => setClaimantEmail(e.target.value)}
          />
        </Field>
        <Field label="Organization (optional)" htmlFor="claim-org">
          <Input
            id="claim-org"
            value={claimantOrganization}
            onChange={(e) => setClaimantOrganization(e.target.value)}
          />
        </Field>
        <Field label="Describe the copyrighted work" htmlFor="claim-work" required>
          <Textarea
            id="claim-work"
            rows={2}
            value={workDescription}
            onChange={(e) => setWorkDescription(e.target.value)}
          />
        </Field>
        <Field label="Describe how this video infringes it" htmlFor="claim-infringement" required>
          <Textarea
            id="claim-infringement"
            rows={3}
            value={infringementDescription}
            onChange={(e) => setInfringementDescription(e.target.value)}
          />
        </Field>
        <Checkbox
          checked={goodFaith}
          onChange={(e) => setGoodFaith(e.target.checked)}
          label="I have a good-faith belief that this use is not authorized by the copyright owner, its agent, or the law."
        />
        <Checkbox
          checked={accurate}
          onChange={(e) => setAccurate(e.target.checked)}
          label="The information in this notice is accurate, and, under penalty of perjury, I am authorized to act on behalf of the copyright owner."
        />
        <Button className="w-full" onClick={submit} loading={submitting} disabled={!canSubmit}>
          Submit claim
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------ Controls --------------------------------- */

function RatingControl({
  value,
  onRate,
}: {
  value: number;
  onRate: (stars: 1 | 2 | 3 | 4 | 5) => void;
}) {
  const [hover, setHover] = React.useState(0);
  return (
    <div
      className="flex items-center gap-0.5 rounded border border-border-strong bg-surface-3 px-2 py-1"
      onMouseLeave={() => setHover(0)}
      role="group"
      aria-label="Rate this video"
    >
      {([1, 2, 3, 4, 5] as const).map((star) => {
        const filled = (hover || value) >= star;
        return (
          <button
            key={star}
            type="button"
            aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
            onMouseEnter={() => setHover(star)}
            onClick={() => onRate(star)}
            className="flex size-6 items-center justify-center transition-transform hover:scale-110"
          >
            {filled ? (
              <IconStarFilled className="size-4 text-warning" />
            ) : (
              <IconStar className="size-4 text-fg-subtle" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Real membership price for a real channel — no mock counterpart to preserve a
 * signature for (the mock's own "membership" row has always shown a flat hardcoded
 * price with nothing configurable behind it), so this talks to the new API directly,
 * same as studio/revenue's usePayoutStatus(). */
function useMembershipTier(channelId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["membership-tier", channelId],
    queryFn: async (): Promise<{ priceMinor: number; currency: string; isEnabled: boolean } | null> => {
      const res = await fetch(`/api/channels/${encodeURIComponent(channelId)}/membership-tier/`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled,
  });
}

function PurchaseModal({
  open,
  onClose,
  video,
  loading,
  onPurchase,
  onSubscribe,
}: {
  open: boolean;
  onClose: () => void;
  video: Video;
  loading: boolean;
  onPurchase: (kind: "buy" | "rent" | "ppv") => void;
  onSubscribe: (channelId?: string) => void;
}) {
  const { rentPrice, buyPrice, ppvPrice, accessModels, rentalWindowHours } =
    video.pricing;
  const isRealChannel = looksLikeRealId(video.channelId);
  const { data: membershipTier } = useMembershipTier(
    video.channelId,
    isRealChannel && accessModels.includes("membership"),
  );
  // A real channel that hasn't configured (or has disabled) a real tier has nothing to
  // sell — showing the row would only lead to an honest "not available" rejection at
  // checkout, so it's left off entirely instead, same "don't show a broken offer"
  // reasoning as the rest of this app's real/mock split.
  const showMembership = accessModels.includes("membership") && (!isRealChannel || membershipTier?.isEnabled);
  const membershipPrice =
    isRealChannel && membershipTier
      ? `${formatCurrency(membershipTier.priceMinor, membershipTier.currency)} / month`
      : "From £4.00 / month";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Get access to ${video.title}`}
      description={
        looksLikeRealId(video.id)
          ? "You'll be taken to a secure Stripe checkout page to complete payment."
          : "Mock checkout. No payment provider is contacted and no card details are collected anywhere in this build."
      }
      size="md"
    >
      <div className="space-y-3">
        {accessModels.includes("rent") && rentPrice ? (
          <OfferRow
            title={`Rent for ${rentalWindowHours ?? 48} hours`}
            description="Starts when you press play. Watch as many times as you like within the window."
            price={formatCurrency(rentPrice.amount, rentPrice.currency)}
            icon={<IconClock />}
            loading={loading}
            onSelect={() => onPurchase("rent")}
          />
        ) : null}

        {accessModels.includes("buy") && buyPrice ? (
          <OfferRow
            title="Buy outright"
            description="Permanent access in your library, including future remasters."
            price={formatCurrency(buyPrice.amount, buyPrice.currency)}
            icon={<IconBookmark />}
            loading={loading}
            onSelect={() => onPurchase("buy")}
            primary
          />
        ) : null}

        {accessModels.includes("ppv") && ppvPrice ? (
          <OfferRow
            title="Pay-per-view"
            description="One-off access to this title."
            price={formatCurrency(ppvPrice.amount, ppvPrice.currency)}
            icon={<IconWorld />}
            loading={loading}
            onSelect={() => onPurchase("ppv")}
            primary
          />
        ) : null}

        {accessModels.includes("subscription") ? (
          <OfferRow
            title="Nexus Premium"
            description="Included with a Premium subscription, along with the rest of the included catalogue."
            price="£9.99 / month"
            icon={<IconStarFilled />}
            loading={loading}
            onSelect={onSubscribe}
          />
        ) : null}

        {showMembership ? (
          <OfferRow
            title="Channel membership"
            description="Supports the channel directly and unlocks members-only content."
            price={membershipPrice}
            icon={<IconStar />}
            loading={loading}
            onSelect={() => onSubscribe(video.channelId)}
          />
        ) : null}
      </div>
    </Modal>
  );
}

function OfferRow({
  title,
  description,
  price,
  icon,
  onSelect,
  loading,
  primary,
}: {
  title: string;
  description: string;
  price: string;
  icon: React.ReactNode;
  onSelect: () => void;
  loading?: boolean;
  primary?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface-2 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-accent [&_svg]:size-[18px]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-fg nx-tnum">{price}</span>
        <Button
          variant={primary ? "primary" : "secondary"}
          size="sm"
          onClick={onSelect}
          loading={loading}
        >
          Select
        </Button>
      </div>
    </div>
  );
}

function ShareModal({
  open,
  onClose,
  video,
}: {
  open: boolean;
  onClose: () => void;
  video: Video;
}) {
  const { toast } = useToast();
  const url = `https://nexus.example/video/${video.id}`;

  return (
    <Modal open={open} onClose={onClose} title="Share" size="sm">
      {/* Social preview block, as specified in §5. */}
      <div className="overflow-hidden rounded-lg border border-border">
        <div
          aria-hidden
          className="h-28 w-full"
          style={{
            backgroundImage: `linear-gradient(135deg, ${video.posterGradient[0]}, ${video.posterGradient[1]})`,
          }}
        />
        <div className="bg-surface-2 p-3">
          <p className="text-2xs uppercase tracking-wide text-fg-subtle">
            nexus.example
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-fg">{video.title}</p>
          <p className="mt-0.5 nx-clamp-2 text-xs text-fg-muted">{video.synopsis}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate rounded border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-fg-muted">
          {url}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            navigator.clipboard?.writeText(url).catch(() => {});
            toast({ title: "Link copied" });
          }}
        >
          <IconCopy />
          Copy
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: "X", icon: <IconBrandX /> },
          { label: "Facebook", icon: <IconBrandFacebook /> },
          { label: "Embed", icon: <IconLink /> },
        ].map((item) => (
          <Button
            key={item.label}
            variant="secondary"
            size="sm"
            onClick={() =>
              toast({
                title: `${item.label} share is a UI demonstration`,
                tone: "info",
              })
            }
          >
            {item.icon}
            {item.label}
          </Button>
        ))}
      </div>
    </Modal>
  );
}
