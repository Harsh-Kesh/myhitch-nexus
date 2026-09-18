"use client";

import { IconAlertTriangle, IconCheck, IconCreditCard } from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { looksLikeRealId } from "@/lib/mock-api";
import { channelById } from "@/lib/mock-api/data/channels";
import { useCancelSubscription, useCurrentUser, useSubscriptions } from "@/lib/mock-api/hooks";
import type { Subscription } from "@/lib/mock-api/types";
import { formatCurrency, formatDate } from "@/lib/utils";

const STATUS_TONE: Record<Subscription["status"], "published" | "archived" | "danger"> = {
  active: "published",
  cancelled: "archived",
  "past-due": "danger",
};

export default function SubscriptionsPage() {
  const { data: user } = useCurrentUser();
  const isRealAccount = Boolean(user?.id && looksLikeRealId(user.id));
  const { data: subscriptions = [], isLoading } = useSubscriptions();
  const cancelSubscription = useCancelSubscription();
  const { toast } = useToast();
  const [cancelling, setCancelling] = React.useState<Subscription | null>(null);

  if (isLoading) return <RailSkeleton count={3} />;

  const active = subscriptions.filter((item) => item.status !== "cancelled");
  const inactive = subscriptions.filter((item) => item.status === "cancelled");

  const monthlyTotal = active
    .filter((item) => item.interval === "monthly")
    .reduce((total, item) => total + item.price.amount, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="flex flex-wrap items-center gap-4">
          <span className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
            <IconCreditCard className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">Recurring total</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              Across {active.length} active subscription{active.length === 1 ? "" : "s"}
            </p>
          </div>
          <p className="font-display text-2xl font-semibold text-fg nx-tnum">
            {formatCurrency(monthlyTotal)}
            <span className="ml-1 text-sm font-normal text-fg-subtle">/ month</span>
          </p>
        </CardBody>
      </Card>

      {subscriptions.length === 0 ? (
        <EmptyState
          icon={<IconCreditCard />}
          title="No subscriptions"
          description="Nexus Premium removes advertising and includes a catalogue of films and series. Channel memberships support creators directly."
          action={{ label: "Browse the catalogue", href: "/explore" }}
        />
      ) : null}

      {active.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-fg">Active</h2>
          {active.map((subscription) => {
            const channel = subscription.channelId
              ? channelById(subscription.channelId)
              : null;
            return (
              <Card key={subscription.id}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {subscription.name}
                      <Badge
                        tone={subscription.cancelAtPeriodEnd ? "archived" : STATUS_TONE[subscription.status]}
                        size="sm"
                      >
                        {subscription.cancelAtPeriodEnd ? "ending" : subscription.status}
                      </Badge>
                      <Badge tone="outline" size="sm">
                        {subscription.interval}
                      </Badge>
                    </span>
                  }
                  description={
                    subscription.status === "past-due"
                      ? "Payment failed. Update the payment method to keep access."
                      : subscription.cancelAtPeriodEnd
                        ? `Access ends ${formatDate(subscription.renewsAt, "long")} — it won't renew`
                        : `Renews ${formatDate(subscription.renewsAt, "long")}`
                  }
                  action={
                    <span className="text-right">
                      <span className="block font-display text-lg font-semibold text-fg nx-tnum">
                        {formatCurrency(
                          subscription.price.amount,
                          subscription.price.currency,
                        )}
                      </span>
                      <span className="block text-2xs text-fg-subtle">
                        per {subscription.interval === "monthly" ? "month" : "year"}
                      </span>
                    </span>
                  }
                />
                <CardBody className="space-y-4">
                  {channel ? (
                    <Link
                      href={`/channel/${channel.id}`}
                      className="flex items-center gap-2.5"
                    >
                      <Avatar
                        name={channel.name}
                        gradient={channel.avatarGradient}
                        src={channel.avatarUrl}
                        size="sm"
                        verified={channel.verified}
                      />
                      <span className="text-sm text-fg-muted transition-colors hover:text-fg">
                        {channel.name}
                      </span>
                    </Link>
                  ) : null}

                  <ul className="space-y-1.5">
                    {subscription.benefits.map((benefit) => (
                      <li key={benefit} className="flex items-start gap-2 text-sm text-fg-muted">
                        <IconCheck className="mt-0.5 size-4 shrink-0 text-success" />
                        {benefit}
                      </li>
                    ))}
                  </ul>

                  {subscription.status === "past-due" ? (
                    <p className="flex items-start gap-2 rounded border border-danger/30 bg-danger/10 p-3 text-xs leading-relaxed text-fg-muted">
                      <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
                      The last payment was declined on{" "}
                      {formatDate(subscription.renewsAt)}. Access continues for a
                      short grace period.
                    </p>
                  ) : null}

                  <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        toast({
                          title: "Payment method",
                          description: isRealAccount
                            ? "Changing your card isn't built yet — cancel and re-subscribe with a different card for now."
                            : "Payment details are never collected in this prototype.",
                          tone: "info",
                        })
                      }
                    >
                      Update payment method
                    </Button>
                    {subscription.cancelAtPeriodEnd ? null : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setCancelling(subscription)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </section>
      ) : null}

      {inactive.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-fg">Cancelled</h2>
          {inactive.map((subscription) => (
            <Card key={subscription.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">{subscription.name}</p>
                <p className="mt-0.5 text-xs text-fg-subtle nx-tnum">
                  Ended {formatDate(subscription.renewsAt)}
                </p>
              </div>
              <Badge tone="archived" size="sm">
                Cancelled
              </Badge>
              <Button variant="secondary" size="sm">
                Resubscribe
              </Button>
            </Card>
          ))}
        </section>
      ) : null}

      <ConfirmModal
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          if (!cancelling) return;
          await cancelSubscription.mutateAsync(cancelling.id);
          toast({
            title: "Subscription cancelled",
            description: `Access continues until ${formatDate(cancelling.renewsAt)}.`,
            tone: "warning",
          });
          setCancelling(null);
        }}
        title={`Cancel ${cancelling?.name ?? "subscription"}?`}
        description="You keep access until the end of the current billing period. Nothing is refunded automatically."
        confirmLabel="Cancel subscription"
        loading={cancelSubscription.isPending}
      />
    </div>
  );
}
