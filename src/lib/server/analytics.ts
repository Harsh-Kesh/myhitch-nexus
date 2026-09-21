// Server-only. Real creator analytics (FR-6.9), first slice — built entirely from data
// that's already real: watch_progress (the existing playback heartbeat) and
// commissions.ts's revenue ledger. No new event pipeline, no new client instrumentation.
//
// Known, deliberate simplifications, all a consequence of watch_progress being a single
// UPDATE-overwritten row per (account, video) rather than a session/event log (see its
// own migration comment):
//   - "views"/"unique viewers" are the same number — one row per account per video, by
//     construction, so a real rewatch or multiple sessions can't be told apart from one.
//   - "watch time" and "retention" are both derived from each viewer's *latest* recorded
//     position, not a true per-session curve — a fair proxy for normal linear viewing,
//     an understatement for anyone who rewound and stopped early.
//   - the time series buckets by `updated_at` (last-watched date), not first-viewed date.
//   - only signed-in accounts are counted — there's no anonymous/guest view tracking at
//     all today.
// Country/device/language are captured for real too (src/lib/server/requestMeta.ts),
// from the Cloudflare `cf-ipcountry` header plus User-Agent/Accept-Language — free,
// no vendor, no new client instrumentation, piggybacking on the same heartbeat write.
// Each breakdown is suppressed (returned empty) when the range's total audience is below
// MIN_AUDIENCE_FOR_BREAKDOWN, and any individual slice smaller than MIN_SLICE_SIZE is
// folded into "Other / unknown" rather than shown alone — FR-6.9.6's k-anonymity
// requirement, so a single viewer's country/device is never identifiable from the chart.
// Traffic sources, ad performance and "subscribers lost" still have no real data source
// (no referrer-attributed event, no ad system, and unfollowing deletes the row rather
// than logging it) — deliberately left out rather than fabricated; see the route/UI layer
// for how that's surfaced honestly.
import "server-only";
import { query, queryOne } from "./db";
import { computeChannelNetRevenue } from "./commissions";

export type AnalyticsRange = "7d" | "28d" | "90d" | "365d";

const RANGE_DAYS: Record<AnalyticsRange, number> = { "7d": 7, "28d": 28, "90d": 90, "365d": 365 };

export interface RealAnalyticsTotals {
  views: number;
  uniqueViewers: number;
  watchTimeSeconds: number;
  completionRate: number;
  averageViewDuration: number;
  subscribersGained: number;
  revenueMinor: number;
  currency: string;
}

export interface RealAnalyticsDeltas {
  // null: the prior period had zero activity, so there's no real percentage to compute
  // — see pctChange()'s own comment.
  views: number | null;
  watchTime: number | null;
  revenue: number | null;
  uniqueViewers: number | null;
}

export interface RealTimeSeriesPoint {
  date: string;
  views: number;
  watchHours: number;
  uniqueViewers: number;
  revenueMinor: number;
}

export interface RealRetentionPoint {
  percent: number;
  audience: number;
}

export interface RealVideoRow {
  videoId: string;
  title: string;
  views: number;
  watchHours: number;
  completionRate: number;
}

export interface RealRevenueByContent {
  videoId: string;
  title: string;
  revenueMinor: number;
  views: number;
  model: string;
}

export interface RealBreakdownSlice {
  label: string;
  value: number;
  share: number;
}

export interface RealCreatorAnalytics {
  channelId: string;
  range: AnalyticsRange;
  currency: string;
  totals: RealAnalyticsTotals;
  deltas: RealAnalyticsDeltas;
  timeSeries: RealTimeSeriesPoint[];
  retention: RealRetentionPoint[];
  topVideos: RealVideoRow[];
  revenueByContent: RealRevenueByContent[];
  countries: RealBreakdownSlice[];
  devices: RealBreakdownSlice[];
  languages: RealBreakdownSlice[];
}

// FR-6.9.6: never show a breakdown at all below this total range audience, and never
// show an individual slice smaller than this alone — both fold into "Other / unknown"
// instead, so no chart can single out one real viewer.
const MIN_AUDIENCE_FOR_BREAKDOWN = 5;
const MIN_SLICE_SIZE = 3;

async function fetchAudienceCounts(
  channelId: string,
  column: "country" | "device_type" | "language",
  since: Date,
): Promise<Array<{ label: string; n: number }>> {
  const rows = await query<{ label: string | null; n: string }>(
    `select wp.${column} as label, count(*) as n
     from watch_progress wp
     join videos v on v.id = wp.video_id
     where v.channel_id = $1 and wp.updated_at >= $2
     group by wp.${column}`,
    [channelId, since],
  );
  return rows.map((row) => ({ label: row.label ?? "Unknown", n: Number(row.n) }));
}

