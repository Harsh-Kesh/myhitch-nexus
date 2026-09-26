"use client";

import {
  IconChartHistogram,
  IconExternalLink,
  IconEye,
  IconLink,
  IconSpeakerphone,
  IconUsers,
  IconVideo,
} from "@tabler/icons-react";
import Link from "next/link";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge, CampaignStatusBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Poster } from "@/components/video/poster";
import { looksLikeRealId } from "@/lib/mock-api";
import { CHANNEL_KIND_LABELS } from "@/lib/mock-api/data/channels";
import {
  useCampaigns,
  useChannel,
  useChannelVideos,
  useCreatorAnalytics,
  useCurrentUser,
  useLeads,
  useProductLinks,
} from "@/lib/mock-api/hooks";
import {
  compactNumber,
  formatCurrency,
  formatDate,
  formatWatchHours,
  relativeTime,
} from "@/lib/utils";

// Not a plain `?? "ch_helio"` — see business-shell.tsx's header comment on why the
// demo account's own channelId is never actually null by the time it reaches here.
const MOCK_BUSINESS_CHANNEL = "ch_helio";

export default function BusinessChannelPage() {
  const { data: user } = useCurrentUser();
  const channelId =
    user?.channelId && looksLikeRealId(user.channelId) ? user.channelId : MOCK_BUSINESS_CHANNEL;
  const isRealChannel = looksLikeRealId(channelId);

  const { data: channel } = useChannel(channelId);
  // includeUnpublished:true now hits a real, membership-gated endpoint for a real
  // channel (see src/app/api/channels/[id]/videos/route.ts) — shows drafts/pending/
  // scheduled videos here too, not just published ones.
  const { data: videos = [] } = useChannelVideos(channelId, true);
  const { data: analytics } = useCreatorAnalytics(channelId, "28d");
  const { data: campaigns = [] } = useCampaigns(channelId);
  const { data: leads = [] } = useLeads(channelId);
  const { data: productLinks = [] } = useProductLinks(channelId);

  if (!channel) return null;

  const newLeads = leads.filter((lead) => lead.status === "new");
  const activeCampaigns = campaigns.filter((c) => c.status === "active");

  return (
    <>
      <PageHeader
        title="Channel overview"
        description="Your business presence on Nexus at a glance."
        actions={
          <Button variant="secondary" href={`/channel/${channel.id}`}>
            <IconExternalLink />
            View public page
          </Button>
        }
      />

      <PageBody className="space-y-6">
        {isRealChannel ? (
          <Card className="border-warning/30 bg-warning/5">
            <CardBody>
              <p className="text-sm font-medium text-fg">Leads and product links aren&rsquo;t real yet</p>
              <p className="mt-1 text-sm text-fg-muted">
                Your name, branding, published videos and ad campaigns below are all real —
                campaigns launched here really run through real ad serving now (2026-09-25).
                Leads and product links are still simulated (P3 in the build plan) —
                they&rsquo;ll show as empty here until that work lands, not because nothing is
                happening on your account.
              </p>
            </CardBody>
          </Card>
        ) : null}

        {/* Identity */}
        <Card className="overflow-hidden">
          <Poster
            src={channel.bannerUrl}
            alt={channel.name}
            gradient={channel.bannerGradient}
            seed={`${channel.id}-banner`}
            ratio="banner"
            className="h-28 sm:h-36"
          />
          <CardBody className="flex flex-wrap items-center gap-4">
            <Avatar
              name={channel.name}
              gradient={channel.avatarGradient}
              src={channel.avatarUrl}
              size="xl"
              square
              verified={channel.verified}
              className="-mt-12 ring-4 ring-surface"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-lg font-semibold text-fg">
                  {channel.name}
                </p>
                <Badge tone="accent" size="sm">
                  {CHANNEL_KIND_LABELS[channel.kind]}
                </Badge>
                <Badge
                  tone={
                    channel.verificationStatus === "verified"
                      ? "published"
                      : channel.verificationStatus === "pending"
                        ? "pending"
                        : "draft"
                  }
                  size="sm"
                >
                  {channel.verificationStatus}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-fg-muted">{channel.tagline}</p>
              <p className="mt-1 text-xs text-fg-subtle nx-tnum">
                @{channel.handle} · {compactNumber(channel.followers)} followers ·
                joined {formatDate(channel.joinedAt, "long")}
              </p>
            </div>
          </CardBody>
        </Card>

        {/* Stats */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/* getCreatorAnalytics() has had a real branch since the /studio/analytics
              pipeline went live — this page just never stopped hardcoding "not built
              yet" for a real channel after that landed. Same `analytics` query already
              correctly resolves real vs mock internally; no branch needed here at all. */}
          <Stat
            label="Views (28d)"
            value={compactNumber(analytics?.totals.views ?? 0)}
            delta={analytics?.deltas.views}
            icon={<IconEye />}
          />
          <Stat
            label="Watch time"
            value={formatWatchHours(analytics?.totals.watchTimeSeconds ?? 0)}
            delta={analytics?.deltas.watchTime}
            icon={<IconChartHistogram />}
          />
          <Stat
            label="New leads"
            value={String(newLeads.length)}
            hint={`${leads.length} total`}
            icon={<IconUsers />}
          />
          <Stat
            label="Active campaigns"
            value={String(activeCampaigns.length)}
            hint={formatCurrency(
              activeCampaigns.reduce((total, c) => total + c.spend.amount, 0),
              "AUD",
              { compact: true },
            )}
            icon={<IconSpeakerphone />}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Videos */}
          <Card>
            <CardHeader
              title="Recent videos"
              action={
                <Button variant="ghost" size="sm" href="/business/videos">
                  All videos
                </Button>
              }
            />
            <CardBody className="p-0">
              {videos.length ? (
                <ul className="divide-y divide-border">
                  {videos.slice(0, 5).map((video) => (
                    <li key={video.id} className="flex items-center gap-3 px-5 py-3">
                      <span
                        aria-hidden
                        className="h-9 w-16 shrink-0 rounded"
                        style={{
                          backgroundImage: `linear-gradient(140deg, ${video.posterGradient[0]}, ${video.posterGradient[1]})`,
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <Link
                          href={`/video/${video.id}`}
                          className="block truncate text-sm text-fg transition-colors hover:text-accent"
                        >
                          {video.title}
                        </Link>
                        <span className="mt-0.5 block text-2xs text-fg-subtle nx-tnum">
                          {compactNumber(video.views)} views ·{" "}
                          {video.publishedAt ? relativeTime(video.publishedAt) : "—"}
                        </span>
                      </span>
                      <StatusBadge status={video.status} size="sm" />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-5">
                  <EmptyState compact icon={<IconVideo />} title="No videos yet" />
                </div>
              )}
            </CardBody>
          </Card>

          {/* Campaigns */}
          <Card>
            <CardHeader
              title="Campaigns"
              action={
                <Button variant="ghost" size="sm" href="/business/campaigns">
                  Manage
                </Button>
              }
            />
            <CardBody className="p-0">
              {campaigns.length ? (
                <ul className="divide-y divide-border">
                  {campaigns.slice(0, 5).map((campaign) => (
                    <li key={campaign.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">
                          {campaign.name}
                        </span>
                        <span className="mt-0.5 block text-2xs text-fg-subtle nx-tnum">
                          {formatCurrency(campaign.spend.amount, "AUD", {
                            compact: true,
                          })}{" "}
                          of{" "}
                          {formatCurrency(campaign.budget.amount, "AUD", {
                            compact: true,
                          })}
                        </span>
                      </span>
                      <CampaignStatusBadge status={campaign.status} size="sm" />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-5">
                  <EmptyState
                    compact
                    icon={<IconSpeakerphone />}
                    title="No campaigns"
                    action={{ label: "Create one", href: "/business/campaigns/new" }}
                  />
                </div>
              )}
            </CardBody>
          </Card>

          {/* Leads */}
          <Card>
            <CardHeader
              title="Latest leads"
              action={
                <Button variant="ghost" size="sm" href="/business/leads">
                  All leads
                </Button>
              }
            />
            <CardBody className="p-0">
              {leads.length ? (
                <ul className="divide-y divide-border">
                  {leads.slice(0, 5).map((lead) => (
                    <li key={lead.id} className="flex items-center gap-3 px-5 py-3">
                      <Avatar name={lead.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{lead.name}</span>
                        <span className="mt-0.5 block truncate text-2xs text-fg-subtle">
                          {lead.company}
                        </span>
                      </span>
                      <Badge
                        tone={
                          lead.status === "new"
                            ? "accent"
                            : lead.status === "closed"
                              ? "archived"
                              : "info"
                        }
                        size="sm"
                      >
                        {lead.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-5">
                  <EmptyState compact icon={<IconUsers />} title="No leads yet" />
                </div>
              )}
            </CardBody>
          </Card>

          {/* Commerce */}
          <Card>
            <CardHeader
              title="Product links"
              action={
                <Button variant="ghost" size="sm" href="/business/product-links">
                  Manage
                </Button>
              }
            />
            <CardBody className="p-0">
              {productLinks.length ? (
                <ul className="divide-y divide-border">
                  {productLinks.map((link) => (
                    <li key={link.id} className="flex items-center gap-3 px-5 py-3">
                      <IconLink className="size-4 shrink-0 text-fg-subtle" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">
                          {link.productName}
                        </span>
                        <span className="mt-0.5 block text-2xs text-fg-subtle nx-tnum">
                          {compactNumber(link.clicks)} clicks ·{" "}
                          {compactNumber(link.conversions)} conversions
                        </span>
                      </span>
                      <span className="shrink-0 text-sm text-fg nx-tnum">
                        {formatCurrency(link.price.amount, link.price.currency, {
                          compact: true,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-5">
                  <EmptyState compact icon={<IconLink />} title="No product links yet" />
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
