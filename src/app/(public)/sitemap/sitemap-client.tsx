"use client";

import {
  IconArrowUpRight,
  IconBriefcase,
  IconBroadcast,
  IconCompass,
  IconFileCode,
  IconMovie,
  IconSearch,
  IconShieldLock,
  IconUser,
  IconVideo,
} from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { CONTENT_TYPE_LABELS, categories } from "@/lib/mock-api/data/categories";
import { channels } from "@/lib/mock-api/data/channels";
import { liveEvents } from "@/lib/mock-api/data/live";
import { videos } from "@/lib/mock-api/data/videos";

interface SiteSection {
  title: string;
  description: string;
  icon: React.ReactNode;
  links: Array<{
    label: string;
    href: string;
    description?: string;
    badge?: string;
    badgeTone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
  }>;
}

const STATIC_SECTIONS: SiteSection[] = [
  {
    title: "Discovery & Main Hub",
    description: "Primary viewer destinations and top-level content hubs.",
    icon: <IconCompass className="size-5 text-accent" />,
    links: [
      { label: "Home Page", href: "/", description: "Featured carousels, trending titles and platform highlights" },
      { label: "Explore & Browse", href: "/explore", description: "Filterable video catalogue and genre rails" },
      { label: "Films & Cinema", href: "/films", description: "Independent features, shorts and cinematic releases" },
      { label: "Commercial & Brand", href: "/commercial", description: "Brand films, product launches and commercial showcases" },
      { label: "Entertainment", href: "/entertainment", description: "Comedy specials, series and entertainment programming" },
      { label: "Education & Skills", href: "/education", description: "Masterclasses, tutorials and skill courses" },
      { label: "News & Bulletins", href: "/news", description: "Current affairs, municipal briefings and reports" },
      { label: "Live Hub", href: "/live", description: "Real-time broadcasts, interactive streams and replays", badge: "Live", badgeTone: "accent" },
      { label: "Global Search", href: "/search", description: "Universal search across titles, channels and tags" },
    ],
  },
  {
    title: "Creator Studio",
    description: "Full suite for video creators, production studios and streamers.",
    icon: <IconVideo className="size-5 text-accent" />,
    links: [
      { label: "Studio Dashboard", href: "/studio/dashboard", description: "Channel health, recent uploads and quick actions" },
      { label: "Upload & Ingestion", href: "/studio/upload", description: "Multi-track video uploader, pricing and rights manager" },
      { label: "Content Manager", href: "/studio/content", description: "Full video library, statuses and metadata editor" },
      { label: "Live Control Room", href: "/studio/live", description: "RTMP stream key, broadcast schedule and polls manager" },
      { label: "Playlists & Series", href: "/studio/playlists", description: "Curate playlists, episodic series and collections" },
      { label: "Channel Analytics", href: "/studio/analytics", description: "Views, watch time, retention graphs and demographics" },
      { label: "Community & Comments", href: "/studio/comments", description: "Moderate comments, heart replies and held reviews" },
      { label: "Monetization & Payouts", href: "/studio/revenue", description: "PPV earnings, subscriptions, rental splits and payouts" },
      { label: "Channel Settings", href: "/studio/channel-settings", description: "Branding, custom handle, links and permissions" },
    ],
  },
  {
    title: "Business & Commerce",
    description: "Brand promotion, ad campaigns, affiliate links and lead generation.",
    icon: <IconBriefcase className="size-5 text-accent" />,
    links: [
      { label: "Business Hub", href: "/business/channel", description: "Organisation profile, verification and business branding" },
      { label: "Campaigns Overview", href: "/business/campaigns", description: "Active campaigns, impressions, CTR and budget tracking" },
      { label: "New Ad Campaign", href: "/business/campaigns/new", description: "Campaign creator, objective selection and targeting" },
      { label: "Performance Analytics", href: "/business/analytics", description: "Detailed attribution, conversion funnel and ROI" },
      { label: "Product Links (Mart)", href: "/business/product-links", description: "Shoppable video markers linked to eCommerce items" },
      { label: "Lead Gen & Enquiries", href: "/business/leads", description: "Inbound customer leads captured from video CTAs" },
      { label: "Sponsored Videos", href: "/business/videos", description: "Brand-backed titles and partner integrations" },
      { label: "Billing & Invoices", href: "/business/billing", description: "Payment methods, invoices, VAT statements and spend" },
    ],
  },
  {
    title: "User Account & Library",
    description: "Personal playback preferences, subscriptions, history and transactions.",
    icon: <IconUser className="size-5 text-accent" />,
    links: [
      { label: "Account Profile", href: "/account/profile", description: "User details, public badge and display preferences" },
      { label: "Watch History", href: "/account/history", description: "Recently watched titles and resume playback markers" },
      { label: "My Watchlist", href: "/account/watchlist", description: "Saved titles queued for future viewing" },
      { label: "Billing", href: "/account/billing", description: "Plan payment history and downloadable receipts" },
      { label: "Subscriptions", href: "/account/subscriptions", description: "Manage your Nexus Premium, Family or Business plan" },
      { label: "Notifications", href: "/account/notifications", description: "Live alerts, comment replies and upload updates" },
      { label: "Security & Settings", href: "/account/settings", description: "Playback quality, data, password and sessions" },
      { label: "Log In", href: "/auth/login", description: "Account authentication portal" },
      { label: "Register", href: "/auth/register", description: "New member registration form" },
    ],
  },
  {
    title: "Platform Administration",
    description: "Trust & Safety moderation, audit logging and system governance.",
    icon: <IconShieldLock className="size-5 text-accent" />,
    links: [
      { label: "Admin Console Overview", href: "/admin", description: "Platform metrics, ingest queues and open incident alerts" },
      { label: "Content Moderation", href: "/admin/content", description: "Takedown notices, flag review and content ratings" },
      { label: "Verification Reviews", href: "/admin/reviews", description: "Channel KYC and official studio verification queue" },
      { label: "User Management", href: "/admin/users", description: "User accounts, role assignment and suspension tools" },
      { label: "Organisations Registry", href: "/admin/organisations", description: "Corporate and institutional partner accounts" },
      { label: "Audit & Security Logs", href: "/admin/audit-logs", description: "Immutable action trail for compliance and security" },
    ],
  },
];

