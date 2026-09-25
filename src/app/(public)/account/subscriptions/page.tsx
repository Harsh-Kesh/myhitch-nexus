"use client";

import { IconAlertTriangle, IconCheck, IconCreditCard, IconCrown } from "@tabler/icons-react";
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
import { useCancelSubscription, useChannel, useCurrentUser, useSubscriptions } from "@/lib/mock-api/hooks";
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

  const activePlanInfo = React.useMemo(() => {
    if (!user) {
      return {
        name: "Nexus Free Tier",
        interval: null,
        amount: 0,
        currency: "AUD",
        renewsAt: null,
        benefits: [
          "Ad-Supported Catalog Access",
          "Standard Quality Playback",
          "1 Viewer Profile (Upgrade to Family for up to 5)",
        ],
        isFree: true,
        notSubscribed: false,
        isActiveSubscription: false,
      };
    }

    const activeSub = subscriptions.find((s) => s.status === "active");
    if (activeSub) {
      return {
        name: activeSub.name,
        interval: activeSub.interval,
        amount: activeSub.price.amount,
        currency: activeSub.price.currency,
        renewsAt: activeSub.renewsAt,
        benefits: activeSub.benefits,
        isFree: false,
        notSubscribed: false,
        // The one case with a genuine, currently-active paid subscription behind it —
        // isFree/notSubscribed alone can't distinguish this from the Creator case just
        // below (also isFree: false, notSubscribed: false, since Creator is genuinely
        // free but deliberately not flagged "isFree" for its own display reasons). The
        // CTA button below needs exactly this distinction: "Subscribe" makes no sense
        // once a real subscription is already active — that was the actual bug (found
        // live: a real Premium subscriber still saw a "Subscribe" button on their own
        // active-plan card).
        isActiveSubscription: true,
      };
    }

    if (user.roles.includes("creator") || user.activeRole === "creator") {
      return {
        name: "Nexus Creator Plan",
        interval: "monthly" as const,
        amount: 0,
        currency: "AUD",
        renewsAt: null,
        benefits: [
          "Creator Studio Access",
          "Video & Audio Asset Uploads",
          "MYHitch Pass PPV & Ticketed Live Streaming",
          "MYHitch Connect Brand Sponsorship Deals",
          "Fan Super Thanks Tipping & Ad Revenue Share",
        ],
        // Genuinely free (matches /plans's real "Nexus Creator — free to start") — no
        // real subscription is needed to unlock Creator Studio, so there's nothing to
        // subscribe to, unlike the Business/Enterprise cases below.
        isFree: false,
        notSubscribed: false,
        isActiveSubscription: false,
      };
    }

    // Business and Enterprise are real, paid tiers ($29/mo and contact-sales
    // respectively) — a "business"/"enterprise" role flag alone (set for free at
    // registration, see auth/register/route.ts) is not a payment and must never be
    // shown as an "active" plan here. Found live: this used to claim "Nexus Business
    // Plan is active... $29/mo" for any business-role account with no real
    // subscription, directly contradicting /business/layout.tsx's real
    // checkRealPlanActive() gate one click away.
    if (user.roles.includes("business") || user.activeRole === "business") {
      return {
        name: "Nexus Business Plan",
        interval: "monthly" as const,
        amount: 2900,
        currency: "AUD",
        renewsAt: null,
        benefits: [
          "Business Channel & Product Link Embedding",
          "Customer Lead Generation Forms",
          "Team Access & Role Management",
          "Pre-roll & Mid-roll Ad Campaign Manager",
        ],
        isFree: true,
        notSubscribed: true,
        isActiveSubscription: false,
      };
    }

    if (user.roles.includes("enterprise") || user.roles.includes("producer") || user.activeRole === "enterprise") {
      return {
        name: "Nexus Enterprise Plan",
        interval: "annual" as const,
        amount: 0,
        currency: "AUD",
        renewsAt: null,
        benefits: [
          "Bulk CSV/XML Catalog Metadata Import",
          "Client Review Links with Dynamic Watermarks",
          "High-Capacity Secure File Transfers",
          "Developer API Keys & Dedicated Support",
        ],
        isFree: true,
        notSubscribed: true,
        isActiveSubscription: false,
      };
    }

    return {
      name: "Nexus Free Tier",
      interval: null,
      amount: 0,
      currency: "AUD",
      renewsAt: null,
      benefits: [
        "Ad-Supported Catalog Access",
        "Standard Quality Playback",
        "1 Viewer Profile (Upgrade to Family for up to 5)",
      ],
      isFree: true,
      notSubscribed: false,
      isActiveSubscription: false,
    };
  }, [subscriptions, user]);

  if (isLoading) return <RailSkeleton count={3} />;

  const active = subscriptions.filter((item) => item.status !== "cancelled");
  const inactive = subscriptions.filter((item) => item.status === "cancelled");

  const monthlyTotal = active
    .filter((item) => item.interval === "monthly")
    .reduce((total, item) => total + item.price.amount, 0);

  return (
    <div className="space-y-6">
      {/* Primary Active Subscription Plan Card */}
      <Card className="border-accent/40 bg-accent/5">
        <CardHeader
          title={
            <div className="flex flex-wrap items-center gap-2">
              <IconCrown className="size-5 text-accent" />
              <span>Active Subscription Plan</span>
              <Badge tone={activePlanInfo.notSubscribed ? "pending" : activePlanInfo.isFree ? "outline" : "published"} size="sm">
                {activePlanInfo.notSubscribed ? `${activePlanInfo.name} (not subscribed)` : activePlanInfo.name}
              </Badge>
            </div>
          }
          description={
            activePlanInfo.notSubscribed
              ? `Your account has ${activePlanInfo.name === "Nexus Enterprise Plan" ? "Enterprise" : "Business"} role access, but no active paid subscription — subscribe to unlock it.`
              : !activePlanInfo.isFree && activePlanInfo.renewsAt
                ? `Billed ${activePlanInfo.interval} at ${formatCurrency(activePlanInfo.amount, activePlanInfo.currency)} — renews ${formatDate(activePlanInfo.renewsAt, "long")}`
                : activePlanInfo.name === "Nexus Creator Plan"
                  ? "Nexus Creator Plan is active on your account with full Creator Studio, video uploading, and monetization access."
                  : "You are currently watching on the free ad-supported tier. Upgrade to unlock ad-free streaming, 4K HDR, and Family multi-profile switching."
          }
          action={
            <Button variant="primary" size="sm" href="/plans">
              {/* Was `!isFree || notSubscribed` — backwards: that's true for a genuinely
                  active paid subscription (isFree: false, notSubscribed: false), which is
                  exactly the one case where offering to "Subscribe" makes no sense. */}
              {activePlanInfo.isActiveSubscription ? "Change Plan" : "Subscribe"}
            </Button>
          }
        />
        <CardBody className="border-t border-border/50 pt-4">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-fg-muted">
            {activePlanInfo.benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-1.5">
                <IconCheck className="size-3.5 text-success" />
                {benefit}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

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
          description="Premium, Family and Business plans remove advertising and unlock the full Nexus catalogue and tools."
          action={{ label: "View plans", href: "/plans" }}
        />
      ) : null}

      {active.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-fg">Active</h2>
          {active.map((subscription) => (
            <SubscriptionCard
              key={subscription.id}
              subscription={subscription}
              isRealAccount={isRealAccount}
              onCancel={() => setCancelling(subscription)}
            />
          ))}
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

/** Its own component so useChannel() (real/mock-aware — see mock-api's getChannel())
 * can be called once per row without breaking the rules of hooks inside the .map()
 * above. Works for a real channel-membership subscription's real uuid the same way it
 * already does for a mock channel id. */
function SubscriptionCard({
  subscription,
  isRealAccount,
  onCancel,
}: {
  subscription: Subscription;
  isRealAccount: boolean;
  onCancel: () => void;
}) {
  const { data: channel } = useChannel(subscription.channelId ?? "");
  const { toast } = useToast();

  return (
    <Card>
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
              {formatCurrency(subscription.price.amount, subscription.price.currency)}
            </span>
            <span className="block text-2xs text-fg-subtle">
              per {subscription.interval === "monthly" ? "month" : "year"}
            </span>
          </span>
        }
      />
      <CardBody className="space-y-4">
        {channel ? (
          <Link href={`/channel/${channel.id}`} className="flex items-center gap-2.5">
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
            The last payment was declined on {formatDate(subscription.renewsAt)}. Access
            continues for a short grace period.
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
            <Button variant="secondary" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