function buildSuppressedBreakdown(rows: Array<{ label: string; n: number }>): RealBreakdownSlice[] {
  const total = rows.reduce((sum, row) => sum + row.n, 0);
  if (total < MIN_AUDIENCE_FOR_BREAKDOWN) return [];

  let otherCount = 0;
  const kept: Array<{ label: string; n: number }> = [];
  for (const row of rows) {
    if (row.label === "Unknown" || row.n < MIN_SLICE_SIZE) {
      otherCount += row.n;
    } else {
      kept.push(row);
    }
  }
  kept.sort((a, b) => b.n - a.n);

  const slices: RealBreakdownSlice[] = kept.map((row) => ({
    label: row.label,
    value: row.n,
    share: Math.round((row.n / total) * 100),
  }));
  if (otherCount > 0) {
    slices.push({
      label: "Other / unknown",
      value: otherCount,
      share: Math.round((otherCount / total) * 100),
    });
  }
  return slices;
}

interface VideoAggRow {
  video_id: string;
  title: string;
  duration_seconds: number;
  views: string;
  watch_seconds: string;
  completed_count: string;
}

async function aggregateVideoStats(channelId: string, since: Date, until: Date): Promise<VideoAggRow[]> {
  return query<VideoAggRow>(
    `select v.id as video_id, v.title, v.duration_seconds,
            count(wp.account_id) as views,
            coalesce(sum(wp.position_seconds), 0) as watch_seconds,
            coalesce(sum(case when wp.completed then 1 else 0 end), 0) as completed_count
     from videos v
     left join watch_progress wp
       on wp.video_id = v.id and wp.updated_at >= $2 and wp.updated_at < $3
     where v.channel_id = $1
     group by v.id, v.title, v.duration_seconds`,
    [channelId, since, until],
  );
}

function sumTotals(rows: VideoAggRow[]) {
  let views = 0;
  let watchSeconds = 0;
  let completed = 0;
  for (const row of rows) {
    views += Number(row.views);
    watchSeconds += Number(row.watch_seconds);
    completed += Number(row.completed_count);
  }
  return { views, watchSeconds, completed };
}

