// Server-only. Account-scoped write paths that were blocked on having a real signed-in
// account to attach them to (docs/DEVELOPMENT-PLAN.md §9) — watchlist, ratings, comments,
// follows and watch progress. Reads that return full video/channel display data
// (getWatchlistVideos, getContinueWatchingVideos) live in catalogue.ts instead, next to
// the other VideoSummary-shaped queries they share a join with; this file is the
// mutations plus the reads that are cheap and video/channel-independent.
import "server-only";
import { pickGradient, slugify } from "@/lib/utils";
import { query, queryOne } from "./db";
import { flagForReview, recordAudit } from "./moderation";

/* ------------------------------ Watchlist -------------------------------- */

export async function toggleWatchlist(accountId: string, videoId: string): Promise<boolean> {
  const existing = await queryOne(
    `select 1 from watchlist_items where account_id = $1 and video_id = $2`,
    [accountId, videoId],
  );
  if (existing) {
    await query(`delete from watchlist_items where account_id = $1 and video_id = $2`, [
      accountId,
      videoId,
    ]);
    return false;
  }
  await query(`insert into watchlist_items (account_id, video_id) values ($1, $2)`, [
    accountId,
    videoId,
  ]);
  return true;
}

/* ------------------------------- Ratings ---------------------------------- */

export async function rateVideo(
  accountId: string,
  videoId: string,
  stars: 1 | 2 | 3 | 4 | 5,
): Promise<{ videoId: string; stars: number }> {
  await query(
    `insert into video_ratings (video_id, account_id, stars)
     values ($1, $2, $3)
     on conflict (video_id, account_id) do update set stars = excluded.stars`,
    [videoId, accountId, stars],
  );
  // Recomputed from the real rows rather than incrementally adjusted (as the mock's
  // running-average math did) — this is the point where a video's rating_average/
  // rating_count stop being the seeded snapshot (docs/DEVELOPMENT-PLAN.md's P1 entry)
  // and become live, for every video that gets at least one real rating.
  await query(
    `update videos set
       rating_average = coalesce((select round(avg(stars)::numeric, 2) from video_ratings where video_id = $1), 0),
       rating_count = (select count(*) from video_ratings where video_id = $1)
     where id = $1`,
    [videoId],
  );
  return { videoId, stars };
}

export async function getMyRating(accountId: string, videoId: string): Promise<number | null> {
  const row = await queryOne<{ stars: number }>(
    `select stars from video_ratings where video_id = $1 and account_id = $2`,
    [videoId, accountId],
  );
  return row?.stars ?? null;
}

/* ------------------------------- Comments --------------------------------- */

export interface EngagementAuthor {
  id: string;
  fullName: string;
  handle: string | null;
}

export interface EngagementComment {
  id: string;
  videoId: string;
  authorName: string;
  authorHandle: string;
  authorGradient: [string, string];
  body: string;
  createdAt: string;
  likes: number;
  pinned: boolean;
  heartedByCreator: boolean;
  status: "published" | "held" | "removed";
  heldReason?: string;
  replies: Array<Omit<EngagementComment, "replies" | "videoId">>;
}

interface CommentRow {
  id: string;
  video_id: string;
  account_id: string;
  parent_comment_id: string | null;
  body: string;
  status: "published" | "held" | "removed";
  held_reason: string | null;
  likes: number;
  pinned: boolean;
  hearted_by_creator: boolean;
  created_at: string;
  full_name: string;
  handle: string | null;
}

function mapCommentRow(row: CommentRow): Omit<EngagementComment, "replies"> {
  return {
    id: row.id,
    videoId: row.video_id,
    authorName: row.full_name,
    authorHandle: row.handle ?? slugify(row.full_name),
    authorGradient: pickGradient(row.account_id),
    body: row.body,
    createdAt: row.created_at,
    likes: row.likes,
    pinned: row.pinned,
    heartedByCreator: row.hearted_by_creator,
    status: row.status,
    heldReason: row.held_reason ?? undefined,
  };
}

/** A reply, same shape as the mock's `Omit<Comment, "replies" | "videoId">` — dropped
 * here rather than just narrowed by the type, since a reply is always read in the
 * context of its parent's videoId and carrying a second copy invites the two drifting. */
