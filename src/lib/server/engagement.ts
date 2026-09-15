// Server-only. Account-scoped write paths that were blocked on having a real signed-in
// account to attach them to (docs/DEVELOPMENT-PLAN.md §9) — watchlist, ratings and
// comments. Reads that return full video display data (getWatchlistVideos) live in
// catalogue.ts instead, next to the other VideoSummary-shaped queries they share a join
// with; this file is the mutations plus the reads that are cheap and video-independent.
import "server-only";
import { pickGradient, slugify } from "@/lib/utils";
import { query, queryOne } from "./db";

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
  const rows = await query<CommentRow>(
    `select ${COMMENT_COLUMNS}
     from video_comments c
     ${COMMENT_JOIN}
     where c.video_id = $1 and c.status != 'removed'
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

export async function postComment(
  author: EngagementAuthor,
  videoId: string,
  body: string,
): Promise<EngagementComment> {
  const row = await queryOne<{ id: string; created_at: string }>(
    `insert into video_comments (video_id, account_id, body)
     values ($1, $2, $3)
     returning id, created_at`,
    [videoId, author.id, body],
  );
  if (!row) throw new Error("Insert into video_comments returned no row.");
  await query(`update videos set comment_count = comment_count + 1 where id = $1`, [videoId]);

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
    status: "published",
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