/** A flat "100%" for "went from zero to something" was real data with a misleading
 * label — mathematically that's an undefined/infinite percentage, not a doubling, and
 * looked identical to a real "genuinely doubled" 100% change. null distinguishes "no
 * baseline to compare against" from an actual computed number; the UI (Stat, in
 * card.tsx) renders that as "New" instead of a percentage. Both activity periods being
 * zero is a real, distinct 0% change (nothing happened, in either period). */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function getRealCreatorAnalytics(
  channelId: string,
  range: AnalyticsRange,
): Promise<RealCreatorAnalytics> {
  const days = RANGE_DAYS[range];
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);
  const priorSince = new Date(since.getTime() - days * 86_400_000);

  const [currentRows, priorRows, subscriberRow, retentionRows, seriesRows, revenue, countryRows, deviceRows, languageRows] =
    await Promise.all([
      aggregateVideoStats(channelId, since, now),
      aggregateVideoStats(channelId, priorSince, since),
      queryOne<{ n: string }>(
        `select count(*) as n from channel_follows where organization_id = $1 and created_at >= $2`,
        [channelId, since],
      ),
      query<{ position_seconds: number; duration_seconds: number }>(
        `select wp.position_seconds, v.duration_seconds
       from watch_progress wp
       join videos v on v.id = wp.video_id
       where v.channel_id = $1 and wp.updated_at >= $2 and v.duration_seconds > 0`,
        [channelId, since],
      ),
      query<{ day: string; views: string; watch_seconds: string }>(
        `select date_trunc('day', wp.updated_at) as day,
              count(*) as views,
              coalesce(sum(wp.position_seconds), 0) as watch_seconds
       from watch_progress wp
       join videos v on v.id = wp.video_id
       where v.channel_id = $1 and wp.updated_at >= $2
       group by day
       order by day`,
        [channelId, since],
      ),
      computeChannelNetRevenue(channelId),
      fetchAudienceCounts(channelId, "country", since),
      fetchAudienceCounts(channelId, "device_type", since),
      fetchAudienceCounts(channelId, "language", since),
    ]);

  const current = sumTotals(currentRows);
  const prior = sumTotals(priorRows);

  const rangeRevenueEntries = revenue.entries.filter((e) => new Date(e.createdAt) >= since);
  const priorRevenueEntries = revenue.entries.filter(
    (e) => new Date(e.createdAt) >= priorSince && new Date(e.createdAt) < since,
  );
  const rangeRevenueMinor = rangeRevenueEntries.reduce((sum, e) => sum + e.netMinor, 0);
  const priorRevenueMinor = priorRevenueEntries.reduce((sum, e) => sum + e.netMinor, 0);

  // Retention: bucket each viewer's latest recorded position into deciles of that
  // video's duration, then express each decile as "% of viewers who got at least this
  // far" — the standard shape of a retention curve, approximated from a single
  // last-known-position per viewer rather than a true per-session curve (see module
  // header).
  const DECILES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const retention: RealRetentionPoint[] = DECILES.map((percent) => {
    if (retentionRows.length === 0) return { percent, audience: 0 };
    const reached = retentionRows.filter(
      (r) => r.duration_seconds > 0 && r.position_seconds / r.duration_seconds >= percent / 100,
    ).length;
    return { percent, audience: Math.round((reached / retentionRows.length) * 100) };
  });

  const seriesByDay = new Map<string, { views: number; watchSeconds: number }>();
  for (const row of seriesRows) {
    const day = new Date(row.day).toISOString().slice(0, 10);
    seriesByDay.set(day, { views: Number(row.views), watchSeconds: Number(row.watch_seconds) });
  }
  const revenueByDay = new Map<string, number>();
  for (const entry of rangeRevenueEntries) {
    const day = entry.createdAt.slice(0, 10);
    revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + entry.netMinor);
  }
  const timeSeries: RealTimeSeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const point = seriesByDay.get(day);
    timeSeries.push({
      date: day,
      views: point?.views ?? 0,
      watchHours: Math.round(((point?.watchSeconds ?? 0) / 3600) * 100) / 100,
      uniqueViewers: point?.views ?? 0,
      revenueMinor: revenueByDay.get(day) ?? 0,
    });
  }

  const topVideos: RealVideoRow[] = currentRows
    .map((row) => ({
      videoId: row.video_id,
      title: row.title,
      views: Number(row.views),
      watchHours: Math.round((Number(row.watch_seconds) / 3600) * 100) / 100,
      completionRate: Number(row.views) > 0 ? Math.round((Number(row.completed_count) / Number(row.views)) * 100) : 0,
    }))
    .filter((v) => v.views > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const revenueByVideoId = new Map<string, { revenueMinor: number; model: string }>();
  for (const entry of rangeRevenueEntries) {
    if (!entry.videoId) continue;
    const existing = revenueByVideoId.get(entry.videoId);
    revenueByVideoId.set(entry.videoId, {
      revenueMinor: (existing?.revenueMinor ?? 0) + entry.netMinor,
      model: entry.kind,
    });
  }
  const viewsByVideoId = new Map(currentRows.map((row) => [row.video_id, { title: row.title, views: Number(row.views) }]));
  const revenueByContent: RealRevenueByContent[] = Array.from(revenueByVideoId.entries())
    .map(([videoId, { revenueMinor, model }]) => ({
      videoId,
      title: viewsByVideoId.get(videoId)?.title ?? "Untitled",
      revenueMinor,
      views: viewsByVideoId.get(videoId)?.views ?? 0,
      model,
    }))
    .sort((a, b) => b.revenueMinor - a.revenueMinor);

  return {
    channelId,
    range,
    currency: revenue.currency,
    totals: {
      views: current.views,
      uniqueViewers: current.views,
      watchTimeSeconds: current.watchSeconds,
      completionRate: current.views > 0 ? Math.round((current.completed / current.views) * 100) : 0,
      averageViewDuration: current.views > 0 ? Math.round(current.watchSeconds / current.views) : 0,
      subscribersGained: Number(subscriberRow?.n ?? 0),
      revenueMinor: rangeRevenueMinor,
      currency: revenue.currency,
    },
    deltas: {
      views: pctChange(current.views, prior.views),
      watchTime: pctChange(current.watchSeconds, prior.watchSeconds),
      revenue: pctChange(rangeRevenueMinor, priorRevenueMinor),
      uniqueViewers: pctChange(current.views, prior.views),
    },
    timeSeries,
    retention,
    topVideos,
    revenueByContent,
    countries: buildSuppressedBreakdown(countryRows),
    devices: buildSuppressedBreakdown(deviceRows),
    languages: buildSuppressedBreakdown(languageRows),
  };
}
