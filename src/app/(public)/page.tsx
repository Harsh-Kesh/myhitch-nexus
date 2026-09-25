"use client";

import {
  IconBookmark,
  IconBookmarkFilled,
  IconChevronLeft,
  IconChevronRight,
  IconInfoCircle,
  IconPlayerPlayFilled,
  IconStarFilled,
} from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RailSkeleton } from "@/components/ui/empty-state";
import { Poster } from "@/components/video/poster";
import { Rail, useHorizontalScroller } from "@/components/video/rail";
import { CONTENT_TYPE_LABELS } from "@/lib/mock-api/data/categories";
import { channelById } from "@/lib/mock-api/data/channels";
import {
  useContinueWatching,
  useFeaturedContent,
  useLiveEvents,
  useToggleWatchlist,
  useWatchlist,
} from "@/lib/mock-api/hooks";
import type { LiveEvent, Video } from "@/lib/mock-api/types";
import {
  cn,
  compactNumber,
  formatCurrency,
  formatDateTime,
  formatRuntime,
} from "@/lib/utils";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const { data: featured, isLoading } = useFeaturedContent();
  const { data: continueWatching = [] } = useContinueWatching();
  const { data: liveEvents = [] } = useLiveEvents();
  const { data: watchlist = [] } = useWatchlist();
  const toggleWatchlist = useToggleWatchlist();
  // The video page is fully viewable signed out — see video-card.tsx's link comment.
  const goToVideo = React.useCallback(
    (videoId: string) => {
      router.push(`/video/${videoId}`);
    },
    [router],
  );

  const progressFor = React.useCallback(
    (videoId: string) => {
      const entry = continueWatching.find((item) => item.video.id === videoId);
      if (!entry || entry.progress.completed) return undefined;
      return (entry.progress.positionSeconds / entry.progress.durationSeconds) * 100;
    },
    [continueWatching],
  );

  return (
    <div className="pb-4">
      <Hero
        videos={featured?.hero ?? []}
        loading={isLoading}
        watchlist={watchlist.map((item) => item.id)}
        onToggleWatchlist={(id) => toggleWatchlist.mutate(id)}
        goToVideo={goToVideo}
      />

      <div className="mt-8 space-y-10 sm:mt-10">
        {isLoading ? (
          <div className="space-y-8 px-4 sm:px-6 lg:px-8">
            <RailSkeleton count={5} />
            <RailSkeleton count={5} />
          </div>
        ) : null}

        {featured?.rails.map((rail) =>
          rail.kind === "live" ? (
            <LiveRail key={rail.id} events={liveEvents} />
          ) : rail.videos.length > 0 ? (
            <Rail
              key={rail.id}
              title={rail.title}
              subtitle={rail.subtitle}
              href={rail.href}
              videos={rail.videos}
              layout={rail.kind === "poster" ? "poster" : "wide"}
              progressFor={rail.kind === "continue" ? progressFor : undefined}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Hero ---------------------------------- */

function Hero({
  videos,
  loading,
  watchlist,
  onToggleWatchlist,
  goToVideo,
}: {
  videos: Video[];
  loading: boolean;
  watchlist: string[];
  onToggleWatchlist: (id: string) => void;
  goToVideo: (id: string) => void;
}) {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (videos.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % videos.length),
      9_000,
    );
    return () => window.clearInterval(timer);
  }, [videos.length]);

  if (loading || videos.length === 0) {
    return (
      <div className="nx-skeleton h-[26rem] w-full sm:h-[30rem] lg:h-[34rem] 3xl:h-[40rem]" />
    );
  }

  const video = videos[index];
  // Real (Postgres) videos carry their channel's display name directly
  // (VideoSummary.channelName) rather than a mock-shaped channelId that channelById()
  // can resolve — same fix as VideoCard's, and for the same reason: without it, every
  // hero title (now always real, since getFeaturedContent() no longer returns mock
  // videos) would silently drop its channel line.
  const realChannelName = (video as { channelName?: string }).channelName;
  const channel = channelById(video.channelId);
  const channelName = channel?.name ?? realChannelName;
  const price =
    video.pricing.rentPrice ?? video.pricing.buyPrice ?? video.pricing.ppvPrice;
  const inWatchlist = watchlist.includes(video.id);

  return (
    <section
      data-surface="cinema"
      className="relative h-[26rem] w-full overflow-hidden sm:h-[30rem] lg:h-[34rem] 3xl:h-[40rem]"
      aria-roledescription="carousel"
      aria-label="Featured titles"
    >
      {videos.map((item, itemIndex) => (
        <Poster
          key={item.id}
          src={item.heroUrl || item.thumbnailUrl}
          alt={item.title}
          gradient={item.posterGradient}
          seed={item.id}
          ratio="none"
          className={cn(
            "absolute inset-0 size-full transition-opacity duration-700",
            itemIndex === index ? "opacity-100" : "opacity-0",
          )}
        />
      ))}

      <div className="absolute inset-0 nx-scrim" />
      <div className="absolute inset-0 hidden nx-scrim-side lg:block" />

      <div className="relative flex h-full items-end pb-10 sm:pb-14">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl 3xl:max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent" size="sm">
                {CONTENT_TYPE_LABELS[video.contentType]}
              </Badge>
              {video.pricing.sponsored ? (
                <Badge tone="outline" size="sm">
                  Sponsored
                </Badge>
              ) : null}
              <Badge tone="outline" size="sm">
                {video.rights.ageRating}
              </Badge>
            </div>

            <h1 className="mt-3 font-display text-3xl font-semibold leading-[1.05] text-fg sm:text-4xl lg:text-5xl">
              {video.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
              {channelName ? (
                <Link
                  href={`/channel/${video.channelId}`}
                  className="font-medium text-fg transition-colors hover:text-accent"
                >
                  {channelName}
                </Link>
              ) : null}
              <span className="inline-flex items-center gap-1 nx-tnum">
                <IconStarFilled className="size-3.5 text-warning" />
                {video.ratingAverage.toFixed(1)}
              </span>
              <span className="nx-tnum">{formatRuntime(video.durationSeconds)}</span>
              <span className="nx-tnum">{video.releaseDate.slice(0, 4)}</span>
              <span className="nx-tnum">{compactNumber(video.views)} views</span>
            </div>

            <p className="mt-3 nx-clamp-3 max-w-lg text-sm leading-relaxed text-fg-muted sm:text-base">
              {video.synopsis}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button variant="primary" size="lg" onClick={() => goToVideo(video.id)}>
                <IconPlayerPlayFilled />
                {price ? "Watch preview" : "Play"}
              </Button>
              {price ? (
                <Button variant="secondary" size="lg" onClick={() => goToVideo(video.id)}>
                  From {formatCurrency(price.amount, price.currency)}
                </Button>
              ) : (
                <Button variant="secondary" size="lg" onClick={() => goToVideo(video.id)}>
                  <IconInfoCircle />
                  More info
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
                onClick={() => onToggleWatchlist(video.id)}
              >
                {inWatchlist ? <IconBookmarkFilled /> : <IconBookmark />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Carousel controls */}
      <div className="absolute bottom-5 right-4 hidden items-center gap-2 sm:flex lg:right-8">
        <Button
          variant="overlay"
          size="icon-sm"
          aria-label="Previous featured title"
          onClick={() => setIndex((current) => (current - 1 + videos.length) % videos.length)}
        >
          <IconChevronLeft />
        </Button>
        <div className="flex gap-1.5">
          {videos.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Show ${item.title}`}
              aria-current={itemIndex === index}
              onClick={() => setIndex(itemIndex)}
              className={cn(
                "h-1 rounded-full transition-all",
                itemIndex === index ? "w-6 bg-accent" : "w-3 bg-white/35 hover:bg-white/60",
              )}
            />
          ))}
        </div>
        <Button
          variant="overlay"
          size="icon-sm"
          aria-label="Next featured title"
          onClick={() => setIndex((current) => (current + 1) % videos.length)}
        >
          <IconChevronRight />
        </Button>
      </div>
    </section>
  );
}

/* --------------------------------- Rails --------------------------------- */

function LiveRail({
  events,
}: {
  events: LiveEvent[];
}) {
  const shown = events.filter(
    (event) => event.status === "live" || event.status === "upcoming",
  );
  // Same scroll-position fix as every other rail (rail.tsx's useHorizontalScroller) — this
  // one was hand-rolled separately and had neither the reset-to-start behavior nor scroll
  // buttons, so a viewer stuck at a drifted scroll position had no way to get back to 0.
  const { scrollerRef, canScrollLeft, canScrollRight, scrollBy } = useHorizontalScroller(shown.length);
  if (shown.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div>
          <h2 className="font-display text-lg font-semibold text-fg sm:text-xl">
            <Link href="/live" className="transition-colors hover:text-accent">
              Live and upcoming
            </Link>
          </h2>
          <p className="mt-0.5 text-sm text-fg-muted">
            Streaming now, plus what is scheduled
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" href="/live" className="hidden sm:inline-flex">
            See all
          </Button>
          <div className="hidden gap-1 md:flex">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Scroll Live and upcoming left"
              disabled={!canScrollLeft}
              onClick={() => scrollBy(-1)}
            >
              <IconChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Scroll Live and upcoming right"
              disabled={!canScrollRight}
              onClick={() => scrollBy(1)}
            >
              <IconChevronRight />
            </Button>
          </div>
        </div>
      </div>

      {/* justify-start — see rail.tsx's comment on the same class for why a short rail
          needs this to avoid CSS Grid auto-stretching its cards apart. */}
      <div
        ref={scrollerRef}
        className="nx-rail justify-start gap-3 px-4 pb-1 sm:gap-4 sm:px-6 lg:px-8"
      >
        {shown.map((event) => {
          const channel = channelById(event.channelId);
          return (
            <Link
              key={event.id}
              href={`/live/${event.id}`}
              className="group w-[15rem] sm:w-[17rem] lg:w-[19rem]"
            >
              <Poster
                src={event.thumbnailUrl}
                alt={event.title}
                gradient={event.posterGradient}
                seed={event.id}
                ratio="video"
                className="rounded-lg"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                <div className="absolute left-2 top-2">
                  {event.status === "live" ? (
                    <LiveBadge size="sm" />
                  ) : (
                    <Badge tone="outline" size="sm" className="bg-black/60 backdrop-blur-sm">
                      Scheduled
                    </Badge>
                  )}
                </div>
                {event.accessType !== "public" ? (
                  <div className="absolute right-2 top-2">
                    <Badge tone="accent" size="sm">
                      {event.accessType === "ticketed"
                        ? "Ticketed"
                        : event.accessType === "subscriber-only"
                          ? "Subscribers"
                          : "Restricted"}
                    </Badge>
                  </div>
                ) : null}
                <div className="absolute inset-x-2 bottom-2">
                  <p className="nx-clamp-2 text-sm font-medium text-white">
                    {event.title}
                  </p>
                  <p className="mt-0.5 text-2xs text-white/70 nx-tnum">
                    {event.status === "live"
                      ? `${compactNumber(event.viewerCount)} watching`
                      : formatDateTime(event.scheduledStart)}
                  </p>
                </div>
              </Poster>
              <p className="mt-2 truncate text-xs text-fg-muted">{channel?.name}</p>
            </Link>
          );
        })}
        <div aria-hidden className="w-1 shrink-0" />
      </div>
    </section>
  );
}
