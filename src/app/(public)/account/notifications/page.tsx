"use client";

import { IconBellOff, IconChecks } from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { NOTIFICATION_EVENT_LABELS } from "@/lib/mock-api/data/users";
import {
  useCurrentUser,
  useMarkNotificationsRead,
  useNotifications,
  useUpdateUser,
} from "@/lib/mock-api/hooks";
import type { NotificationEvent } from "@/lib/mock-api/types";
import { cn, relativeTime } from "@/lib/utils";

const CHANNELS = [
  { key: "inApp" as const, label: "In-app" },
  { key: "email" as const, label: "Email" },
  { key: "push" as const, label: "Push" },
];

export default function NotificationsPage() {
  const { data: notifications = [], isLoading } = useNotifications();
  const { data: user } = useCurrentUser();
  const markRead = useMarkNotificationsRead();
  const updateUser = useUpdateUser();
  const { toast } = useToast();

  const [tab, setTab] = React.useState("inbox");

  const unread = notifications.filter((item) => !item.read);

  if (isLoading || !user) return <RailSkeleton count={4} />;

  return (
    <div>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "inbox", label: "Inbox", count: unread.length },
          { value: "preferences", label: "Preferences" },
        ]}
      />

      <div className="mt-5">
        {tab === "inbox" ? (
          notifications.length === 0 ? (
            <EmptyState
              icon={<IconBellOff />}
              title="Nothing to catch up on"
              description="New uploads, live streams, receipts and policy decisions land here."
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-fg-muted nx-tnum">
                  {unread.length} unread of {notifications.length}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={unread.length === 0}
                  onClick={() => {
                    markRead.mutate(undefined);
                    toast({ title: "All marked as read" });
                  }}
                >
                  <IconChecks />
                  Mark all read
                </Button>
              </div>

              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <Link
                      href={notification.href}
                      onClick={() => markRead.mutate(notification.id)}
                      className={cn(
                        "flex gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2",
                        !notification.read && "bg-accent/[0.04]",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          notification.read ? "bg-transparent" : "bg-accent",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "text-sm",
                              notification.read ? "text-fg-muted" : "font-medium text-fg",
                            )}
                          >
                            {notification.title}
                          </span>
                          <Badge tone="outline" size="sm">
                            {NOTIFICATION_EVENT_LABELS[notification.event].title}
                          </Badge>
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
                          {notification.body}
                        </span>
                        <span className="mt-1 block text-2xs text-fg-subtle">
                          {relativeTime(notification.createdAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : null}

        {tab === "preferences" ? (
          <Card>
            <CardHeader
              title="Notification preferences"
              description="Choose how you hear about each kind of event. Nothing is actually delivered in this prototype — email, SMS and push are out of scope."
            />
            <CardBody className="p-0">
              <div className="nx-scrollbar overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/60">
                      <th
                        scope="col"
                        className="px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wide text-fg-subtle"
                      >
                        Event
                      </th>
                      {CHANNELS.map((channel) => (
                        <th
                          key={channel.key}
                          scope="col"
                          className="w-24 px-3 py-2.5 text-center text-2xs font-semibold uppercase tracking-wide text-fg-subtle"
                        >
                          {channel.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(
                      Object.keys(NOTIFICATION_EVENT_LABELS) as NotificationEvent[]
                    ).map((event) => {
                      const config = NOTIFICATION_EVENT_LABELS[event];
                      const prefs = user.notificationPreferences[event] || { inApp: true, email: true, push: false };
                      return (
                        <tr key={event}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-fg">{config.title}</p>
                            <p className="mt-0.5 text-xs text-fg-muted">
                              {config.description}
                            </p>
                          </td>
                          {CHANNELS.map((channel) => (
                            <td key={channel.key} className="px-3 py-3 text-center">
                              <input
                                type="checkbox"
                                aria-label={`${config.title} via ${channel.label}`}
                                checked={prefs[channel.key]}
                                onChange={(changeEvent) =>
                                  updateUser.mutate({
                                    notificationPreferences: {
                                      ...user.notificationPreferences,
                                      [event]: {
                                        ...prefs,
                                        [channel.key]: changeEvent.target.checked,
                                      },
                                    },
                                  })
                                }
                                className="size-4 cursor-pointer rounded-sm border border-border-strong bg-surface-2 accent-[rgb(var(--nx-accent))]"
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
