import { hashString, seededRandom } from "@/lib/utils";
import type {
  AnalyticsRange,
  BreakdownSlice,
  CreatorAnalytics,
  RetentionPoint,
  RevenueSummary,
  TimeSeriesPoint,
} from "../types";
import { channelById } from "./channels";
import { NOW, videos } from "./videos";

export const RANGE_DAYS: Record<AnalyticsRange, number> = {
  "7d": 7,
  "28d": 28,
  "90d": 90,
  "365d": 365,
};

export const RANGE_LABELS: Record<AnalyticsRange, string> = {
  "7d": "Last 7 days",
  "28d": "Last 28 days",
  "90d": "Last 90 days",
  "365d": "Last 12 months",
};

function shareOut(
  entries: Array<[string, number]>,
): BreakdownSlice[] {
  const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
  return entries
    .map(([label, value]) => ({
      label,
      value,
      share: Number(((value / total) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Deterministic series generator. Given the same channel + range it always
 * returns the same numbers, so charts do not reshuffle between renders and
 * server/client output matches.
 */
function buildTimeSeries(
  channelId: string,
  range: AnalyticsRange,
  baseDaily: number,
): TimeSeriesPoint[] {
  const days = RANGE_DAYS[range];
  const step = days > 90 ? 7 : 1;
  const points: TimeSeriesPoint[] = [];
  const random = seededRandom(hashString(`${channelId}:${range}`));

  for (let i = days; i > 0; i -= step) {
    const date = new Date(NOW.getTime() - i * 86_400_000);
    // Weekly rhythm (weekends up) + a slow upward drift + bounded noise.
    const weekday = date.getUTCDay();
    const weekendLift = weekday === 0 || weekday === 6 ? 1.22 : 1;
    const drift = 1 + ((days - i) / days) * 0.28;
    const noise = 0.82 + random() * 0.36;
    const views = Math.round(baseDaily * step * weekendLift * drift * noise);
    points.push({
      date: date.toISOString().slice(0, 10),
      views,
      watchHours: Math.round((views * 480) / 3600),
      uniqueViewers: Math.round(views * 0.68),
      revenue: Math.round(views * (2.4 + random() * 1.4)),
    });
  }
  return points;
}

function buildRetention(channelId: string, completion: number): RetentionPoint[] {
  const random = seededRandom(hashString(`${channelId}:retention`));
  const points: RetentionPoint[] = [];
  for (let percent = 0; percent <= 100; percent += 2) {
    // Steep drop in the first 10%, then a shallow slope to the completion rate.
    const intro = Math.exp(-percent / 14) * 22;
    const body = (100 - intro) * (1 - (percent / 100) * (1 - completion / 100));
    const noise = (random() - 0.5) * 2.4;
    const audience = Math.max(4, Math.min(100, body + noise));
    points.push({ percent, audience: Number(audience.toFixed(1)) });
  }
  return points;
}

export function buildCreatorAnalytics(
  channelId: string,
  range: AnalyticsRange = "28d",
): CreatorAnalytics {
  const channel = channelById(channelId);
  const channelVideos = videos.filter(
    (video) => video.channelId === channelId && video.status === "published",
  );
  const random = seededRandom(hashString(`${channelId}:${range}:totals`));
  const days = RANGE_DAYS[range];
  const baseDaily = Math.max(
    400,
    Math.round((channel?.totalViews ?? 1_000_000) / 900),
  );

  const timeSeries = buildTimeSeries(channelId, range, baseDaily);
  const views = timeSeries.reduce((total, point) => total + point.views, 0);
  const watchHours = timeSeries.reduce(
    (total, point) => total + point.watchHours,
    0,
  );
  const uniqueViewers = timeSeries.reduce(
    (total, point) => total + point.uniqueViewers,
    0,
  );
  const revenueMinor = timeSeries.reduce(
    (total, point) => total + point.revenue,
    0,
  );

  const completionRate = channelVideos.length
    ? Number(
        (
          channelVideos.reduce((total, v) => total + v.completionRate, 0) /
          channelVideos.length
        ).toFixed(1),
      )
    : 52;

  const revenueByContent = [...channelVideos]
    .sort((a, b) => b.views - a.views)
    .slice(0, 8)
    .map((video, index) => ({
      videoId: video.id,
      title: video.title,
      revenue: Math.round(
        (revenueMinor * (0.34 - index * 0.035)) * (0.85 + random() * 0.3),
      ),
      views: Math.round(video.views * (days / 365)),
      model: video.pricing.accessModels[0] ?? ("free" as const),
    }))
    .filter((row) => row.revenue > 0);

  return {
    channelId,
    range,
    totals: {
      views,
      uniqueViewers,
      watchTimeSeconds: watchHours * 3600,
      completionRate,
      averageViewDuration: Math.round((watchHours * 3600) / Math.max(views, 1)),
      subscribersGained: Math.round(views * 0.0042),
      subscribersLost: Math.round(views * 0.0009),
      revenue: { amount: revenueMinor, currency: "GBP" },
    },
    deltas: {
      views: Number((6.2 + random() * 9).toFixed(1)),
      watchTime: Number((4.1 + random() * 7).toFixed(1)),
      revenue: Number((-2 + random() * 16).toFixed(1)),
      uniqueViewers: Number((3.4 + random() * 8).toFixed(1)),
    },
    timeSeries,
    retention: buildRetention(channelId, completionRate),
    trafficSources: shareOut([
      ["Nexus home & rails", Math.round(views * 0.31)],
      ["Search", Math.round(views * 0.22)],
      ["Channel page", Math.round(views * 0.14)],
      ["External & shares", Math.round(views * 0.13)],
      ["Suggested video", Math.round(views * 0.12)],
      ["Notifications", Math.round(views * 0.08)],
    ]),
    countries: shareOut([
      ["United Kingdom", Math.round(views * 0.38)],
      ["United States", Math.round(views * 0.17)],
      ["Germany", Math.round(views * 0.11)],
      ["Ireland", Math.round(views * 0.08)],
      ["Portugal", Math.round(views * 0.06)],
      ["Sri Lanka", Math.round(views * 0.05)],
      ["Other", Math.round(views * 0.15)],
    ]),
    languages: shareOut([
      ["English", Math.round(views * 0.72)],
      ["German", Math.round(views * 0.11)],
      ["Portuguese", Math.round(views * 0.06)],
      ["Spanish", Math.round(views * 0.05)],
      ["Sinhala", Math.round(views * 0.03)],
      ["Other", Math.round(views * 0.03)],
    ]),
    devices: shareOut([
      ["Mobile", Math.round(views * 0.46)],
      ["Desktop", Math.round(views * 0.24)],
      ["Connected TV", Math.round(views * 0.21)],
      ["Tablet", Math.round(views * 0.09)],
    ]),
    revenueByContent,
    adPerformance: {
      impressions: Math.round(views * 1.42),
      fillRate: Number((88 + random() * 9).toFixed(1)),
      ecpm: Number((3.1 + random() * 2.2).toFixed(2)),
      revenue: Math.round(revenueMinor * 0.42),
    },
    topVideos: [...channelVideos]
      .sort((a, b) => b.views - a.views)
      .slice(0, 6)
      .map((video) => ({
        videoId: video.id,
        title: video.title,
        views: Math.round(video.views * (days / 365)),
        watchHours: Math.round(
          (video.views * (days / 365) * video.durationSeconds * 0.5) / 3600,
        ),
        completionRate: video.completionRate,
      })),
  };
}

export function buildRevenueSummary(channelId: string): RevenueSummary {
  const random = seededRandom(hashString(`${channelId}:revenue`));
  const analytics = buildCreatorAnalytics(channelId, "28d");
  const lifetime = Math.round(analytics.totals.revenue.amount * 26);
  const available = Math.round(analytics.totals.revenue.amount * 0.62);
  const pending = Math.round(analytics.totals.revenue.amount * 0.38);

  const kinds: Array<RevenueSummary["transactions"][number]["kind"]> = [
    "advertising",
    "rental",
    "purchase",
    "membership",
    "ppv",
  ];

  const transactions: RevenueSummary["transactions"] = Array.from(
    { length: 14 },
    (_, index) => {
      const kind =
        index === 3 || index === 11 ? "payout" : kinds[index % kinds.length];
      const gross =
        kind === "payout"
          ? -Math.round(available * 0.4)
          : Math.round(4_000 + random() * 180_000);
      const fee = kind === "payout" ? 0 : Math.round(gross * 0.3);
      return {
        id: `txn_${(1200 - index).toString()}`,
        date: new Date(
          new Date("2026-08-12T10:00:00.000Z").getTime() -
            index * 2 * 86_400_000,
        ).toISOString(),
        description:
          kind === "payout"
            ? "Payout to bank account ••••4417"
            : kind === "advertising"
              ? "Advertising revenue share"
              : kind === "rental"
                ? "Sponsorship deal (MYHitch Connect)"
                : kind === "purchase"
                  ? "Live stream ticket (MYHitch Pass)"
                  : kind === "membership"
                    ? "Channel membership & fan tips"
                    : "Pay-Per-View event (MYHitch Pass)",
        kind,
        gross,
        fee,
        net: gross - fee,
      };
    },
  );

  return {
    channelId,
    currency: "GBP",
    available,
    pending,
    lifetime,
    nextPayoutDate: "2026-08-28T00:00:00.000Z",
    byStream: shareOut([
      ["Advertising revenue share", Math.round(lifetime * 0.38)],
      ["Sponsorships (MYHitch Connect)", Math.round(lifetime * 0.28)],
      ["Live Tickets (MYHitch Pass)", Math.round(lifetime * 0.16)],
      ["Pay-Per-View (MYHitch Pass)", Math.round(lifetime * 0.10)],
      ["Fan Subscriptions & Tips", Math.round(lifetime * 0.08)],
    ]),
    transactions,
  };
}

export function buildCampaignSeries(campaignId: string, days = 28) {
  const random = seededRandom(hashString(campaignId));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(NOW.getTime() - (days - index) * 86_400_000);
    const impressions = Math.round(380_000 * (0.7 + random() * 0.6));
    const clicks = Math.round(impressions * (0.018 + random() * 0.014));
    return {
      date: date.toISOString().slice(0, 10),
      impressions,
      completedViews: Math.round(impressions * (0.56 + random() * 0.12)),
      clicks,
      conversions: Math.round(clicks * (0.03 + random() * 0.02)),
      spend: Math.round(impressions * (0.35 + random() * 0.12)),
    };
  });
}

export function buildAdminTrend(days = 30) {
  const random = seededRandom(hashString("admin-trend"));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(NOW.getTime() - (days - index) * 86_400_000);
    return {
      date: date.toISOString().slice(0, 10),
      reviews: Math.round(40 + random() * 60),
      reports: Math.round(12 + random() * 34),
    };
  });
}
