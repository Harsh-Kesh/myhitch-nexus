// Server-only. Real personal (viewer-owned) playlists — see the
// 20260930000005_viewer_playlists.sql migration comment for why this is a new, separate
// concept from the creator-side channel playlist ("series") feature, which stays mock.
import "server-only";
import { query, queryOne } from "./db";
import { getPlaylistVideos, videoExists, type VideoSummary } from "./catalogue";

export type PlaylistVisibility = "public" | "unlisted" | "private";

export interface ViewerPlaylist {
  id: string;
  accountId: string;
  profileId: string | null;
  title: string;
  description: string | null;
  visibility: PlaylistVisibility;
  videoCount: number;
  createdAt: string;
  updatedAt: string;
  /** Only present when listPlaylists() was called with a videoId — the "Save to
   * playlist" modal's checkbox state for that one video, computed in the same query
   * rather than N follow-up lookups. */
  containsVideo?: boolean;
}

interface PlaylistRow {
  id: string;
  account_id: string;
  profile_id: string | null;
  title: string;
  description: string | null;
  visibility: PlaylistVisibility;
  video_count: string;
  created_at: string;
  updated_at: string;
  contains_video?: boolean;
}

function mapPlaylist(row: PlaylistRow): ViewerPlaylist {
  return {
    id: row.id,
    accountId: row.account_id,
    profileId: row.profile_id,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    videoCount: Number(row.video_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.contains_video !== undefined ? { containsVideo: row.contains_video } : {}),
  };
}

const PLAYLIST_SELECT = `
  select p.id, p.account_id, p.profile_id, p.title, p.description, p.visibility, p.created_at, p.updated_at,
    (select count(*) from viewer_playlist_items i where i.playlist_id = p.id) as video_count
  from viewer_playlists p
`;

/** `profileId` is the caller's currently active household profile (Family Tier), or
 * null for an account with no profiles selected. A profile sees its own profile-scoped
 * playlists plus every account-wide one (`profile_id is null`) — never another profile's
 * private ones. Found live 2026-09-26 alongside the same gap in watch_progress: every
 * household member shared one "My Playlists" list with no way to keep a save private to
 * just one profile. */
export async function listPlaylists(
  accountId: string,
  profileId: string | null,
  videoId?: string,
): Promise<ViewerPlaylist[]> {
  if (videoId) {
    const rows = await query<PlaylistRow>(
      `select p.id, p.account_id, p.profile_id, p.title, p.description, p.visibility, p.created_at, p.updated_at,
         (select count(*) from viewer_playlist_items i where i.playlist_id = p.id) as video_count,
         exists(select 1 from viewer_playlist_items i where i.playlist_id = p.id and i.video_id = $2) as contains_video
       from viewer_playlists p
       where p.account_id = $1 and (p.profile_id is null or p.profile_id = $3)
       order by p.updated_at desc`,
      [accountId, videoId, profileId],
    );
    return rows.map(mapPlaylist);
  }
  const rows = await query<PlaylistRow>(
    `${PLAYLIST_SELECT} where p.account_id = $1 and (p.profile_id is null or p.profile_id = $2) order by p.updated_at desc`,
    [accountId, profileId],
  );
  return rows.map(mapPlaylist);
}

/** Ownership-checked lookup — a private playlist is invisible to anyone but its owner;
 * public/unlisted ones are readable by any caller (unlisted just isn't listed anywhere
 * public, same convention as a video's own "unlisted" status). `viewerAccountId` is the
 * requester, not necessarily the owner. */
export async function getPlaylistById(
  playlistId: string,
  viewerAccountId: string | null,
): Promise<{ playlist: ViewerPlaylist; videos: VideoSummary[] } | null> {
  const row = await queryOne<PlaylistRow>(`${PLAYLIST_SELECT} where p.id = $1`, [playlistId]);
  if (!row) return null;
  if (row.visibility === "private" && row.account_id !== viewerAccountId) return null;
  const videos = await getPlaylistVideos(playlistId);
  return { playlist: mapPlaylist(row), videos };
}

export type CreatePlaylistResult =
  | { outcome: "success"; playlist: ViewerPlaylist }
  | { outcome: "invalid"; reason: string };

