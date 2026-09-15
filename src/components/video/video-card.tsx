"use client";

import {
  IconBookmark,
  IconBookmarkFilled,
  IconEye,
  IconLock,
  IconPlayerPlayFilled,
  IconStarFilled,
  IconWorldOff,
} from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LiveBadge, StatusBadge } from "@/components/ui/badge";
import { channelById } from "@/lib/mock-api/data/channels";
import { useCurrentUser } from "@/lib/mock-api/hooks";
import type { Video } from "@/lib/mock-api/types";
import {
  cn,
  compactNumber,
  formatCurrency,
  formatDuration,
  relativeTime,
} from "@/lib/utils";
import { Poster } from "./poster";

export function accessLabel(video: Video): {
  label: string;
  tone: "accent" | "neutral" | "info" | "success";
} | null {
  const { accessModels, rentPrice, buyPrice, ppvPrice } = video.pricing;
  if (accessModels.includes("free")) return null;
  if (accessModels.includes("rent") && rentPrice)
    return { label: `Rent ${formatCurrency(rentPrice.amount, rentPrice.currency)}`, tone: "accent" };
  if (accessModels.includes("buy") && buyPrice)
    return { label: `Buy ${formatCurrency(buyPrice.amount, buyPrice.currency)}`, tone: "accent" };
  if (accessModels.includes("ppv") && ppvPrice)
    return { label: `${formatCurrency(ppvPrice.amount, ppvPrice.currency)} event`, tone: "accent" };
  if (accessModels.includes("subscription")) return { label: "Premium", tone: "info" };
  if (accessModels.includes("membership")) return { label: "Members", tone: "info" };
  if (accessModels.includes("ad-supported")) return null;
  return null;
}

export interface VideoCardProps {
  video: Video;
  layout?: "wide" | "poster" | "row";
  /** 0–100. Renders the resume bar across the bottom of the thumbnail. */
  progress?: number;
  showChannel?: boolean;
  showStatus?: boolean;
  onToggleWatchlist?: (videoId: string) => void;
  inWatchlist?: boolean;
  className?: string;
  href?: string;
  /** Suppresses the metadata line — used in dense picker grids. */
  minimal?: boolean;
}

export function VideoCard({
  video,
  layout = "wide",
  progress,
  showChannel = true,
  showStatus,
  onToggleWatchlist,
  inWatchlist,
  className,
  href,
  minimal,
}: VideoCardProps) {
  const { data: user } = useCurrentUser();
  const isGuest = !user;

  // Real (Postgres) video objects — cast through as `Video` at the fetch boundary the
  // same way searchVideos()/getWatchlist() already do — carry their channel's name
  // directly (VideoSummary.channelName) rather than a mock-shaped channelId that
  // channelById() can resolve; without this fallback a real video's card silently
  // dropped its channel line entirely (channelById(uuid) finds nothing to mock-lookup).
  // No verified flag ships on that shape yet, so the checkmark just doesn't render here.
  const realChannelName = (video as { channelName?: string }).channelName;
  const channel = channelById(video.channelId);
  const channelDisplayName = channel?.name ?? realChannelName;
  const access = accessLabel(video);
  // Guests are redirected to login instead of going directly to the video page.
  const link = href ?? (isGuest ? "/auth/login" : `/video/${video.id}`);
  const isRow = layout === "row";
  const geoLimited =
    video.rights.blockedCountries.length > 0 ||
    video.rights.permittedCountries.length > 0;

  const thumbnail = (
    <Poster
      src={video.thumbnailUrl}
      alt={video.title}
      gradient={video.posterGradient}
      seed={video.id}
      ratio={layout === "poster" ? "poster" : "video"}
      className={cn("rounded-lg", isRow && "w-40 shrink-0 sm:w-48")}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

      <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg">
          <IconPlayerPlayFilled className="size-5 translate-x-px" />
        </span>
      </span>

      <div className="absolute left-2 top-2 flex flex-wrap gap-1">
        {video.contentType === "live" ? <LiveBadge size="sm" /> : null}
        {video.pricing.sponsored ? (
          <Badge tone="outline" size="sm" className="bg-black/55 backdrop-blur-sm">
            Sponsored
          </Badge>
        ) : null}
        {showStatus && video.status !== "published" ? (
          <StatusBadge status={video.status} size="sm" />
        ) : null}
      </div>

      <div className="absolute right-2 top-2 flex gap-1">
        {geoLimited ? (
          <span
            title="Availability is limited by territory"
            className="flex size-6 items-center justify-center rounded bg-black/60 text-white/85 backdrop-blur-sm"
          >
            <IconWorldOff className="size-3.5" />
          </span>
        ) : null}
        {onToggleWatchlist ? (
          <button
            type="button"
            aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
            onClick={(event) => {
              event.preventDefault();
              onToggleWatchlist(video.id);
            }}
            className="flex size-6 items-center justify-center rounded bg-black/60 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
          >
            {inWatchlist ? (
              <IconBookmarkFilled className="size-3.5" />
            ) : (
              <IconBookmark className="size-3.5" />
            )}
          </button>
        ) : null}
      </div>

      <div className="absolute bottom-2 left-2 flex gap-1">
        {access ? (
          <Badge
            tone={access.tone === "accent" ? "accent" : "info"}
            size="sm"
            className="backdrop-blur-sm"
          >
            <IconLock className="size-2.5" />
            {access.label}
          </Badge>
        ) : null}
      </div>

      <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-2xs font-medium text-white nx-tnum backdrop-blur-sm">
        {formatDuration(video.durationSeconds)}
      </span>

      {progress != null && progress > 0 ? (
        <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
          <span
            className="block h-full bg-accent"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </span>
      ) : null}
    </Poster>
  );

  return (
    <article className={cn("group", isRow && "w-full", className)}>
      <Link href={link} className={cn("block", isRow && "flex gap-3")}>
        {thumbnail}
        {!minimal ? (
          <div className={cn(isRow ? "min-w-0 flex-1 pt-0.5" : "mt-2.5 flex gap-2.5")}>
            {showChannel && channelDisplayName && !isRow ? (
              <Avatar
                name={channelDisplayName}
                gradient={channel?.avatarGradient}
                src={channel?.avatarUrl}
                size="sm"
                className="mt-0.5"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <h3 className="nx-clamp-2 text-sm font-medium leading-snug text-fg transition-colors group-hover:text-accent">
                {video.title}
              </h3>
              {showChannel && channelDisplayName ? (
                <p className="mt-1 truncate text-xs text-fg-muted">
                  {channelDisplayName}
                  {channel?.verified ? (
                    <span className="ml-1 text-info" aria-label="Verified">
                      ✓
                    </span>
                  ) : null}
                </p>
              ) : null}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-subtle">
                <span className="inline-flex items-center gap-1 nx-tnum">
                  <IconEye className="size-3" />
                  {compactNumber(video.views)}
                </span>
                {video.ratingCount > 0 ? (
                  <span className="inline-flex items-center gap-1 nx-tnum">
                    <IconStarFilled className="size-3 text-warning" />
                    {video.ratingAverage.toFixed(1)}
                  </span>
                ) : null}
                {video.publishedAt ? (
                  <span>{relativeTime(video.publishedAt)}</span>
                ) : null}
              </p>
              {isRow ? (
                <p className="mt-1.5 nx-clamp-2 text-xs leading-relaxed text-fg-muted">
                  {video.synopsis}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Link>
    </article>
  );
}
