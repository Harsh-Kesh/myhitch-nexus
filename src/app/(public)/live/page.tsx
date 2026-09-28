"use client";

import { IconBroadcast, IconCalendarEvent, IconTicket } from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { Poster } from "@/components/video/poster";
import { channelById } from "@/lib/mock-api/data/channels";
import { useLiveEvents } from "@/lib/mock-api/hooks";
import type { LiveEvent } from "@/lib/mock-api/types";
import { compactNumber, formatCurrency, formatDateTime, relativeTime } from "@/lib/utils";

const ACCESS_LABELS: Record<LiveEvent["accessType"], string> = {
  public: "Open to everyone",
  private: "Private",
  ticketed: "Ticketed",
  "subscriber-only": "Subscribers only",
  "invitation-only": "Invitation only",
};

export default function LivePage() {
  const { data: events = [], isLoading } = useLiveEvents();
  const [tab, setTab] = React.useState("all");

  const live = events.filter((event) => event.status === "live");
  const upcoming = events.filter((event) => event.status === "upcoming");
  const past = events.filter(
    (event) => event.status === "ended" || event.status === "replay",
  );

  const shown =
    tab === "live" ? live : tab === "upcoming" ? upcoming : tab === "past" ? past : events;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-fg sm:text-3xl">
            Live events
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg-muted">
            Council meetings, keynotes, sessions, premieres and open days —
            streamed live, then archived as replays.
          </p>
        </div>
        <Button variant="primary" href="/studio/live">
          <IconBroadcast />
          Schedule a stream
        </Button>
      </div>

      {live.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-fg">
            <span className="size-2 rounded-full bg-live animate-live-pulse" />
            On air now
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {live.map((event) => (
              <FeaturedLiveCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      ) : null}

      <Tabs
        className="mt-8"
        value={tab}
        onChange={setTab}
        items={[
          { value: "all", label: "All", count: events.length },
          { value: "live", label: "Live now", count: live.length },
          { value: "upcoming", label: "Upcoming", count: upcoming.length },
          { value: "past", label: "Past & replays", count: past.length },
        ]}
      />

      <div className="mt-5">
        {isLoading ? (
          <RailSkeleton count={6} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<IconCalendarEvent />}
            title="Nothing scheduled here"
            description="When channels you follow schedule a stream, it shows up in this tab."
            action={{ label: "Browse channels", href: "/explore" }}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((event) => (
              <LiveCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FeaturedLiveCard({ event }: { event: LiveEvent }) {
  const mockChannel = channelById(event.channelId);
  const channelName = event.channelName ?? mockChannel?.name;
  const channelAvatarGradient = event.channelAvatarGradient ?? mockChannel?.avatarGradient;
  const channelAvatarUrl = event.channelAvatarUrl ?? mockChannel?.avatarUrl;
  const channelVerified = event.channelVerified ?? mockChannel?.verified;
  return (
    <Link href={`/live/${event.id}`} className="group">
      <Card interactive className="overflow-hidden">
        <Poster
          src={event.thumbnailUrl}
          alt={event.title}
          gradient={event.posterGradient}
          seed={event.id}
          ratio="video"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
          <div className="absolute left-3 top-3 flex gap-2">
            <LiveBadge />
            {event.accessType !== "public" ? (
              <Badge tone="accent" size="md">
                {ACCESS_LABELS[event.accessType]}
              </Badge>
            ) : null}
          </div>
          <div className="absolute inset-x-3 bottom-3">
            <p className="nx-clamp-2 font-display text-base font-semibold text-white sm:text-lg">
              {event.title}
            </p>
            <p className="mt-1 flex items-center gap-2 text-xs text-white/75 nx-tnum">
              <span>{compactNumber(event.viewerCount)} watching</span>
              <span>·</span>
              <span>started {relativeTime(event.actualStart ?? event.scheduledStart)}</span>
            </p>
          </div>
        </Poster>
        <CardBody className="flex items-center gap-3 py-3">
          {channelName ? (
            <>
              <Avatar
                name={channelName}
                gradient={channelAvatarGradient}
                src={channelAvatarUrl}
                size="sm"
                verified={channelVerified}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-fg">
                {channelName}
              </span>
            </>
          ) : null}
          <Button variant="live" size="sm">
            Watch
          </Button>
        </CardBody>
      </Card>
    </Link>
  );
}

function LiveCard({ event }: { event: LiveEvent }) {
  const channelName = event.channelName ?? channelById(event.channelId)?.name;
  return (
    <Link href={`/live/${event.id}`} className="group">
      <Card interactive className="h-full overflow-hidden">
        <Poster
          src={event.thumbnailUrl}
          alt={event.title}
          gradient={event.posterGradient}
          seed={event.id}
          ratio="video"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute left-2 top-2">
            {event.status === "live" ? (
              <LiveBadge size="sm" />
            ) : (
              <Badge
                tone={
                  event.status === "upcoming"
                    ? "scheduled"
                    : event.status === "cancelled"
                      ? "rejected"
                      : event.replayPublished
                        ? "published"
                        : "archived"
                }
                size="sm"
              >
                {event.status === "upcoming"
                  ? "Scheduled"
                  : event.status === "cancelled"
                    ? "Cancelled"
                    : event.replayPublished
                      ? "Replay"
                      : "Ended"}
              </Badge>
            )}
          </div>
          {event.price ? (
            <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-2xs text-white nx-tnum">
              <IconTicket className="size-3" />
              {formatCurrency(event.price.amount, event.price.currency)}
            </span>
          ) : null}
        </Poster>
        <CardBody className="p-3.5">
          <p className="nx-clamp-2 text-sm font-medium text-fg">{event.title}</p>
          <p className="mt-1 truncate text-xs text-fg-muted">{channelName}</p>
          <p className="mt-1.5 text-2xs text-fg-subtle nx-tnum">
            {event.status === "live"
              ? `${compactNumber(event.viewerCount)} watching`
              : formatDateTime(event.scheduledStart)}
          </p>
          <p className="mt-1 text-2xs text-fg-subtle">
            {ACCESS_LABELS[event.accessType]}
          </p>
        </CardBody>
      </Card>
    </Link>
  );
}
