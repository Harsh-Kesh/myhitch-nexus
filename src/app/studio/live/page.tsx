"use client";

import {
  IconBroadcast,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconPlayerStop,
  IconRefresh,
  IconVideoPlus,
} from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, RadioCard, Select, Switch, Textarea } from "@/components/ui/field";
import { MultiSelect } from "@/components/ui/multi-select";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { categories } from "@/lib/mock-api/data/categories";
import {
  useChannelLiveEvents,
  useCreateLiveEvent,
  useCurrentUser,
  useEndLiveEvent,
  usePublishReplay,
  useRegenerateStreamKey,
  useStartLiveEvent,
} from "@/lib/mock-api/hooks";
import type { LiveAccessType, LiveEvent } from "@/lib/mock-api/types";
import { compactNumber, formatCurrency, formatDateTime } from "@/lib/utils";

const ACCESS_TYPES: Array<{
  value: LiveAccessType;
  title: string;
  description: string;
}> = [
  { value: "public", title: "Public", description: "Anyone on Nexus can watch." },
  { value: "private", title: "Private", description: "Only you and named collaborators." },
  { value: "ticketed", title: "Ticketed (MYHitch Pass)", description: "Viewers buy an event ticket issued via MYHitch Pass." },
  { value: "subscriber-only", title: "Subscribers only", description: "Your channel members only." },
  { value: "invitation-only", title: "Invitation only", description: "Access by invite link." },
];

const TIMEZONES = [
  "Europe/London",
  "Europe/Berlin",
  "Europe/Lisbon",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Colombo",
  "Asia/Singapore",
  "Australia/Sydney",
];

