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
import { VideoPlayer } from "@/components/player/video-player";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { VideoCard } from "@/components/video/video-card";
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
  const { data: currentUser, isLoading: isCurrentUserLoading } = useCurrentUser();
  const { data: entitlement } = useEntitlement(id);
  const { data: channel } = useChannel(video?.channelId ?? "");
  const { data: related = [] } = useRelatedVideos(id);
  const { data: comments = [] } = useComments(id);
  const { data: progress } = useWatchProgress(id);
  const { data: watchlist = [] } = useWatchlist();
  const { data: myRating } = useMyRating(id);
  const { data: following } = useIsFollowing(video?.channelId ?? "");

  const toggleWatchlist = useToggleWatchlist();
  const toggleFollow = useToggleFollow();
  const likeVideo = useLikeVideo(id);
  const rateVideo = useRateVideo(id);
  const postComment = usePostComment(id);
  const replyToComment = useReplyToComment(id);
  const purchase = usePurchaseAccess(id);
  const startSubscription = useStartSubscription();
  const router = useRouter();

  // Redirect guests to the login page — video content requires sign-in. Gated on the
  // *current user* query's own loading state, not the video's (a bug: on a fresh
  // client-side navigation the video can finish loading before GET /api/auth/me
  // resolves, and currentUser is still its initial `undefined` at that instant — not
  // `null` — so this wouldn't misfire either way; found via a genuinely flaky e2e
  // failure that never reproduced outside Playwright's exact timing, not a report).
  React.useEffect(() => {
    if (!isCurrentUserLoading && currentUser === null) {
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
    await purchase.mutateAsync(kind);
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

  const handleSubscribe = async () => {
    await startSubscription.mutateAsync({ name: "Nexus Premium" });
    setPurchaseOpen(false);
    toast({
      title: "Premium activated",
      description: "Titles included with Premium now play without a purchase.",
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

              <h1 className="mt-2.5 font-display text-2xl font-semibold leading-tight text-fg sm:text-3xl">
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
                onClick={() => {
                  likeVideo.mutate();
                  setLiked(true);
                  toast({ title: "Thanks — noted", tone: "info" });
                }}
                className={cn(liked && "text-accent")}
              >
                <IconThumbUp />
                <span className="nx-tnum">{compactNumber(video.likes + (liked ? 1 : 0))}</span>
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
                            await postComment.mutateAsync(commentBody.trim());
                            setCommentBody("");
                            toast({ title: "Comment posted" });
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
          {related.length === 0 ? (
            <RailSkeleton count={4} />
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
    </Card>
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
            className="p-0.5 transition-transform hover:scale-110"
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
  onSubscribe: () => void;
}) {
  const { rentPrice, buyPrice, ppvPrice, accessModels, rentalWindowHours } =
    video.pricing;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Get access to ${video.title}`}
      description="Mock checkout. No payment provider is contacted and no card details are collected anywhere in this build."
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

        {accessModels.includes("membership") ? (
          <OfferRow
            title="Channel membership"
            description="Supports the channel directly and unlocks members-only content."
            price="From £4.00 / month"
            icon={<IconStar />}
            loading={loading}
            onSelect={onSubscribe}
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
