"use client";

import {
  IconBan,
  IconChartBar,
  IconEyeOff,
  IconMessage,
  IconSend,
  IconShieldCheck,
  IconTicket,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { VideoPlayer } from "@/components/player/video-player";
import { Avatar } from "@/components/ui/avatar";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Switch } from "@/components/ui/field";
import { ProgressBar } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Poster } from "@/components/video/poster";
import { channelById } from "@/lib/mock-api/data/channels";
import { videos } from "@/lib/mock-api/data/videos";
import {
  useChatMessages,
  useCurrentUser,
  useLiveEvent,
  useModerateChatMessage,
  usePolls,
  useSendChatMessage,
  useToggleFollow,
  useVotePoll,
} from "@/lib/mock-api/hooks";
import type { ChatMessage, Entitlement, LiveEvent } from "@/lib/mock-api/types";
import {
  cn,
  compactNumber,
  formatCurrency,
  formatDateTime,
  relativeTime,
  sum,
} from "@/lib/utils";

export function LiveViewerClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { toast } = useToast();

  const { data: event, isLoading } = useLiveEvent(id);
  const { data: currentUser, isLoading: isCurrentUserLoading } = useCurrentUser();
  const router = useRouter();
  const { data: messages = [] } = useChatMessages(id);
  const { data: polls = [] } = usePolls(id);
  const sendMessage = useSendChatMessage(id);
  const moderateMessage = useModerateChatMessage(id);
  const votePoll = useVotePoll(id);
  const toggleFollow = useToggleFollow();

  // Only redirect guests to the login page if the stream is not public.
  // Public streams can be freely watched by everyone!
  React.useEffect(() => {
    if (!isCurrentUserLoading && currentUser === null && event) {
      if (event.accessType !== "public") {
        router.replace(`/auth/login?callbackUrl=/live/${id}`);
      }
    }
  }, [isCurrentUserLoading, currentUser, event, router, id]);

  const [draft, setDraft] = React.useState("");
  const [tab, setTab] = React.useState("chat");
  const [moderatorMode, setModeratorMode] = React.useState(false);
  const [slowMode, setSlowMode] = React.useState(false);
  const [ticketPurchased, setTicketPurchased] = React.useState(false);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="nx-skeleton aspect-video w-full rounded-lg" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="px-4 py-16 sm:px-6 lg:px-8">
        <EmptyState
          title="Stream not found"
          description="This event may have been cancelled or removed."
          action={{ label: "All live events", href: "/live" }}
        />
      </div>
    );
  }

  const channel = channelById(event.channelId);
  const isCoHost = Boolean(
    currentUser &&
      (currentUser.email === "editor@nexus.com" ||
        currentUser.channelId === event.channelId ||
        currentUser.name?.toLowerCase().includes("mara"))
  );
  const needsTicket = event.accessType === "ticketed" && !ticketPurchased && !isCoHost;
  const visibleMessages = moderatorMode || isCoHost
    ? messages
    : messages.filter((message) => message.status === "visible");

  return (
    <div className="mx-auto max-w-[110rem] px-0 pb-10 sm:px-6 lg:px-8">
      {isCoHost ? (
        <div className="mb-3 rounded-lg border border-accent/30 bg-accent/10 p-3 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Badge tone="accent" size="sm">Co-Host Access Active</Badge>
            <span className="font-medium text-fg">You are connected as an authorized stream co-host. Lock screens bypassed & chat moderation enabled.</span>
          </div>
        </div>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0">
          {needsTicket ? (
            <TicketGate event={event} onPurchase={() => setTicketPurchased(true)} />
          ) : event.status === "live" ? (
            <VideoPlayer
              video={syntheticLiveVideo(event)}
              entitlement={liveEntitlement(event.id)}
              live
              className="sm:rounded-lg"
            />
          ) : (
            <ScheduledSurface event={event} />
          )}

          <div className="px-4 sm:px-0">
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {event.status === "live" ? <LiveBadge /> : null}
              <Badge tone="outline" size="sm">
                {event.accessType.replace("-", " ")}
              </Badge>
              {event.price ? (
                <Badge tone="accent" size="sm">
                  <IconTicket />
                  {formatCurrency(event.price.amount, event.price.currency)}
                </Badge>
              ) : null}
              <Badge tone="neutral" size="sm">
                {event.timezone}
              </Badge>
            </div>

            <h1 className="mt-2.5 font-display text-2xl font-semibold text-fg sm:text-3xl">
              {event.title}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
              {event.status === "live" ? (
                <span className="inline-flex items-center gap-1.5 nx-tnum">
                  <IconUsers className="size-4" />
                  {compactNumber(event.viewerCount)} watching
                </span>
              ) : (
                <span className="nx-tnum">{formatDateTime(event.scheduledStart)}</span>
              )}
              {event.peakViewers > 0 ? (
                <span className="nx-tnum">
                  Peak {compactNumber(event.peakViewers)}
                </span>
              ) : null}
            </div>

            {channel ? (
              <Card className="mt-4">
                <CardBody className="flex flex-wrap items-center gap-4">
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
                        {compactNumber(channel.followers)} followers
                      </span>
                    </span>
                  </Link>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => toggleFollow.mutate(channel.id)}
                  >
                    Follow
                  </Button>
                  {event.replayPublished && event.replayVideoId ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      href={`/video/${event.replayVideoId}`}
                      className="ml-auto"
                    >
                      Watch the replay
                    </Button>
                  ) : null}
                </CardBody>
              </Card>
            ) : null}

            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-fg-muted">
              {event.description}
            </p>
          </div>
        </div>

        {/* Chat / polls side panel */}
        <aside className="min-w-0 px-4 sm:px-0">
          <Card className="flex h-[36rem] flex-col lg:h-[calc(100dvh-8rem)] lg:max-h-[46rem]">
            <div className="border-b border-border px-2 pt-1">
              <Tabs
                value={tab}
                onChange={setTab}
                variant="underline"
                items={[
                  { value: "chat", label: "Chat", icon: <IconMessage />, count: visibleMessages.length },
                  { value: "polls", label: "Polls", icon: <IconChartBar />, count: polls.length },
                  { value: "mod", label: "Moderation", icon: <IconShieldCheck /> },
                ]}
              />
            </div>

            {tab === "chat" ? (
              <>
                <div className="nx-scrollbar flex-1 space-y-3 overflow-y-auto p-3">
                  {!event.chatEnabled ? (
                    <EmptyState
                      compact
                      icon={<IconEyeOff />}
                      title="Chat is off"
                      description="The host disabled chat for this stream."
                    />
                  ) : visibleMessages.length === 0 ? (
                    <EmptyState compact title="No messages yet" />
                  ) : (
                    visibleMessages.map((message) => (
                      <ChatRow
                        key={message.id}
                        message={message}
                        moderatorMode={moderatorMode}
                        onModerate={(action) =>
                          moderateMessage.mutate({ messageId: message.id, action })
                        }
                      />
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                {!currentUser ? (
                  <div className="border-t border-border p-3 text-center">
                    <p className="mb-2 text-xs text-fg-muted">Sign in to participate in live chat</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => router.push(`/auth/login?callbackUrl=/live/${id}`)}
                    >
                      Sign In to Chat
                    </Button>
                  </div>
                ) : (
                  <form
                    className="flex items-center gap-2 border-t border-border p-2.5"
                    onSubmit={async (formEvent) => {
                      formEvent.preventDefault();
                      if (!draft.trim()) return;
                      await sendMessage.mutateAsync(draft.trim());
                      setDraft("");
                    }}
                  >
                    <Input
                      value={draft}
                      onChange={(inputEvent) => setDraft(inputEvent.target.value)}
                      placeholder={
                        event.chatEnabled
                          ? slowMode
                            ? "Slow mode: 1 message / 30s"
                            : "Say something…"
                          : "Chat is disabled"
                      }
                      disabled={!event.chatEnabled}
                      sizeVariant="sm"
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      size="icon-sm"
                      aria-label="Send message"
                      disabled={!draft.trim() || !event.chatEnabled}
                    >
                      <IconSend />
                    </Button>
                  </form>
                )}
              </>
            ) : null}

            {tab === "polls" ? (
              <div className="nx-scrollbar flex-1 space-y-4 overflow-y-auto p-3">
                {polls.length === 0 ? (
                  <EmptyState compact title="No polls" description="The host has not run a poll yet." />
                ) : (
                  polls.map((poll) => {
                    const total = sum(poll.options.map((option) => option.votes)) || 1;
                    return (
                      <div key={poll.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-fg">{poll.question}</p>
                          <Badge
                            tone={poll.status === "open" ? "published" : "archived"}
                            size="sm"
                          >
                            {poll.status}
                          </Badge>
                        </div>
                        <div className="mt-3 space-y-2">
                          {poll.options.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              disabled={poll.status !== "open"}
                              onClick={() => {
                                if (!currentUser) {
                                  toast({
                                    title: "Sign in required",
                                    description: "Sign in to vote on live stream polls.",
                                    tone: "warning",
                                  });
                                  return;
                                }
                                votePoll.mutate({ pollId: poll.id, optionId: option.id });
                              }}
                              className="block w-full text-left disabled:cursor-not-allowed"
                            >
                              <ProgressBar
                                value={(option.votes / total) * 100}
                                size="sm"
                                label={option.label}
                                valueLabel={`${Math.round((option.votes / total) * 100)}% · ${compactNumber(option.votes)}`}
                              />
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-2xs text-fg-subtle nx-tnum">
                          {compactNumber(total)} votes
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}

            {tab === "mod" ? (
              <div className="nx-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
                <p className="text-xs leading-relaxed text-fg-muted">
                  Moderation controls available to hosts and channel moderators.
                  Actions here affect the chat panel immediately.
                </p>
                <Switch
                  checked={moderatorMode}
                  onCheckedChange={setModeratorMode}
                  label="Show held & removed messages"
                  description="Reveals everything the filters caught so you can review it."
                />
                <Switch
                  checked={slowMode}
                  onCheckedChange={(value) => {
                    setSlowMode(value);
                    toast({
                      title: value ? "Slow mode on" : "Slow mode off",
                      description: value ? "One message per viewer every 30 seconds." : undefined,
                      tone: "info",
                    });
                  }}
                  label="Slow mode"
                  description="Limits each viewer to one message every 30 seconds."
                />
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                    Filter summary
                  </p>
                  <dl className="mt-2 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-fg-muted">Held</dt>
                      <dd className="text-fg nx-tnum">
                        {messages.filter((m) => m.status === "held").length}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-fg-muted">Removed</dt>
                      <dd className="text-fg nx-tnum">
                        {messages.filter((m) => m.status === "removed").length}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-fg-muted">Visible</dt>
                      <dd className="text-fg nx-tnum">
                        {messages.filter((m) => m.status === "visible").length}
                      </dd>
                    </div>
                  </dl>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  block
                  onClick={() =>
                    toast({
                      title: "Incident reported to platform moderation",
                      description: "A live-incident item has been raised for the admin queue.",
                      tone: "warning",
                    })
                  }
                >
                  <IconBan />
                  Report a live incident
                </Button>
              </div>
            ) : null}
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------ Sub-views -------------------------------- */

function ChatRow({
  message,
  moderatorMode,
  onModerate,
}: {
  message: ChatMessage;
  moderatorMode: boolean;
  onModerate: (action: "hold" | "remove" | "restore") => void;
}) {
  const roleTone =
    message.role === "host"
      ? "accent"
      : message.role === "moderator"
        ? "info"
        : message.role === "subscriber"
          ? "success"
          : "neutral";

  return (
    <div
      className={cn(
        "group flex gap-2.5",
        message.status !== "visible" && "opacity-60",
      )}
    >
      <Avatar name={message.authorName} gradient={message.authorGradient} size="xs" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-fg">{message.authorName}</span>
          {message.role !== "viewer" ? (
            <Badge tone={roleTone as "accent"} size="sm">
              {message.role}
            </Badge>
          ) : null}
          {message.status !== "visible" ? (
            <Badge tone={message.status === "held" ? "warning" : "danger"} size="sm">
              {message.status}
            </Badge>
          ) : null}
          <span className="text-2xs text-fg-subtle">
            {relativeTime(message.sentAt)}
          </span>
        </div>
        <p className="mt-0.5 break-words text-sm leading-snug text-fg-muted">
          {message.body}
        </p>
        {moderatorMode ? (
          <div className="mt-1 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            {message.status !== "visible" ? (
              <button
                type="button"
                onClick={() => onModerate("restore")}
                className="text-2xs font-medium text-success hover:underline"
              >
                Restore
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onModerate("hold")}
                className="text-2xs font-medium text-warning hover:underline"
              >
                Hold
              </button>
            )}
            <button
              type="button"
              onClick={() => onModerate("remove")}
              className="text-2xs font-medium text-danger hover:underline"
            >
              Remove
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TicketGate({
  event,
  onPurchase,
}: {
  event: LiveEvent;
  onPurchase: () => void;
}) {
  const { toast } = useToast();
  return (
    <div
      data-surface="cinema"
      className="relative aspect-video w-full overflow-hidden bg-black sm:rounded-lg"
    >
      <Poster
        src={event.thumbnailUrl}
        alt={event.title}
        gradient={event.posterGradient}
        seed={event.id}
        ratio="none"
        className="absolute inset-0 size-full opacity-45"
      />
      <div className="absolute inset-0 nx-scrim" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <IconTicket className="size-6" />
        </span>
        <div>
          <p className="font-display text-lg font-semibold text-fg sm:text-xl">
            This is a ticketed event
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-fg-muted">
            Ticket holders can watch live and keep 72-hour replay access
            afterwards. Issued via <strong className="font-semibold text-fg">MYHitch Pass</strong>.
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            onPurchase();
            toast({
              title: "MYHitch Pass Ticket Issued",
              description:
                "Your event pass is confirmed via MYHitch Pass and saved to your Account Purchases.",
            });
          }}
        >
          Buy a ticket{" "}
          {event.price
            ? formatCurrency(event.price.amount, event.price.currency)
            : ""}
        </Button>
      </div>
    </div>
  );
}

function ScheduledSurface({ event }: { event: LiveEvent }) {
  const started = new Date(event.scheduledStart).getTime();
  const [remaining, setRemaining] = React.useState(started - Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setRemaining(started - Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [started]);

  const ended = event.status === "ended" || event.status === "replay";
  const cancelled = event.status === "cancelled";

  const days = Math.max(0, Math.floor(remaining / 86_400_000));
  const hours = Math.max(0, Math.floor((remaining % 86_400_000) / 3_600_000));
  const minutes = Math.max(0, Math.floor((remaining % 3_600_000) / 60_000));
  const seconds = Math.max(0, Math.floor((remaining % 60_000) / 1_000));

  return (
    <div
      data-surface="cinema"
      className="relative aspect-video w-full overflow-hidden bg-black sm:rounded-lg"
    >
      <Poster
        src={event.thumbnailUrl}
        alt={event.title}
        gradient={event.posterGradient}
        seed={event.id}
        ratio="none"
        className="absolute inset-0 size-full opacity-40"
      />
      <div className="absolute inset-0 nx-scrim" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
        {cancelled ? (
          <>
            <Badge tone="rejected">Cancelled</Badge>
            <p className="font-display text-lg font-semibold text-fg">
              This stream was cancelled
            </p>
            <p className="max-w-md text-sm text-fg-muted">{event.description}</p>
          </>
        ) : ended ? (
          <>
            <Badge tone={event.replayPublished ? "published" : "archived"}>
              {event.replayPublished ? "Replay available" : "Stream ended"}
            </Badge>
            <p className="font-display text-lg font-semibold text-fg">
              {event.replayPublished
                ? "The replay is published"
                : "The host has not published a replay yet"}
            </p>
            {event.replayPublished && event.replayVideoId ? (
              <Button variant="primary" href={`/video/${event.replayVideoId}`}>
                Watch the replay
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Badge tone="scheduled">Starts {formatDateTime(event.scheduledStart)}</Badge>
            <div className="flex gap-3 sm:gap-5">
              {[
                { value: days, label: "days" },
                { value: hours, label: "hours" },
                { value: minutes, label: "mins" },
                { value: seconds, label: "secs" },
              ].map((unit) => (
                <div key={unit.label} className="min-w-[3.5rem]">
                  <p className="font-display text-2xl font-semibold text-fg nx-tnum sm:text-3xl">
                    {String(unit.value).padStart(2, "0")}
                  </p>
                  <p className="text-2xs uppercase tracking-wide text-fg-subtle">
                    {unit.label}
                  </p>
                </div>
              ))}
            </div>
            <Button variant="secondary">Remind me</Button>
          </>
        )}
      </div>
    </div>
  );
}

/* --------------------------- Live playback shim --------------------------- */

function syntheticLiveVideo(event: LiveEvent) {
  const template = videos[0];
  return {
    ...template,
    id: event.id,
    slug: event.id,
    title: event.title,
    synopsis: event.description,
    channelId: event.channelId,
    contentType: "live" as const,
    categoryIds: event.categoryIds,
    status: "published" as const,
    posterGradient: event.posterGradient,
    durationSeconds: 7_200,
    pricing: { accessModels: ["free" as const] },
    watermarkEnabled: false,
    sampleSrc: "/media/sample-1.mp4",
  };
}

function liveEntitlement(videoId: string): Entitlement {
  return {
    videoId,
    userId: "usr_viewer",
    granted: true,
    reason: "free",
    requestCountry: "GB",
  };
}
