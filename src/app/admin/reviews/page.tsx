"use client";

import {
  IconChecks,
  IconClockHour4,
  IconExternalLink,
  IconHistory,
  IconShieldCheck,
} from "@tabler/icons-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { Suspense } from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { MODERATION_ACTION_LABELS } from "@/lib/mock-api";
import { channelById } from "@/lib/mock-api/data/channels";
import {
  useActionModerationItem,
  useAuditLog,
  useModerationQueue,
} from "@/lib/mock-api/hooks";
import type { ModerationAction, ModerationItem } from "@/lib/mock-api/types";
import { cn, relativeTime } from "@/lib/utils";

const QUEUES: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending-review", label: "Pending review" },
  { value: "reported", label: "Reported" },
  { value: "copyright", label: "Copyright" },
  { value: "live-incident", label: "Live incidents" },
  { value: "verification", label: "Verification" },
];

const ACTIONS: ModerationAction[] = [
  "approve",
  "request-changes",
  "restrict",
  "age-restrict",
  "demonetise",
  "geo-block",
  "reject",
  "remove",
  "suspend",
];

/** Actions that must not be taken without a written reason. */
const REASON_REQUIRED: ModerationAction[] = [
  "reject",
  "restrict",
  "remove",
  "suspend",
  "geo-block",
  "demonetise",
  "age-restrict",
];

