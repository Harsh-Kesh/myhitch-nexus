import type { MetadataRoute } from "next";
import { categories } from "@/lib/mock-api/data/categories";
import { channels } from "@/lib/mock-api/data/channels";
import { liveEvents } from "@/lib/mock-api/data/live";
import { videos } from "@/lib/mock-api/data/videos";
import { SITE_URL } from "@/lib/utils";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_URL;

  const now = new Date();

  // Static core routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/explore`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/creators`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/films`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/commercial`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/entertainment`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/education`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/news`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/live`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/search`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/sitemap`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    // Auth routes
    {
      url: `${baseUrl}/auth/login`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/auth/register`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    // Account routes
    {
      url: `${baseUrl}/account/profile`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/account/history`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/account/watchlist`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/account/billing`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/account/subscriptions`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/account/notifications`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/account/settings`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    // Studio routes
    {
      url: `${baseUrl}/studio/dashboard`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/studio/content`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/studio/upload`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/studio/live`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/studio/playlists`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/studio/analytics`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/studio/comments`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/studio/revenue`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/studio/channel-settings`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    // Business routes
    {
      url: `${baseUrl}/business/channel`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/business/campaigns`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/business/campaigns/new`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/business/analytics`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/business/leads`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/business/product-links`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/business/billing`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/business/videos`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    // Admin routes
    {
      url: `${baseUrl}/admin`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/admin/content`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/admin/reviews`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/admin/users`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/admin/organisations`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/admin/audit-logs`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.3,
    },
  ];

  // Dynamic Categories
  const categoryRoutes: MetadataRoute.Sitemap = categories.map((cat) => ({
    url: `${baseUrl}/category/${cat.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Dynamic Channels
  const channelRoutes: MetadataRoute.Sitemap = channels.map((ch) => ({
    url: `${baseUrl}/channel/${ch.id}`,
    lastModified: new Date(ch.joinedAt || now),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Dynamic Videos
  const videoRoutes: MetadataRoute.Sitemap = videos.map((vid) => ({
    url: `${baseUrl}/video/${vid.id}`,
    lastModified: new Date(vid.publishedAt || now),
    changeFrequency: "monthly",
    priority: 0.9,
  }));

  // Dynamic Live Events
  const liveRoutes: MetadataRoute.Sitemap = liveEvents.map((evt) => ({
    url: `${baseUrl}/live/${evt.id}`,
    lastModified: new Date(evt.scheduledStart || now),
    changeFrequency: "hourly",
    priority: evt.status === "live" ? 1.0 : 0.7,
  }));

  return [
    ...staticRoutes,
    ...categoryRoutes,
    ...channelRoutes,
    ...videoRoutes,
    ...liveRoutes,
  ];
}