export default function StudioLivePage() {
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId ?? "ch_mara";
  const { data: events = [] } = useChannelLiveEvents(channelId);
  const createEvent = useCreateLiveEvent();
  const startEvent = useStartLiveEvent();
  const regenerateKey = useRegenerateStreamKey();
  const publishReplay = usePublishReplay();
  const endEvent = useEndLiveEvent();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [isInstantLive, setIsInstantLive] = React.useState(false);
  const [tab, setTab] = React.useState("all");
  const [revealKey, setRevealKey] = React.useState<string | null>(null);

  // Create form
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [accessType, setAccessType] = React.useState<LiveAccessType>("public");
  const [collaborators, setCollaborators] = React.useState<string[]>(["@mara_silva", "editor@nexus.com"]);
  const [collabDraft, setCollabDraft] = React.useState("");
  const [scheduledStart, setScheduledStart] = React.useState("2026-08-20T18:00");
  const [timezone, setTimezone] = React.useState("Europe/London");
  const [price, setPrice] = React.useState("12.00");
  const [categoryIds, setCategoryIds] = React.useState<string[]>([]);
  const [chatEnabled, setChatEnabled] = React.useState(true);

  const filtered =
    tab === "all" ? events : events.filter((event) => event.status === tab);

  const submit = async () => {
    const isNow = isInstantLive;
    await createEvent.mutateAsync({
      channelId,
      title: title.trim() || (isNow ? "Live Broadcast" : "Untitled stream"),
      description,
      status: isNow ? "live" : "upcoming",
      accessType,
      scheduledStart: isNow ? new Date().toISOString() : new Date(scheduledStart).toISOString(),
      timezone,
      posterGradient: ["#2E5B4A", "#0A1712"],
      price:
        accessType === "ticketed"
          ? { amount: Math.round(Number(price) * 100), currency: "GBP" }
          : undefined,
      chatEnabled,
      categoryIds,
    });
    setCreateOpen(false);
    setTitle("");
    setDescription("");
    toast({
      title: isNow ? "Broadcast started!" : "Stream scheduled",
      description: isNow
        ? "Your live stream is on air. Viewers can join now!"
        : "Your stream key is ready in the event card.",
    });
  };

  return (
    <>
      <PageHeader
        title="Live"
        description="Go live instantly, schedule upcoming broadcasts, manage viewer access rules, and publish replays."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                setIsInstantLive(true);
                setCreateOpen(true);
              }}
            >
              <IconBroadcast />
              Go live now
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setIsInstantLive(false);
                setCreateOpen(true);
              }}
            >
              <IconVideoPlus />
              Schedule a stream
            </Button>
          </div>
        }
      />

      <PageBody className="space-y-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "all", label: "All", count: events.length },
            {
              value: "live",
              label: "Live now",
              count: events.filter((e) => e.status === "live").length,
            },
            {
              value: "upcoming",
              label: "Upcoming",
              count: events.filter((e) => e.status === "upcoming").length,
            },
            {
              value: "ended",
              label: "Ended",
              count: events.filter((e) => e.status === "ended").length,
            },
          ]}
        />

        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconBroadcast />}
            title="No streams here"
            description="Schedule a stream to get a stream key, set access rules and open a chat room."
            action={{ label: "Schedule a stream", onClick: () => setCreateOpen(true) }}
          />
        ) : (
          <div className="space-y-4">
            {filtered.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                revealed={revealKey === event.id}
                onToggleReveal={() =>
                  setRevealKey(revealKey === event.id ? null : event.id)
                }
                onRegenerate={async () => {
                  await regenerateKey.mutateAsync(event.id);
                  toast({
                    title: "Stream key rotated",
                    description: "The old key stops working immediately.",
                    tone: "warning",
                  });
                }}
                onStart={async () => {
                  await startEvent.mutateAsync(event.id);
                  toast({
                    title: "Broadcast started!",
                    description: "Your stream is now live and on air.",
                  });
                }}
                onEnd={async () => {
                  await endEvent.mutateAsync(event.id);
                  toast({ title: "Stream ended" });
                }}
                onPublishReplay={async () => {
                  await publishReplay.mutateAsync(event.id);
                  toast({
                    title: "Replay published",
                    description: "It now appears on your channel and in Content.",
                  });
                }}
              />
            ))}
          </div>
        )}
      </PageBody>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Schedule a live stream"
        description="Set the details now; you can change them any time before you go on air."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              loading={createEvent.isPending}
              disabled={title.trim().length < 3}
            >
              Schedule stream
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" htmlFor="live-title" required>
            <Input
              id="live-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Orbit Session 16 — live from the room"
            />
          </Field>

          <Field label="Description" htmlFor="live-desc">
            <Textarea
              id="live-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts at" htmlFor="live-start" required>
              <DatePicker
                id="live-start"
                value={scheduledStart}
                onChange={setScheduledStart}
                withTime
              />
            </Field>
            <Field label="Timezone" htmlFor="live-tz">
              <Select
                id="live-tz"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              >
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Categories">
            <MultiSelect
              options={categories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              value={categoryIds}
              onChange={setCategoryIds}
              placeholder="Choose categories"
            />
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium text-fg">Access</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ACCESS_TYPES.map((option) => (
                <RadioCard
                  key={option.value}
                  name="access"
                  value={option.value}
                  checked={accessType === option.value}
                  onChange={(value) => setAccessType(value as LiveAccessType)}
                  title={option.title}
                  description={option.description}
                />
              ))}
            </div>
            {accessType === "ticketed" ? (
              <div className="mt-3 max-w-xs">
                <Field label="Ticket price (£)" htmlFor="live-price" hint="Issued and processed via MYHitch Pass.">
                  <Input
                    id="live-price"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    inputMode="decimal"
                  />
                </Field>
              </div>
            ) : null}

            {accessType === "private" || accessType === "invitation-only" || accessType === "subscriber-only" ? (
              <div className="mt-3 space-y-2">
                <Field label="Named Collaborators & Co-Hosts" hint="Invite co-hosts or named accounts to access/stream this event">
                  <div className="flex gap-2">
                    <Input
                      value={collabDraft}
                      onChange={(e) => setCollabDraft(e.target.value)}
                      placeholder="@cohost_alex or editor@nexus.com"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!collabDraft.trim()}
                      onClick={() => {
                        if (collabDraft.trim()) {
                          setCollaborators((prev) => [...prev, collabDraft.trim()]);
                          setCollabDraft("");
                          toast({ title: "Collaborator added to stream" });
                        }
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </Field>
                {collaborators.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {collaborators.map((person, idx) => (
                      <Badge key={idx} tone="neutral" size="sm" className="flex items-center gap-1.5">
                        <span>{person}</span>
                        <button
                          type="button"
                          className="hover:text-danger ml-1"
                          onClick={() => setCollaborators((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          ✕
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <Switch
            checked={chatEnabled}
            onCheckedChange={setChatEnabled}
            label="Enable live chat"
            description="You can moderate, slow or disable chat at any point during the stream."
          />
        </div>
      </Modal>
    </>
  );
}

function EventCard({
  event,
  revealed,
  onToggleReveal,
  onRegenerate,
  onStart,
  onEnd,
  onPublishReplay,
}: {
  event: LiveEvent;
  revealed: boolean;
  onToggleReveal: () => void;
  onRegenerate: () => void;
  onStart: () => void;
  onEnd: () => void;
  onPublishReplay: () => void;
}) {
  const { toast } = useToast();

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {event.title}
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
                {event.status}
              </Badge>
            )}
            <Badge tone="outline" size="sm">
              {event.accessType.replace("-", " ")}
            </Badge>
            {event.price ? (
              <Badge tone="accent" size="sm">
                {formatCurrency(event.price.amount, event.price.currency)}
              </Badge>
            ) : null}
          </span>
        }
        description={`${formatDateTime(event.scheduledStart)} · ${event.timezone}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" href={`/live/${event.id}`}>
              View page
            </Button>
            {event.status === "upcoming" ? (
              <Button variant="primary" size="sm" onClick={onStart}>
                <IconBroadcast />
                Go live now
              </Button>
            ) : null}
            {event.status === "live" ? (
              <Button variant="danger" size="sm" onClick={onEnd}>
                <IconPlayerStop />
                End stream
              </Button>
            ) : null}
            {event.status === "ended" && !event.replayPublished ? (
              <Button variant="primary" size="sm" onClick={onPublishReplay}>
                Publish replay
              </Button>
            ) : null}
            {event.replayPublished && event.replayVideoId ? (
              <Button variant="ghost" size="sm" href={`/video/${event.replayVideoId}`}>
                View replay
              </Button>
            ) : null}
          </div>
        }
      />
      <CardBody className="space-y-4">
        {event.status === "live" ? (
          <div className="flex flex-wrap gap-6 rounded-lg border border-border bg-surface-2 p-4">
            <div>
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">
                Watching now
              </p>
              <p className="font-display text-xl font-semibold text-fg nx-tnum">
                {compactNumber(event.viewerCount)}
              </p>
            </div>
            <div>
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">Peak</p>
              <p className="font-display text-xl font-semibold text-fg nx-tnum">
                {compactNumber(event.peakViewers)}
              </p>
            </div>
            <div>
              <p className="text-2xs uppercase tracking-wide text-fg-subtle">Chat</p>
              <p className="font-display text-xl font-semibold text-fg">
                {event.chatEnabled ? "On" : "Off"}
              </p>
            </div>
          </div>
        ) : null}

        {/* Stream key */}
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            Encoder settings
          </p>
          <div className="mt-3 space-y-2.5">
            <KeyRow label="Ingest URL" value={event.ingestUrl} />
            <div>
              <p className="mb-1 text-2xs uppercase tracking-wide text-fg-subtle">
                Stream key
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-fg">
                  {revealed ? event.streamKey : "•".repeat(event.streamKey.length)}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={revealed ? "Hide stream key" : "Reveal stream key"}
                  onClick={onToggleReveal}
                >
                  {revealed ? <IconEyeOff /> : <IconEye />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy stream key"
                  onClick={() => {
                    navigator.clipboard?.writeText(event.streamKey).catch(() => {});
                    toast({ title: "Stream key copied" });
                  }}
                >
                  <IconCopy />
                </Button>
                <Button variant="secondary" size="sm" onClick={onRegenerate}>
                  <IconRefresh />
                  Regenerate
                </Button>
              </div>
            </div>
          </div>
          <p className="mt-3 text-2xs leading-relaxed text-fg-subtle">
            Illustrative only. There is no ingest endpoint behind this URL — real
            RTMP/WebRTC ingest is explicitly out of scope.
          </p>
        </div>

        <p className="text-sm leading-relaxed text-fg-muted">{event.description}</p>
      </CardBody>
    </Card>
  );
}

function KeyRow({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  return (
    <div>
      <p className="mb-1 text-2xs uppercase tracking-wide text-fg-subtle">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-fg-muted">
          {value}
        </code>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Copy ${label}`}
          onClick={() => {
            navigator.clipboard?.writeText(value).catch(() => {});
            toast({ title: `${label} copied` });
          }}
        >
          <IconCopy />
        </Button>
      </div>
    </div>
  );
}