function ReviewQueue() {
  const params = useSearchParams();
  const initialQueue = params.get("queue") ?? "all";

  const [queue, setQueue] = React.useState(initialQueue);
  const [selected, setSelected] = React.useState<ModerationItem | null>(null);
  const [action, setAction] = React.useState<ModerationAction>("approve");
  const [reason, setReason] = React.useState("");

  const { data: items = [], isLoading } = useModerationQueue(
    queue === "all" ? undefined : (queue as ModerationItem["queue"]),
  );
  const { data: audit = [] } = useAuditLog();
  const actionItem = useActionModerationItem();
  const { toast } = useToast();

  const open = items.filter((item) => item.status === "open");
  const closed = items.filter((item) => item.status !== "open");

  const submit = async () => {
    if (!selected) return;
    const result = await actionItem.mutateAsync({
      itemId: selected.id,
      action,
      reason: reason.trim(),
    });
    setSelected(null);
    setReason("");
    setAction("approve");
    toast({
      title: `${MODERATION_ACTION_LABELS[action]} applied`,
      description: result
        ? `Audit entry ${result.audit.id} recorded against ${result.audit.targetId}.`
        : undefined,
      tone: action === "approve" ? "success" : "warning",
    });
  };

  const reasonRequired = REASON_REQUIRED.includes(action);

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Approve, restrict or remove content, comments, campaigns and verification applications. Every decision writes to the audit log."
      >
        <Tabs
          value={queue}
          onChange={setQueue}
          variant="pill"
          items={QUEUES.map((item) => ({ value: item.value, label: item.label }))}
        />
      </PageHeader>

      <PageBody className="space-y-6">
        {isLoading ? (
          <RailSkeleton count={4} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<IconChecks />}
            title="Queue is clear"
            description="Nothing is waiting in this queue."
          />
        ) : (
          <>
            <section>
              <h2 className="mb-3 font-display text-lg font-semibold text-fg">
                Open · {open.length}
              </h2>
              {open.length === 0 ? (
                <EmptyState compact title="Nothing open in this queue" />
              ) : (
                <ul className="space-y-3">
                  {open.map((item) => (
                    <li key={item.id}>
                      <QueueRow
                        item={item}
                        onAction={() => {
                          setSelected(item);
                          setAction("approve");
                          setReason("");
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {closed.length > 0 ? (
              <section>
                <h2 className="mb-3 font-display text-lg font-semibold text-fg">
                  Recently actioned · {closed.length}
                </h2>
                <ul className="space-y-3">
                  {closed.map((item) => (
                    <li key={item.id}>
                      <QueueRow item={item} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}

        {/* Audit trail */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <IconHistory className="size-4 text-accent" />
                Audit trail
              </span>
            }
            description="The most recent decisions taken across the platform"
            action={
              <Button variant="ghost" size="sm" href="/admin/audit-logs">
                Full log
              </Button>
            }
          />
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {audit.slice(0, 10).map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                  <span
                    className={cn(
                      "mt-1 size-2 shrink-0 rounded-full",
                      entry.severity === "critical"
                        ? "bg-danger"
                        : entry.severity === "warning"
                          ? "bg-warning"
                          : entry.severity === "notice"
                            ? "bg-info"
                            : "bg-fg-subtle",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-xs text-accent">
                        {entry.action}
                      </code>
                      <Badge tone="outline" size="sm">
                        {entry.targetType}
                      </Badge>
                      <span className="text-2xs text-fg-subtle">
                        {entry.actor} · {relativeTime(entry.createdAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
                      {entry.reason}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </PageBody>

      {/* Decision modal */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title}
        description={
          selected
            ? `${selected.kind} · submitted ${relativeTime(selected.submittedAt)}`
            : undefined
        }
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Cancel
            </Button>
            <Button
              variant={action === "approve" ? "primary" : "danger"}
              onClick={submit}
              loading={actionItem.isPending}
              disabled={reasonRequired && reason.trim().length < 8}
            >
              {MODERATION_ACTION_LABELS[action]}
            </Button>
          </>
        }
      >
        {selected ? (
          <div className="space-y-4">
            {selected.reportReasons.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Report reasons · {selected.reportCount} reports
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {selected.reportReasons.map((item) => (
                    <Badge key={item} tone="warning" size="sm">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                Context
              </p>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-fg-muted">
                {selected.notes}
              </p>
            </div>

            <Field label="Decision" htmlFor="mod-action" required>
              <Select
                id="mod-action"
                value={action}
                onChange={(event) =>
                  setAction(event.target.value as ModerationAction)
                }
              >
                {ACTIONS.map((item) => (
                  <option key={item} value={item}>
                    {MODERATION_ACTION_LABELS[item]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Reason"
              htmlFor="mod-reason"
              required={reasonRequired}
              hint={
                reasonRequired
                  ? "Required. Shown to the channel and recorded in the audit log."
                  : "Optional, but recorded in the audit log if provided."
              }
              error={
                reasonRequired && reason.length > 0 && reason.trim().length < 8
                  ? "Give at least a short explanation"
                  : undefined
              }
            >
              <Textarea
                id="mod-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                placeholder="Explain the decision and cite the policy it rests on."
              />
            </Field>

            <p className="flex items-start gap-2 rounded border border-info/30 bg-info/10 p-3 text-xs leading-relaxed text-fg-muted">
              <IconShieldCheck className="mt-0.5 size-4 shrink-0 text-info" />
              This decision is applied to the underlying record immediately and
              written to the audit log with your name attached.
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function QueueRow({
  item,
  onAction,
}: {
  item: ModerationItem;
  onAction?: () => void;
}) {
  const channel = channelById(item.channelId);

  return (
    <Card className={cn(item.status !== "open" && "opacity-70")}>
      <CardBody className="flex flex-wrap items-start gap-4">
        <span
          className={cn(
            "mt-1 size-2.5 shrink-0 rounded-full",
            item.priority === "urgent"
              ? "bg-live"
              : item.priority === "high"
                ? "bg-warning"
                : item.priority === "normal"
                  ? "bg-info"
                  : "bg-fg-subtle",
          )}
          title={`${item.priority} priority`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-fg">{item.title}</p>
            <Badge tone="outline" size="sm">
              {item.kind}
            </Badge>
            <Badge
              tone={
                item.status === "open"
                  ? "pending"
                  : item.status === "escalated"
                    ? "warning"
                    : item.status === "dismissed"
                      ? "archived"
                      : "published"
              }
              size="sm"
            >
              {item.status}
            </Badge>
            {item.reportCount > 0 ? (
              <Badge tone="danger" size="sm">
                {item.reportCount} reports
              </Badge>
            ) : null}
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-fg-subtle">
            {channel ? (
              <Link
                href={`/channel/${channel.id}`}
                className="transition-colors hover:text-accent"
              >
                {channel.name}
              </Link>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <IconClockHour4 className="size-3" />
              {relativeTime(item.submittedAt)}
            </span>
            {item.assignedTo ? <span>Assigned to {item.assignedTo}</span> : null}
            <span className="font-mono">{item.targetId}</span>
          </p>

          <p className="mt-2 nx-clamp-2 text-xs leading-relaxed text-fg-muted">
            {item.notes}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {item.kind === "content" ? (
            <Button variant="ghost" size="sm" href={`/video/${item.targetId}`}>
              <IconExternalLink />
              View
            </Button>
          ) : null}
          {item.kind === "live" ? (
            <Button variant="ghost" size="sm" href={`/live/${item.targetId}`}>
              <IconExternalLink />
              Watch
            </Button>
          ) : null}
          {item.kind === "copyright" ? (
            <Button variant="ghost" size="sm" href="/admin/reports">
              <IconExternalLink />
              Review claim
            </Button>
          ) : onAction ? (
            <Button variant="primary" size="sm" onClick={onAction}>
              Action
            </Button>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

export default function AdminReviewsPage() {
  return (
    <Suspense
      fallback={
        <PageBody>
          <RailSkeleton count={4} />
        </PageBody>
      }
    >
      <ReviewQueue />
    </Suspense>
  );
}
