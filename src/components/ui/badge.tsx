"use client";

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import type {
  CampaignStatus,
  ContentStatus,
  MagazineStatus,
  SponsorshipListingStatus,
} from "@/lib/mock-api/types";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-surface-3 text-fg-muted",
        accent: "bg-accent-soft text-accent",
        live: "bg-live-soft text-live",
        success: "bg-success/15 text-success",
        warning: "bg-warning/15 text-warning",
        danger: "bg-danger/15 text-danger",
        info: "bg-info/15 text-info",
        draft: "bg-status-draft/15 text-status-draft",
        pending: "bg-status-pending/15 text-status-pending",
        published: "bg-status-published/15 text-status-published",
        scheduled: "bg-status-scheduled/15 text-status-scheduled",
        restricted: "bg-status-restricted/15 text-status-restricted",
        rejected: "bg-status-rejected/15 text-status-rejected",
        archived: "bg-status-archived/15 text-status-archived",
        private: "bg-status-private/15 text-status-private",
        unlisted: "bg-status-unlisted/15 text-status-unlisted",
        outline: "border border-border-strong text-fg-muted",
      },
      size: {
        sm: "h-5 px-2 text-2xs",
        md: "h-6 px-2.5 text-xs",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

/* --------------------------- Content status ----------------------------- */

const CONTENT_STATUS: Record<
  ContentStatus,
  { label: string; tone: NonNullable<BadgeProps["tone"]> }
> = {
  draft: { label: "Draft", tone: "draft" },
  pending: { label: "Pending review", tone: "pending" },
  published: { label: "Published", tone: "published" },
  scheduled: { label: "Scheduled", tone: "scheduled" },
  private: { label: "Private", tone: "private" },
  unlisted: { label: "Unlisted", tone: "unlisted" },
  restricted: { label: "Restricted", tone: "restricted" },
  rejected: { label: "Rejected", tone: "rejected" },
  archived: { label: "Archived", tone: "archived" },
};

export function StatusBadge({
  status,
  size,
  className,
}: {
  status: ContentStatus;
  size?: BadgeProps["size"];
  className?: string;
}) {
  const config = CONTENT_STATUS[status];
  return (
    <Badge tone={config.tone} size={size} className={className}>
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-current"
      />
      {config.label}
    </Badge>
  );
}

const CAMPAIGN_STATUS: Record<
  CampaignStatus,
  { label: string; tone: NonNullable<BadgeProps["tone"]> }
> = {
  draft: { label: "Draft", tone: "draft" },
  pending: { label: "Pending approval", tone: "pending" },
  active: { label: "Active", tone: "published" },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Completed", tone: "archived" },
  rejected: { label: "Rejected", tone: "rejected" },
};

export function CampaignStatusBadge({
  status,
  size,
}: {
  status: CampaignStatus;
  size?: BadgeProps["size"];
}) {
  const config = CAMPAIGN_STATUS[status];
  return (
    <Badge tone={config.tone} size={size}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {config.label}
    </Badge>
  );
}

const MAGAZINE_STATUS: Record<
  MagazineStatus,
  { label: string; tone: NonNullable<BadgeProps["tone"]> }
> = {
  draft: { label: "Draft", tone: "draft" },
  submitted: { label: "In review", tone: "pending" },
  changes_requested: { label: "Changes requested", tone: "warning" },
  published: { label: "Published", tone: "published" },
  rejected: { label: "Rejected", tone: "rejected" },
  withdrawn: { label: "Withdrawn", tone: "archived" },
};

export function MagazineStatusBadge({
  status,
  size,
}: {
  status: MagazineStatus;
  size?: BadgeProps["size"];
}) {
  const config = MAGAZINE_STATUS[status];
  return (
    <Badge tone={config.tone} size={size}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {config.label}
    </Badge>
  );
}

const SPONSORSHIP_LISTING_STATUS: Record<
  SponsorshipListingStatus,
  { label: string; tone: NonNullable<BadgeProps["tone"]> }
> = {
  draft: { label: "Draft", tone: "draft" },
  // Not "In review" — there's no reviewer on either side yet (Connect doesn't exist).
  // "Submitted" is the honest description of this terminal state.
  submitted: { label: "Submitted", tone: "pending" },
  changes_requested: { label: "Changes requested", tone: "warning" },
  published: { label: "Published", tone: "published" },
  rejected: { label: "Rejected", tone: "rejected" },
  withdrawn: { label: "Withdrawn", tone: "archived" },
  closed: { label: "Closed", tone: "archived" },
};

export function SponsorshipListingStatusBadge({
  status,
  size,
}: {
  status: SponsorshipListingStatus;
  size?: BadgeProps["size"];
}) {
  const config = SPONSORSHIP_LISTING_STATUS[status];
  return (
    <Badge tone={config.tone} size={size}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {config.label}
    </Badge>
  );
}

/** On-air indicator. The pulse is the only animated badge in the system. */
export function LiveBadge({
  size = "md",
  label = "Live",
  className,
}: {
  size?: BadgeProps["size"];
  label?: string;
  className?: string;
}) {
  return (
    <Badge
      tone="live"
      size={size}
      className={cn("uppercase tracking-wide font-semibold", className)}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-live animate-live-pulse"
      />
      {label}
    </Badge>
  );
}
