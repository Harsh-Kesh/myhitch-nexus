"use client";

import {
  IconAlertTriangle,
  IconBroadcast,
  IconEye,
  IconMessageOff,
  IconPlayerStop,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge, LiveBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Poster } from "@/components/video/poster";
import { channelById } from "@/lib/mock-api/data/channels";
import { useLiveEvents, useModerationQueue } from "@/lib/mock-api/hooks";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LiveEvent } from "@/lib/mock-api/types";
import { compactNumber, formatDateTime, relativeTime } from "@/lib/utils";

type Intervention = "warn" | "disable-chat" | "age-gate" | "terminate";

const INTERVENTIONS: Array<{ value: Intervention; label: string; description: string }> = [
  {
    value: "warn",
    label: "Send a warning to the host",
    description: "In-stream notice. The broadcast continues.",
  },
  {
    value: "disable-chat",
    label: "Disable chat",
    description: "Stops all messages immediately. Playback continues.",
  },
  {
    value: "age-gate",
    label: "Apply an age gate",
    description: "Restricts the stream to verified over-18 accounts.",
  },
  {
    value: "terminate",
    label: "Terminate the stream",
    description: "Ends the broadcast for all viewers. Use only for serious breaches.",
  },
];

export default function AdminLivePage() {
  const { data: events = [] } = useLiveEvents();
  const { data: incidents = [] } = useModerationQueue("live-incident");
  const qc = useQueryClient();
  const interventionMut = useMutation({
    mutationFn: async (vars: { id: string, action: string, reason: string }) => {
      const res = await fetch(`/api/admin/live/${vars.id}/intervention`, {
        method: "POST",
        body: JSON.stringify({ action: vars.action, reason: vars.reason })
      });
      if (!res.ok) throw new Error("Failed to apply intervention");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["live-events"] });
    }
  });
  const { toast } = useToast();

  const [tab, setTab] = React.useState("live");
  const [target, setTarget] = React.useState<LiveEvent | null>(null);
  const [intervention, setIntervention] = React.useState<Intervention>("warn");
  const [reason, setReason] = React.useState("");

  const live = events.filter((event) => event.status === "live");
  const upcoming = events.filter((event) => event.status === "upcoming");
  const ended = events.filter(
    (event) => event.status === "ended" || event.status === "replay",
  );

  const shown = tab === "live" ? live : tab === "upcoming" ? upcoming : ended;

  const totalViewers = live.reduce((total, event) => total + event.viewerCount, 0);
  const openIncidents = incidents.filter((item) => item.status === "open");

  return (
    <>
      <PageHeader
        title="Live operations"
        description="Streams currently on air, what is scheduled, and any incidents that need platform intervention."
      />

      <PageBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="On air now" value={String(live.length)} icon={<IconBroadcast />} />
          <Stat
            label="Concurrent viewers"
            value={compactNumber(totalViewers)}
            icon={<IconUsers />}
          />
          <Stat label="Scheduled" value={String(upcoming.length)} />
          <Stat
            label="Open incidents"
            value={String(openIncidents.length)}
            icon={<IconAlertTriangle />}
            invertDelta
          />
        </div>

        {openIncidents.length > 0 ? (
          <Card className="border-live/40">
            <CardHeader
              title={
                <span className="flex items-center gap-2 text-live">
                  <IconAlertTriangle className="size-4" />
                  Active live incidents
                </span>
              }
              description="Raised by channel moderators or automated detection"
              action={
                <Button variant="secondary" size="sm" href="/admin/reviews?queue=live-incident">
                  Open in review queue
                </Button>
              }
            />
            <CardBody className="p-0">
              <ul className="divide-y divide-border">
                {openIncidents.map((item) => {
                  const event = events.find((entry) => entry.id === item.targetId);
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <Badge
                        tone={item.priority === "urgent" ? "danger" : "warning"}
                        size="sm"
                      >
                        {item.priority}
                      </Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{item.title}</span>
                        <span className="mt-0.5 block text-2xs text-fg-subtle">
                          {item.reportCount} reports · {relativeTime(item.submittedAt)}
                          {item.assignedTo ? ` · ${item.assignedTo}` : ""}
                        </span>
                      </span>
                      {event ? (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setTarget(event);
                            setIntervention("disable-chat");
                            setReason("");
                          }}
                        >
                          Intervene
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        ) : null}

        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "live", label: "On air", count: live.length },
            { value: "upcoming", label: "Scheduled", count: upcoming.length },
            { value: "ended", label: "Ended", count: ended.length },
          ]}
        />

        {shown.length === 0 ? (
          <EmptyState
            icon={<IconBroadcast />}
            title={tab === "live" ? "Nothing on air" : "Nothing here"}
            description={
              tab === "live"
                ? "No streams are currently broadcasting across the platform."
                : "No streams match this filter."
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {shown.map((event) => {
              const channel = channelById(event.channelId);
              const channelName = event.channelName ?? channel?.name;
              return (
                <Card key={event.id}>
                  <CardBody className="flex flex-wrap gap-4">
                    <Poster
                      src={event.thumbnailUrl}
                      alt={event.title}
                      gradient={event.posterGradient}
                      seed={event.id}
                      ratio="video"
                      className="w-full shrink-0 rounded sm:w-44"
                    >
                      {event.status === "live" ? (
                        <span className="absolute left-2 top-2">
                          <LiveBadge size="sm" />
                        </span>
                      ) : null}
                    </Poster>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-fg">{event.title}</p>
                        <Badge tone="outline" size="sm">
                          {event.accessType.replace("-", " ")}
                        </Badge>
                        {!event.chatEnabled ? (
                          <Badge tone="warning" size="sm">
                            <IconMessageOff />
                            Chat off
                          </Badge>
                        ) : null}
                      </div>

                      {channelName ? (
                        <Link
                          href={`/channel/${event.channelId}`}
                          className="mt-0.5 block truncate text-xs text-fg-muted transition-colors hover:text-accent"
                        >
                          {channelName}
                        </Link>
                      ) : null}

                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-fg-subtle nx-tnum">
                        {event.status === "live" ? (
                          <span className="inline-flex items-center gap-1">
                            <IconEye className="size-3" />
                            {compactNumber(event.viewerCount)} watching
                          </span>
                        ) : null}
                        {event.peakViewers > 0 ? (
                          <span>peak {compactNumber(event.peakViewers)}</span>
                        ) : null}
                        <span>{formatDateTime(event.scheduledStart)}</span>
                        <span>{event.timezone}</span>
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" href={`/live/${event.id}`}>
                          Watch
                        </Button>
                        {event.status === "live" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger"
                            onClick={() => {
                              setTarget(event);
                              setIntervention("warn");
                              setReason("");
                            }}
                          >
                            Intervene
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </PageBody>

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={`Intervene in “${target?.title ?? ""}”`}
        description="Platform-level action on a live broadcast. The host and channel owner are notified, and the decision is written to the audit log."
        tone="danger"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 8}
              loading={interventionMut.isPending}
              onClick={async () => {
                if (!target) return;
                await interventionMut.mutateAsync({ id: target.id, action: intervention, reason: reason.trim() });
                toast({
                  title:
                    intervention === "terminate"
                      ? "Stream terminated"
                      : intervention === "disable-chat"
                        ? "Chat disabled"
                        : intervention === "age-gate"
                          ? "Age gate applied"
                          : "Warning sent to host",
                  description: "Recorded in the audit log.",
                  tone: "warning",
                });
                setTarget(null);
              }}
            >
              Apply intervention
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Intervention" htmlFor="live-intervention" required>
            <Select
              id="live-intervention"
              value={intervention}
              onChange={(event) => setIntervention(event.target.value as Intervention)}
            >
              {INTERVENTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>

          <p className="rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">
            {INTERVENTIONS.find((item) => item.value === intervention)?.description}
          </p>

          <Field
            label="Reason"
            htmlFor="live-reason"
            required
            hint="Shown to the host and recorded against the channel."
            error={
              reason.length > 0 && reason.trim().length < 8
                ? "Give at least a short explanation"
                : undefined
            }
          >
            <Textarea
              id="live-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder="Coordinated link spam from newly created accounts in chat."
            />
          </Field>

          {intervention === "terminate" ? (
            <p className="flex items-start gap-2 rounded border border-danger/30 bg-danger/10 p-3 text-xs leading-relaxed text-fg-muted">
              <IconPlayerStop className="mt-0.5 size-4 shrink-0 text-danger" />
              Terminating ends the broadcast for every viewer immediately and
              cannot be undone. Any ticketed viewers become eligible for a refund.
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
