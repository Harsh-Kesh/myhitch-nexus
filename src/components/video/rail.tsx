"use client";

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import type { Video } from "@/lib/mock-api/types";
import { cn } from "@/lib/utils";
import { VideoCard } from "./video-card";
import { SponsoredCard } from "./sponsored-card";

export interface RailProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  href?: string;
  videos: Video[];
  layout?: "wide" | "poster";
  progressFor?: (videoId: string) => number | undefined;
  showStatus?: boolean;
  showSponsored?: boolean;
  className?: string;
}

/**
 * Horizontal content rail. Scroll buttons appear on pointer devices; on touch
 * the native scroll with snap points does the work.
 */
export function Rail({
  title,
  subtitle,
  href,
  videos,
  layout = "wide",
  progressFor,
  showStatus,
  showSponsored = true,
  className,
}: RailProps) {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScrollState = React.useCallback(() => {
    const element = scrollerRef.current;
    if (!element) return;
    setCanScrollLeft(element.scrollLeft > 8);
    setCanScrollRight(
      element.scrollLeft + element.clientWidth < element.scrollWidth - 8,
    );
  }, []);

  React.useEffect(() => {
    updateScrollState();
    const element = scrollerRef.current;
    if (!element) return;
    element.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      element.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState, videos.length]);

  const scrollBy = (direction: 1 | -1) => {
    const element = scrollerRef.current;
    if (!element) return;
    element.scrollBy({
      left: direction * Math.round(element.clientWidth * 0.85),
      behavior: "smooth",
    });
  };

  if (videos.length === 0) return null;

  return (
    <section className={cn("relative", className)}>
      <div className="mb-3 flex items-end justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-fg sm:text-xl">
            {href ? (
              <Link href={href} className="transition-colors hover:text-accent">
                {title}
              </Link>
            ) : (
              title
            )}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 truncate text-sm text-fg-muted">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {href ? (
            <Button variant="ghost" size="sm" href={href} className="hidden sm:inline-flex">
              See all
            </Button>
          ) : null}
          <div className="hidden gap-1 md:flex">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Scroll ${typeof title === "string" ? title : "rail"} left`}
              disabled={!canScrollLeft}
              onClick={() => scrollBy(-1)}
            >
              <IconChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Scroll ${typeof title === "string" ? title : "rail"} right`}
              disabled={!canScrollRight}
              onClick={() => scrollBy(1)}
            >
              <IconChevronRight />
            </Button>
          </div>
        </div>
      </div>

      <div
        ref={scrollerRef}
        // justify-start: .nx-rail's grid-auto-flow: column leaves its implicit columns
        // at their default `auto` sizing, and CSS Grid's default justify-content
        // ("normal") stretches auto-sized tracks to fill leftover space — so a rail with
        // few cards (fewer than fit the viewport) spreads them apart with growing gaps
        // instead of packing them together, while a fuller rail looks fine because
        // there's no leftover space left to stretch into. justify-start pins tracks to
        // their content size regardless of leftover space (2026-09-20, reported as
        // "spacing looks different between rails").
        className="nx-rail justify-start gap-3 px-4 pb-1 sm:gap-4 sm:px-6 lg:px-8"
      >
        {videos.map((video) => (
          <div
            key={video.id}
            className={cn(
              layout === "poster"
                ? "w-[8.5rem] sm:w-40 lg:w-44"
                : "w-[15rem] sm:w-[17rem] lg:w-[19rem] 3xl:w-[21rem]",
            )}
          >
            <VideoCard
              video={video}
              layout={layout}
              progress={progressFor?.(video.id)}
              showStatus={showStatus}
            />
          </div>
        ))}
        {showSponsored ? (
          <div
            className={cn(
              layout === "poster"
                ? "w-[8.5rem] sm:w-40 lg:w-44"
                : "w-[15rem] sm:w-[17rem] lg:w-[19rem] 3xl:w-[21rem]",
            )}
          >
            <SponsoredCard layout={layout} />
          </div>
        ) : null}
        {/* Trailing spacer so the last card clears the viewport edge. */}
        <div aria-hidden className="w-1 shrink-0" />
      </div>
    </section>
  );
}

/** Non-scrolling grid used on browse/search pages. */
export function VideoGrid({
  videos,
  layout = "wide",
  progressFor,
  showStatus,
  onToggleWatchlist,
  watchlist,
  showSponsored,
  className,
}: {
  videos: Video[];
  layout?: "wide" | "poster";
  progressFor?: (videoId: string) => number | undefined;
  showStatus?: boolean;
  onToggleWatchlist?: (videoId: string) => void;
  watchlist?: string[];
  showSponsored?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-4 gap-y-6",
        layout === "poster"
          ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 3xl:grid-cols-9"
          : "grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 tv:grid-cols-6",
        className,
      )}
    >
      {videos.map((video) => (
        <VideoCard
          key={video.id}
          video={video}
          layout={layout}
          progress={progressFor?.(video.id)}
          showStatus={showStatus}
          onToggleWatchlist={onToggleWatchlist}
          inWatchlist={watchlist?.includes(video.id)}
        />
      ))}
      {showSponsored ? <SponsoredCard layout={layout} /> : null}
    </div>
  );
}
