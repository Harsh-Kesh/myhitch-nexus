"use client";

import {
  IconBroadcast,
  IconCalendar,
  IconMail,
  IconMapPin,
  IconPlaylist,
  IconWorld,
} from "@tabler/icons-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Poster } from "@/components/video/poster";
import { VideoGrid } from "@/components/video/rail";
import { CHANNEL_KIND_LABELS } from "@/lib/mock-api/data/channels";
import {
  useChannel,
  useChannelLiveEvents,
  useChannelVideos,
  useIsFollowing,
  usePlaylists,
  useToggleFollow,
} from "@/lib/mock-api/hooks";
import {
  compactNumber,
  formatDate,
  formatDateTime,
  formatNumber,
} from "@/lib/utils";

export function ChannelClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const { data: channel, isLoading } = useChannel(id);
  const { data: videos = [] } = useChannelVideos(channel?.id ?? "");
  const { data: playlists = [] } = usePlaylists(channel?.id ?? "");
  const { data: liveEvents = [] } = useChannelLiveEvents(channel?.id ?? "");
  const { data: following } = useIsFollowing(channel?.id ?? "");
  const toggleFollow = useToggleFollow();
  const { toast } = useToast();

  const [tab, setTab] = React.useState("videos");

  const handleToggleFollow = () => {
    if (!channel) return;
    const wasFollowing = following;
    toggleFollow.mutate(channel.id, {
      onSuccess: () => {
        toast({ title: wasFollowing ? `Unfollowed ${channel.name}` : `Following ${channel.name}` });
      },
      onError: (error) => {
        toast({
          title: "Couldn't update follow status",
          description: error instanceof Error ? error.message : undefined,
          tone: "error",
        });
      },
    });
  };

  if (isLoading) {
    return (
      <div>
        <div className="nx-skeleton h-40 w-full sm:h-56" />
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <RailSkeleton count={8} />
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="px-4 py-16 sm:px-6 lg:px-8">
        <EmptyState
          title="Channel not found"
          description="This channel may have been removed or renamed."
          action={{ label: "Browse channels", href: "/explore" }}
        />
      </div>
    );
  }

  const liveNow = liveEvents.find((event) => event.status === "live");
  const upcoming = liveEvents.filter((event) => event.status === "upcoming");

  return (
    <div>
      {/* Banner */}
      <div className="relative">
        <Poster
          src={channel.bannerUrl}
          alt={channel.name}
          gradient={channel.bannerGradient}
          seed={`${channel.id}-banner`}
          ratio="none"
          className="h-36 w-full sm:h-48 lg:h-60"
        />
        <div className="absolute inset-0 nx-scrim" />
      </div>

      <div className="px-4 sm:px-6 lg:px-8">
        {/* The negative margin used to sit on this whole row, pulling the name/tagline/
            follow-button text up into the banner along with the avatar instead of just
            the avatar — the one element actually meant to overlap the banner's bottom
            edge. Scoped to the avatar alone so the text always stays clear of the
            banner regardless of avatar/banner size. */}
        <div className="flex flex-wrap items-end gap-4">
          <Avatar
            name={channel.name}
            gradient={channel.avatarGradient}
            src={channel.avatarUrl}
            size="2xl"
            verified={channel.verified}
            square
            className="-mt-10 ring-4 ring-bg sm:-mt-12"
          />
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold text-fg sm:text-3xl">
                {channel.name}
              </h1>
              <Badge tone="accent" size="sm">
                {CHANNEL_KIND_LABELS[channel.kind]}
              </Badge>
              {channel.verificationStatus === "pending" ? (
                <Badge tone="pending" size="sm">
                  Verification pending
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-fg-muted">{channel.tagline}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle nx-tnum">
              <span>@{channel.handle}</span>
              <span>{compactNumber(channel.followers)} followers</span>
              <span>{formatNumber(channel.videoCount)} videos</span>
              <span>{compactNumber(channel.totalViews)} total views</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            <Button variant={following ? "secondary" : "primary"} onClick={handleToggleFollow}>
              {following ? "Following" : "Follow"}
            </Button>
            {liveNow ? (
              <Button variant="live" href={`/live/${liveNow.id}`}>
                <IconBroadcast />
                Watch live
              </Button>
            ) : null}
          </div>
        </div>

        {liveNow ? (
          <Link href={`/live/${liveNow.id}`} className="mt-5 block">
            <Card interactive className="flex flex-wrap items-center gap-4 p-4">
              <LiveBadge />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{liveNow.title}</p>
                <p className="text-xs text-fg-muted nx-tnum">
                  {compactNumber(liveNow.viewerCount)} watching now
                </p>
              </div>
              <Button variant="secondary" size="sm">
                Join
              </Button>
            </Card>
          </Link>
        ) : null}

        <Tabs
          className="mt-6"
          value={tab}
          onChange={setTab}
          items={[
            { value: "videos", label: "Videos", count: videos.length },
            { value: "playlists", label: "Playlists", count: playlists.length },
            { value: "live", label: "Live", count: liveEvents.length },
            { value: "about", label: "About" },
          ]}
        />

        <div className="py-6">
          {tab === "videos" ? (
            videos.length ? (
              <VideoGrid videos={videos} />
            ) : (
              <EmptyState
                title="No published videos yet"
                description="When this channel publishes, its content will appear here."
              />
            )
          ) : null}

          {tab === "playlists" ? (
            playlists.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {playlists
                  .filter((playlist) => playlist.visibility === "public")
                  .map((playlist) => (
                    <Card key={playlist.id} interactive className="overflow-hidden">
                      <Poster
                        src={playlist.thumbnailUrl}
                        alt={playlist.title}
                        gradient={playlist.posterGradient}
                        seed={playlist.id}
                        ratio="video"
                      >
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                        <span className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded bg-black/70 px-2 py-1 text-2xs text-white nx-tnum">
                          <IconPlaylist className="size-3" />
                          {playlist.videoIds.length} videos
                        </span>
                      </Poster>
                      <CardBody className="p-3.5">
                        <p className="truncate text-sm font-medium text-fg">
                          {playlist.title}
                        </p>
                        <p className="mt-1 nx-clamp-2 text-xs leading-relaxed text-fg-muted">
                          {playlist.description}
                        </p>
                        <p className="mt-2 text-2xs text-fg-subtle">
                          Updated {formatDate(playlist.updatedAt)}
                        </p>
                      </CardBody>
                    </Card>
                  ))}
              </div>
            ) : (
              <EmptyState title="No public playlists" />
            )
          ) : null}

          {tab === "live" ? (
            liveEvents.length ? (
              <ul className="space-y-3">
                {liveEvents.map((event) => (
                  <li key={event.id}>
                    <Link href={`/live/${event.id}`}>
                      <Card interactive className="flex flex-wrap items-center gap-4 p-3.5">
                        <Poster
                          src={event.thumbnailUrl}
                          alt={event.title}
                          gradient={event.posterGradient}
                          seed={event.id}
                          ratio="video"
                          className="w-32 shrink-0 rounded sm:w-44"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {event.status === "live" ? (
                              <LiveBadge size="sm" />
                            ) : (
                              <Badge
                                tone={
                                  event.status === "upcoming"
                                    ? "scheduled"
                                    : event.status === "cancelled"
                                      ? "rejected"
                                      : "archived"
                                }
                                size="sm"
                              >
                                {event.status === "upcoming"
                                  ? "Scheduled"
                                  : event.status === "replay"
                                    ? "Replay available"
                                    : event.status === "cancelled"
                                      ? "Cancelled"
                                      : "Ended"}
                              </Badge>
                            )}
                            {event.accessType !== "public" ? (
                              <Badge tone="outline" size="sm">
                                {event.accessType.replace("-", " ")}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1.5 text-sm font-medium text-fg">
                            {event.title}
                          </p>
                          <p className="mt-0.5 nx-clamp-2 text-xs leading-relaxed text-fg-muted">
                            {event.description}
                          </p>
                          <p className="mt-1.5 text-2xs text-fg-subtle nx-tnum">
                            {formatDateTime(event.scheduledStart)} · {event.timezone}
                          </p>
                        </div>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No live events" />
            )
          ) : null}

          {tab === "about" ? (
            <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
              <Card>
                <CardBody>
                  <h2 className="text-sm font-semibold text-fg">About</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-fg-muted">
                    {channel.about}
                  </p>
                </CardBody>
              </Card>
              <Card>
                <CardBody className="space-y-3">
                  <Detail icon={<IconMapPin />} label="Country" value={channel.country} />
                  <Detail
                    icon={<IconWorld />}
                    label="Languages"
                    value={channel.languages.join(", ")}
                  />
                  <Detail
                    icon={<IconCalendar />}
                    label="On Nexus since"
                    value={formatDate(channel.joinedAt, "long")}
                  />
                  <Detail
                    icon={<IconMail />}
                    label="Business enquiries"
                    value={channel.contactEmail}
                  />
                  {channel.links.length ? (
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                        Links
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {channel.links.map((link) => (
                          <li key={link.label}>
                            <span className="text-sm text-accent">{link.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            </div>
          ) : null}
        </div>

        {upcoming.length > 0 && tab === "videos" ? (
          <div className="pb-8">
            <h2 className="mb-3 font-display text-lg font-semibold text-fg">
              Upcoming live
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((event) => (
                <Link key={event.id} href={`/live/${event.id}`}>
                  <Card interactive className="p-3.5">
                    <Badge tone="scheduled" size="sm">
                      {formatDateTime(event.scheduledStart)}
                    </Badge>
                    <p className="mt-2 text-sm font-medium text-fg">{event.title}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-fg-subtle [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <p className="text-2xs uppercase tracking-wide text-fg-subtle">{label}</p>
        <p className="truncate text-sm text-fg">{value}</p>
      </div>
    </div>
  );
}
