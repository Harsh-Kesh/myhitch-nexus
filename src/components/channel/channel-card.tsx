"use client";

import { IconDeviceTv, IconUsers } from "@tabler/icons-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Poster } from "@/components/video/poster";
import { CHANNEL_KIND_LABELS } from "@/lib/mock-api/data/channels";
import type { Channel } from "@/lib/mock-api/types";
import { compactNumber, cn } from "@/lib/utils";

export function ChannelCard({ channel, className }: { channel: Channel; className?: string }) {
  return (
    <article className={cn("group", className)}>
      <Link
        href={`/channel/${channel.id}`}
        className="block overflow-hidden rounded-lg border border-border bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-sm"
      >
        <Poster
          src={channel.bannerUrl}
          alt={channel.name}
          gradient={channel.bannerGradient}
          seed={`${channel.id}-banner`}
          ratio="none"
          className="h-16 w-full"
        />
        <div className="px-3 pb-3">
          <Avatar
            name={channel.name}
            gradient={channel.avatarGradient}
            src={channel.avatarUrl}
            verified={channel.verified}
            size="lg"
            className="-mt-6 ring-4 ring-surface"
          />
          <h3 className="nx-clamp-1 mt-2 text-sm font-semibold text-fg transition-colors group-hover:text-accent">
            {channel.name}
          </h3>
          <p className="nx-clamp-2 mt-0.5 text-xs leading-snug text-fg-muted">
            {channel.tagline}
          </p>
          <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2">
            <Badge tone="outline" size="sm">
              {CHANNEL_KIND_LABELS[channel.kind]}
            </Badge>
            <div className="flex items-center gap-2.5 text-3xs text-fg-subtle">
              <span className="inline-flex items-center gap-1 nx-tnum">
                <IconUsers className="size-3" />
                {compactNumber(channel.followers)}
              </span>
              <span className="inline-flex items-center gap-1 nx-tnum">
                <IconDeviceTv className="size-3" />
                {compactNumber(channel.videoCount)}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