export async function createPlaylist(
  accountId: string,
  /** The real, ownership-verified profile to scope this playlist to, or null for an
   * account-wide playlist every profile on the account sees. Caller (the API route)
   * verifies profileId actually belongs to accountId before this ever sees it — same
   * split of responsibility as saveWatchProgress()'s own profileId parameter. */
  profileId: string | null,
  input: { title: string; description?: string | null; visibility?: PlaylistVisibility },
): Promise<CreatePlaylistResult> {
  if (!input.title.trim()) {
    return { outcome: "invalid", reason: "A title is required." };
  }
  const row = await queryOne<PlaylistRow>(
    `insert into viewer_playlists (account_id, profile_id, title, description, visibility)
     values ($1, $2, $3, $4, $5)
     returning id, account_id, profile_id, title, description, visibility, created_at, updated_at, 0 as video_count`,
    [accountId, profileId, input.title.trim().slice(0, 150), input.description?.trim() || null, input.visibility ?? "private"],
  );
  return { outcome: "success", playlist: mapPlaylist(row!) };
}

export type PlaylistMutationResult =
  | { outcome: "success" }
  | { outcome: "not_found" }
  | { outcome: "not_owner" }
  | { outcome: "invalid"; reason: string };

async function requireOwnedPlaylist(accountId: string, playlistId: string): Promise<PlaylistMutationResult | null> {
  const row = await queryOne<{ account_id: string }>(`select account_id from viewer_playlists where id = $1`, [
    playlistId,
  ]);
  if (!row) return { outcome: "not_found" };
  if (row.account_id !== accountId) return { outcome: "not_owner" };
  return null;
}

export async function updatePlaylist(
  accountId: string,
  playlistId: string,
  patch: {
    title?: string;
    description?: string | null;
    visibility?: PlaylistVisibility;
    /** Same ownership-verified-by-the-caller contract as createPlaylist()'s profileId.
     * `null` explicitly makes the playlist account-wide; omitted leaves its scope
     * unchanged (matching how `description` already distinguishes "clear it" from
     * "didn't touch it" below). */
    profileId?: string | null;
  },
): Promise<PlaylistMutationResult> {
  const denied = await requireOwnedPlaylist(accountId, playlistId);
  if (denied) return denied;
  if (patch.title !== undefined && !patch.title.trim()) {
    return { outcome: "invalid", reason: "A title is required." };
  }
  await query(
    `update viewer_playlists set
       title = coalesce($2, title),
       description = case when $3 then $4 else description end,
       visibility = coalesce($5, visibility),
       profile_id = case when $6 then $7 else profile_id end,
       updated_at = now()
     where id = $1`,
    [
      playlistId,
      patch.title?.trim().slice(0, 150) ?? null,
      "description" in patch,
      patch.description?.trim() || null,
      patch.visibility ?? null,
      "profileId" in patch,
      patch.profileId ?? null,
    ],
  );
  return { outcome: "success" };
}

export async function deletePlaylist(accountId: string, playlistId: string): Promise<PlaylistMutationResult> {
  const denied = await requireOwnedPlaylist(accountId, playlistId);
  if (denied) return denied;
  await query(`delete from viewer_playlists where id = $1`, [playlistId]);
  return { outcome: "success" };
}

export async function addVideoToPlaylist(
  accountId: string,
  playlistId: string,
  videoId: string,
): Promise<PlaylistMutationResult> {
  const denied = await requireOwnedPlaylist(accountId, playlistId);
  if (denied) return denied;
  if (!(await videoExists(videoId))) {
    return { outcome: "invalid", reason: "That video doesn't exist." };
  }
  await query(
    `insert into viewer_playlist_items (playlist_id, video_id) values ($1, $2) on conflict do nothing`,
    [playlistId, videoId],
  );
  await query(`update viewer_playlists set updated_at = now() where id = $1`, [playlistId]);
  return { outcome: "success" };
}

export async function removeVideoFromPlaylist(
  accountId: string,
  playlistId: string,
  videoId: string,
): Promise<PlaylistMutationResult> {
  const denied = await requireOwnedPlaylist(accountId, playlistId);
  if (denied) return denied;
  await query(`delete from viewer_playlist_items where playlist_id = $1 and video_id = $2`, [playlistId, videoId]);
  await query(`update viewer_playlists set updated_at = now() where id = $1`, [playlistId]);
  return { outcome: "success" };
}