export function SitemapClient() {
  const [query, setQuery] = React.useState("");

  const filteredSections = React.useMemo(() => {
    if (!query.trim()) return STATIC_SECTIONS;
    const q = query.toLowerCase();

    return STATIC_SECTIONS.map((section) => ({
      ...section,
      links: section.links.filter(
        (link) =>
          link.label.toLowerCase().includes(q) ||
          link.description?.toLowerCase().includes(q) ||
          link.href.toLowerCase().includes(q),
      ),
    })).filter((section) => section.links.length > 0);
  }, [query]);

  const filteredCategories = React.useMemo(() => {
    if (!query.trim()) return categories;
    const q = query.toLowerCase();
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q),
    );
  }, [query]);

  const filteredChannels = React.useMemo(() => {
    if (!query.trim()) return channels;
    const q = query.toLowerCase();
    return channels.filter(
      (ch) =>
        ch.name.toLowerCase().includes(q) ||
        ch.handle.toLowerCase().includes(q) ||
        ch.tagline.toLowerCase().includes(q),
    );
  }, [query]);

  const totalPages =
    STATIC_SECTIONS.reduce((acc, s) => acc + s.links.length, 0) +
    categories.length +
    channels.length +
    videos.length +
    liveEvents.length;

  return (
    <div className="mx-auto max-w-[110rem] px-4 py-8 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-surface via-surface-2 to-surface-3 p-6 sm:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">Directory</Badge>
              <Badge tone="neutral">{totalPages} indexed routes</Badge>
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
              Platform Sitemap
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted sm:text-base">
              A comprehensive navigation directory of all public hubs, creator
              tools, business interfaces, categories, and channels across MYHitch
              Nexus.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/sitemap.xml"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "secondary" })}
            >
              <IconFileCode />
              View sitemap.xml
              <IconArrowUpRight className="size-3.5 opacity-70" />
            </a>
            <Button variant="primary" href="/explore">
              <IconCompass />
              Browse Catalogue
            </Button>
          </div>
        </div>

        {/* Quick Search */}
        <div className="mt-8 max-w-md">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter pages, categories, channels…"
            leading={<IconSearch className="size-4 text-fg-subtle" />}
          />
        </div>
      </div>

      {/* Main Core Sections */}
      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredSections.map((section) => (
          <Card key={section.title} className="flex flex-col">
            <CardHeader className="border-b border-border/70 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface-2">
                  {section.icon}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-fg">
                    {section.title}
                  </h2>
                  <p className="text-xs text-fg-subtle">
                    {section.links.length} routes
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardBody className="flex-1 p-0">
              <ul className="divide-y divide-border/40">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="group flex flex-col px-4 py-3 transition-colors hover:bg-surface-2/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-fg group-hover:text-accent">
                          {link.label}
                        </span>
                        {link.badge ? (
                          <Badge tone={link.badgeTone || "neutral"} size="sm">
                            {link.badge}
                          </Badge>
                        ) : null}
                      </div>
                      {link.description ? (
                        <p className="mt-0.5 text-xs text-fg-subtle">
                          {link.description}
                        </p>
                      ) : null}
                      <span className="mt-1 font-mono text-2xs text-fg-subtle">
                        {link.href}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Dynamic Categories Section */}
      <div className="mt-12">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <IconMovie className="size-5 text-accent" />
            <h2 className="font-display text-xl font-semibold text-fg">
              Categories & Genres
            </h2>
            <Badge tone="neutral" size="sm">
              {filteredCategories.length}
            </Badge>
          </div>
          <Link
            href="/explore"
            className="text-xs text-accent transition-colors hover:underline"
          >
            Explore all →
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredCategories.map((cat) => (
            <Link
              key={cat.id}
              href={`/category/${cat.slug}`}
              className="group rounded-xl border border-border bg-surface-2 p-3.5 transition-all hover:border-accent/40 hover:bg-surface-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm text-fg group-hover:text-accent">
                  {cat.name}
                </p>
                <Badge tone="outline" size="sm">
                  {CONTENT_TYPE_LABELS[cat.contentType]}
                </Badge>
              </div>
              <p className="mt-1.5 nx-clamp-2 text-xs text-fg-muted">
                {cat.description}
              </p>
              <span className="mt-2 block font-mono text-2xs text-fg-subtle">
                /category/{cat.slug}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Featured Channels Section */}
      <div className="mt-12">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <IconBroadcast className="size-5 text-accent" />
            <h2 className="font-display text-xl font-semibold text-fg">
              Channels & Creators
            </h2>
            <Badge tone="neutral" size="sm">
              {filteredChannels.length}
            </Badge>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredChannels.map((ch) => (
            <Link
              key={ch.id}
              href={`/channel/${ch.id}`}
              className="group rounded-xl border border-border bg-surface-2 p-3.5 transition-all hover:border-accent/40 hover:bg-surface-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm text-fg group-hover:text-accent truncate">
                  {ch.name}
                </p>
                {ch.verified ? (
                  <Badge tone="accent" size="sm">
                    Verified
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-2xs text-fg-subtle">@{ch.handle}</p>
              <p className="mt-1.5 nx-clamp-2 text-xs text-fg-muted">
                {ch.tagline}
              </p>
              <span className="mt-2 block font-mono text-2xs text-fg-subtle">
                /channel/{ch.id}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