function mapReplyRow(row: CommentRow): Omit<EngagementComment, "replies" | "videoId"> {
  const comment = mapCommentRow(row);
  return {
    id: comment.id,
    authorName: comment.authorName,
    authorHandle: comment.authorHandle,
    authorGradient: comment.authorGradient,
    body: comment.body,
    createdAt: comment.createdAt,
    likes: comment.likes,
    pinned: comment.pinned,
    heartedByCreator: comment.heartedByCreator,
    status: comment.status,
    heldReason: comment.heldReason,
  };
}

const COMMENT_COLUMNS = `
  c.id, c.video_id, c.account_id, c.parent_comment_id, c.body, c.status, c.held_reason,
  c.likes, c.pinned, c.hearted_by_creator, c.created_at, a.full_name, a.handle
`;
const COMMENT_JOIN = `join accounts a on a.id = c.account_id`;

export async function getComments(videoId: string): Promise<EngagementComment[]> {
  // 'held' is deliberately excluded here too, not just 'removed' — a held comment is
  // awaiting moderation and shouldn't be publicly visible yet (the real gap the
  // comment-hold-rules slice of docs/DEVELOPMENT-PLAN.md's P2 entry closes: this
  // previously only excluded 'removed', so a real held comment was shown to every viewer
  // anyway, same as if it had never been held at all).
  const rows = await query<CommentRow>(
    `select ${COMMENT_COLUMNS}
     from video_comments c
     ${COMMENT_JOIN}
     where c.video_id = $1 and c.status = 'published'
     order by c.created_at asc`,
    [videoId],
  );

  const repliesByParent = new Map<string, Array<Omit<EngagementComment, "replies" | "videoId">>>();
  for (const row of rows) {
    if (!row.parent_comment_id) continue;
    const list = repliesByParent.get(row.parent_comment_id) ?? [];
    list.push(mapReplyRow(row));
    repliesByParent.set(row.parent_comment_id, list);
  }

  return rows
    .filter((row) => !row.parent_comment_id)
    .map((row) => ({ ...mapCommentRow(row), replies: repliesByParent.get(row.id) ?? [] }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.likes - a.likes);
}

// A free, zero-vendor comment-hold rule (docs/DEVELOPMENT-PLAN.md's P2 entry): any link
// is auto-held for the channel to review before it's shown, the same "hold anything with
// a URL" heuristic most platforms ship before ever paying for a real spam/abuse
// classifier (that's the AWS Rekognition/Sightengine vendor decision already deferred on
// cost — see the moderation-direction dev-plan entry). Deliberately simple: it costs
// nothing, catches the single most common spam pattern, and never blocks a comment
// outright — a channel owner can always publish it from Studio.
const LINK_PATTERN = /https?:\/\/|www\./i;

export async function postComment(
  author: EngagementAuthor,
  videoId: string,
  body: string,
): Promise<EngagementComment> {
  const autoHold = LINK_PATTERN.test(body);
  const status = autoHold ? "held" : "published";
  const heldReason = autoHold ? "Contains a link — awaiting channel review." : null;

  const row = await queryOne<{ id: string; created_at: string }>(
    `insert into video_comments (video_id, account_id, body, status, held_reason)
     values ($1, $2, $3, $4, $5)
     returning id, created_at`,
    [videoId, author.id, body, status, heldReason],
  );
  if (!row) throw new Error("Insert into video_comments returned no row.");
  // Deliberately incremented even for a held comment — comment_count is a "how much
  // engagement" signal, not "how many are publicly visible right now", same distinction
  // videos.status already draws for pending/scheduled content.
  await query(`update videos set comment_count = comment_count + 1 where id = $1`, [videoId]);

  if (autoHold) {
    const video = await queryOne<{ channel_id: string; title: string }>(
      `select channel_id, title from videos where id = $1`,
      [videoId],
    );
    if (video) {
      await flagForReview({
        kind: "comment",
        targetId: row.id,
        title: `Comment on "${video.title}"`,
        channelId: video.channel_id,
        queue: "pending-review",
        notes: heldReason ?? "",
      });
    }
  }

  return {
    id: row.id,
    videoId,
    authorName: author.fullName,
    authorHandle: author.handle ?? slugify(author.fullName),
    authorGradient: pickGradient(author.id),
    body,
    createdAt: row.created_at,
    likes: 0,
    pinned: false,
    heartedByCreator: false,
    status,
    heldReason: heldReason ?? undefined,
    replies: [],
  };
}

/** Returns the parent comment (with its replies, the new one included) — matches the
 * mock's replyToComment(), which returns the whole updated parent rather than just the
 * new reply, so the caller can replace one cache entry instead of splicing an array. */
export async function replyToComment(
  author: EngagementAuthor,
  commentId: string,
  body: string,
): Promise<EngagementComment | null> {
  const parent = await queryOne<{ id: string; video_id: string }>(
    `select id, video_id from video_comments where id = $1 and parent_comment_id is null`,
    [commentId],
  );
  if (!parent) return null;

  await query(
    `insert into video_comments (video_id, account_id, parent_comment_id, body)
     values ($1, $2, $3, $4)`,
    [parent.video_id, author.id, commentId, body],
  );

  const rows = await query<CommentRow>(
    `select ${COMMENT_COLUMNS}
     from video_comments c
     ${COMMENT_JOIN}
     where c.id = $1 or c.parent_comment_id = $1
     order by c.created_at asc`,
    [commentId],
  );
  const parentRow = rows.find((row) => row.id === commentId);
  if (!parentRow) return null;
  const replies = rows.filter((row) => row.parent_comment_id === commentId).map(mapReplyRow);
  return { ...mapCommentRow(parentRow), replies };
}

/** Every comment on any of `channelId`'s videos, every status included — the moderation
 * view (Studio's Comments page), unlike getComments() which is the public, published-
 * only one. No ownership check here; the route calling this is responsible for it. */
export async function listChannelComments(channelId: string): Promise<EngagementComment[]> {
  const rows = await query<CommentRow>(
    `select ${COMMENT_COLUMNS}
     from video_comments c
     ${COMMENT_JOIN}
     join videos v on v.id = c.video_id
     where v.channel_id = $1
     order by c.created_at desc`,
    [channelId],
  );
  return rows.filter((row) => !row.parent_comment_id).map((row) => ({ ...mapCommentRow(row), replies: [] }));
}

export type ModerateCommentAction = "publish" | "hold" | "remove" | "pin" | "heart";

export type ModerateCommentResult =
  | { outcome: "success"; comment: Omit<EngagementComment, "replies"> }
  | { outcome: "not_found" }
  | { outcome: "not_channel_member" };

/** Real counterpart of the mock's moderateComment() — a channel owner acting on a
 * comment on one of their own videos. Ownership is checked here (comment -> video ->
 * channel -> membership), not left to the caller. */
export async function moderateComment(
  actor: { id: string; name: string },
  commentId: string,
  action: ModerateCommentAction,
): Promise<ModerateCommentResult> {
  const row = await queryOne<{ channel_id: string }>(
    `select v.channel_id from video_comments c join videos v on v.id = c.video_id where c.id = $1`,
    [commentId],
  );
  if (!row) return { outcome: "not_found" };
  const membership = await queryOne(
    `select 1 from memberships where account_id = $1 and organization_id = $2`,
    [actor.id, row.channel_id],
  );
  if (!membership) return { outcome: "not_channel_member" };

  if (action === "publish") {
    await query(`update video_comments set status = 'published', held_reason = null where id = $1`, [commentId]);
  } else if (action === "hold") {
    await query(`update video_comments set status = 'held', held_reason = $2 where id = $1`, [
      commentId,
      "Held by the channel for review.",
    ]);
  } else if (action === "remove") {
    await query(`update video_comments set status = 'removed' where id = $1`, [commentId]);
  } else if (action === "pin") {
    await query(`update video_comments set pinned = not pinned where id = $1`, [commentId]);
  } else if (action === "heart") {
    await query(`update video_comments set hearted_by_creator = not hearted_by_creator where id = $1`, [commentId]);
  }

  // A publish/remove decision here resolves the platform-level queue item too (if the
  // auto-hold rule created one) — otherwise a channel owner handling their own comment
  // directly leaves a phantom "open" entry in /admin/reviews forever, since nothing else
  // ever closes it. Not "actioned" (that implies an admin decision) — "dismissed" is
  // honest about who actually resolved it.
  if (action === "publish" || action === "remove") {
    await query(
      `update moderation_queue set status = 'dismissed' where kind = 'comment' and target_id = $1 and status = 'open'`,
      [commentId],
    );
  }

  await recordAudit({
    actorAccountId: actor.id,
    actorName: actor.name,
    actorRole: "creator",
    action: `comment.${action}`,
    targetType: "comment",
    targetId: commentId,
    reason: "Channel moderation action",
    severity: action === "remove" ? "warning" : "info",
  });

  const updated = await queryOne<CommentRow>(
    `select ${COMMENT_COLUMNS} from video_comments c ${COMMENT_JOIN} where c.id = $1`,
    [commentId],
  );
  if (!updated) return { outcome: "not_found" };
  return { outcome: "success", comment: mapCommentRow(updated) };
}

/* -------------------------------- Follows ---------------------------------- */

export async function toggleFollow(accountId: string, organizationId: string): Promise<boolean> {
  const existing = await queryOne(
    `select 1 from channel_follows where account_id = $1 and organization_id = $2`,
    [accountId, organizationId],
  );
  let following: boolean;
  if (existing) {
    await query(
      `delete from channel_follows where account_id = $1 and organization_id = $2`,
      [accountId, organizationId],
    );
    following = false;
  } else {
    await query(
      `insert into channel_follows (account_id, organization_id) values ($1, $2)`,
      [accountId, organizationId],
    );
    following = true;
  }
  // Same transition as rateVideo()'s rating_average/rating_count: organizations.followers
  // stops being the seeded snapshot and starts being live the moment anyone actually
  // follows the channel for real.
  await query(
    `update organizations set followers = (select count(*) from channel_follows where organization_id = $1) where id = $1`,
    [organizationId],
  );
  return following;
}

export async function isFollowing(accountId: string, organizationId: string): Promise<boolean> {
  const row = await queryOne(
    `select 1 from channel_follows where account_id = $1 and organization_id = $2`,
    [accountId, organizationId],
  );
  return Boolean(row);
}

/* ---------------------------- Watch progress -------------------------------- */

export interface EngagementProgress {
  videoId: string;
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: string;
  completed: boolean;
}

/** durationSeconds comes from the video row, not watch_progress (which doesn't store
 * one — see the migration) — a video's own length is a property of the video, not of any
 * one account's progress through it. */
export async function getWatchProgress(
  accountId: string,
  videoId: string,
): Promise<EngagementProgress | null> {
  const row = await queryOne<{
    position_seconds: number;
    completed: boolean;
    updated_at: string;
    duration_seconds: number;
  }>(
    `select wp.position_seconds, wp.completed, wp.updated_at, v.duration_seconds
     from watch_progress wp
     join videos v on v.id = wp.video_id
     where wp.account_id = $1 and wp.video_id = $2`,
    [accountId, videoId],
  );
  if (!row) return null;
  return {
    videoId,
    positionSeconds: row.position_seconds,
    durationSeconds: row.duration_seconds,
    updatedAt: row.updated_at,
    completed: row.completed,
  };
}

/** Same >95%-watched threshold as the mock's saveWatchProgress(). watch_progress has no
 * updated_at trigger (unlike accounts/organizations — see the Phase 0 migration), so it's
 * set explicitly here on every write, insert or update.
 *
 * country/deviceType/language (src/lib/server/requestMeta.ts) are real per-request
 * signals, not always present on every single heartbeat (e.g. a header a proxy strips) —
 * coalesced against the existing stored value on conflict so one request missing a header
 * never erases a value a previous request on the same video already captured. */
export async function saveWatchProgress(
  accountId: string,
  videoId: string,
  positionSeconds: number,
  meta: { country?: string | null; deviceType?: string | null; language?: string | null } = {},
): Promise<EngagementProgress | null> {
  const video = await queryOne<{ duration_seconds: number }>(
    `select duration_seconds from videos where id = $1`,
    [videoId],
  );
  if (!video) return null;

  const clampedPosition = Math.max(0, Math.round(positionSeconds));
  const completed = video.duration_seconds > 0 && clampedPosition / video.duration_seconds > 0.95;

  const row = await queryOne<{ updated_at: string }>(
    `insert into watch_progress (account_id, video_id, position_seconds, completed, updated_at, country, device_type, language)
     values ($1, $2, $3, $4, now(), $5, $6, $7)
     on conflict (account_id, video_id) do update set
       position_seconds = excluded.position_seconds,
       completed = excluded.completed,
       updated_at = excluded.updated_at,
       country = coalesce(excluded.country, watch_progress.country),
       device_type = coalesce(excluded.device_type, watch_progress.device_type),
       language = coalesce(excluded.language, watch_progress.language)
     returning updated_at`,
    [accountId, videoId, clampedPosition, completed, meta.country ?? null, meta.deviceType ?? null, meta.language ?? null],
  );

  return {
    videoId,
    positionSeconds: clampedPosition,
    durationSeconds: video.duration_seconds,
    updatedAt: row!.updated_at,
    completed,
  };
}
