// Server-only. Real series/seasons/episodes — docs/DEVELOPMENT-PLAN.md's 2026-09-17
// entry. `videos.series_id`/`season_number`/`episode_number` existed since the original
// catalogue migration but were entirely dead on the real path: no `series` table backed
// `series_id`, and publishVideo() never wrote any of the three. This is the write/read
// path — same shape as videoPublishing.ts/organizationVerification.ts.
import "server-only";
import { query, queryOne } from "./db";
import { pickGradient } from "../utils";

async function isChannelMember(accountId: string, channelId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from memberships where account_id = $1 and organization_id = $2`,
    [accountId, channelId],
  );
  return Boolean(row);
}

export interface SeriesSummary {
  id: string;
  channelId: string;
  title: string;
  description: string | null;
  posterGradient: [string, string];
  episodeCount: number;
  createdAt: string;
}

interface SeriesRow {
  id: string;
  channel_id: string;
  title: string;
  description: string | null;
  poster_gradient: [string, string];
  episode_count: string;
  created_at: string;
}

function mapSeries(row: SeriesRow): SeriesSummary {
  return {
    id: row.id,
    channelId: row.channel_id,
    title: row.title,
    description: row.description,
    posterGradient: row.poster_gradient,
    episodeCount: Number(row.episode_count),
    createdAt: row.created_at,
  };
}

const SERIES_COLUMNS = `
  s.id, s.channel_id, s.title, s.description, s.poster_gradient, s.created_at,
  (select count(*) from videos v where v.series_id = s.id and v.status = 'published') as episode_count
`;

/** Every real channel's own series, newest first — used by the Studio "Playlists &
 * series" page and the upload wizard's series picker. Channel-scoped, not
 * membership-checked: same visibility as a channel's published video list. */
export async function listSeriesForChannel(channelId: string): Promise<SeriesSummary[]> {
  const rows = await query<SeriesRow>(
    `select ${SERIES_COLUMNS} from series s where s.channel_id = $1 order by s.created_at desc`,
    [channelId],
  );
  return rows.map(mapSeries);
}

export type CreateSeriesResult =
  | { outcome: "success"; series: SeriesSummary }
  | { outcome: "not_channel_member" }
  | { outcome: "invalid"; reason: string };

export async function createSeries(
  accountId: string,
  channelId: string,
  title: string,
  description: string | null,
): Promise<CreateSeriesResult> {
  if (!(await isChannelMember(accountId, channelId))) {
    return { outcome: "not_channel_member" };
  }
  const trimmed = title.trim();
  if (trimmed.length < 2) {
    return { outcome: "invalid", reason: "A title of at least 2 characters is required." };
  }
  const rows = await query<{ id: string }>(
    `insert into series (channel_id, title, description, poster_gradient)
     values ($1, $2, $3, $4) returning id`,
    [channelId, trimmed.slice(0, 200), description?.trim().slice(0, 1000) || null, pickGradient(`${channelId}-${trimmed}`)],
  );
  const row = await queryOne<SeriesRow>(`select ${SERIES_COLUMNS} from series s where s.id = $1`, [rows[0].id]);
  return { outcome: "success", series: mapSeries(row!) };
}

export interface SeriesEpisode {
  id: string;
  slug: string;
  title: string;
  thumbnailUrl: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
}

export interface SeriesDetail extends SeriesSummary {
  episodes: SeriesEpisode[];
}

/** Public read — a real video's own page links back here to show "more from this
 * series," so this can't be membership-gated. Only ever surfaces published episodes,
 * same rule the channel page's own video list already applies. */
export async function getSeriesById(seriesId: string): Promise<SeriesDetail | null> {
  const seriesRow = await queryOne<SeriesRow>(`select ${SERIES_COLUMNS} from series s where s.id = $1`, [seriesId]);
  if (!seriesRow) return null;

  const episodeRows = await query<{
    id: string;
    slug: string;
    title: string;
    thumbnail_url: string | null;
    season_number: number | null;
    episode_number: number | null;
  }>(
    `select id, slug, title, thumbnail_url, season_number, episode_number
     from videos
     where series_id = $1 and status = 'published'
     order by season_number nulls last, episode_number nulls last, published_at`,
    [seriesId],
  );

  return {
    ...mapSeries(seriesRow),
    episodes: episodeRows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      thumbnailUrl: row.thumbnail_url,
      seasonNumber: row.season_number,
      episodeNumber: row.episode_number,
    })),
  };
}

/** Confirms a series belongs to the given channel — the publish gate's own check before
 * letting a video claim membership in it (can't assign into another channel's series). */
export async function seriesBelongsToChannel(seriesId: string, channelId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(`select id from series where id = $1 and channel_id = $2`, [
    seriesId,
    channelId,
  ]);
  return Boolean(row);
}
