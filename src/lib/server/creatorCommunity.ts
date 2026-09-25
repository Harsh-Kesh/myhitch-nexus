// Server-only. Creator Community Feed, Announcements & Discussions (Creator Tier)
import "server-only";
import { query, queryOne } from "./db";
import { checkRealContentAccess } from "./subscriptions";

export interface CreatorPost {
  id: string;
  channelId: string;
  authorId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  title: string | null;
  content: string;
  mediaUrls: string[];
  audience: "public" | "subscribers" | "patrons";
  likesCount: number;
  commentsCount: number;
  pinned: boolean;
  viewerHasLiked: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PostRow {
  id: string;
  channel_id: string;
  author_id: string | null;
  author_name: string | null;
  author_avatar_url: string | null;
  title: string | null;
  content: string;
  media_urls: string[] | null;
  audience: "public" | "subscribers" | "patrons";
  likes_count: number;
  comments_count: number;
  pinned: boolean;
  viewer_has_liked: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface CreatorComment {
  id: string;
  postId: string;
  accountId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  content: string;
  createdAt: string;
}

interface CommentRow {
  id: string;
  post_id: string;
  account_id: string | null;
  author_name: string;
  author_avatar_url: string | null;
  content: string;
  created_at: string;
}

/** Is `accountId` allowed to see a post with this audience level? "subscribers" maps to
 * a real active platform subscription (Premium/Family) — per-channel subscriptions were
 * retired under the six-tier pricing model (DEC-3), so platform tier is the only real
 * "subscriber" concept left. "patrons" maps to a real completed recurring creator_tips
 * row for this specific channel — there's no separate patron-membership table, and no
 * sync for a since-cancelled Stripe patron subscription, so this is "ever became a
 * patron of this channel," a disclosed simplification, not a currently-active-only check. */
async function canViewAudience(
  audience: "public" | "subscribers" | "patrons",
  channelId: string,
  viewerAccountId: string | null,
): Promise<boolean> {
  if (audience === "public") return true;
  if (!viewerAccountId) return false;
  if (audience === "subscribers") return checkRealContentAccess(viewerAccountId);
  const patronRow = await queryOne<{ id: string }>(
    `select id from creator_tips
     where channel_id = $1 and account_id = $2 and is_patron = true and status = 'completed'
     limit 1`,
    [channelId, viewerAccountId],
  );
  return Boolean(patronRow);
}

export async function listChannelPosts(
  channelId: string,
  viewerAccountId?: string | null,
): Promise<CreatorPost[]> {
  const params: unknown[] = [channelId];
  let viewerLikeJoin = "left join creator_post_likes vpl on vpl.post_id = p.id and vpl.account_id is null";

  if (viewerAccountId) {
    params.push(viewerAccountId);
    viewerLikeJoin = `left join creator_post_likes vpl on vpl.post_id = p.id and vpl.account_id = $${params.length}`;
  }

  const rows = await query<PostRow>(
    `select p.id, p.channel_id, p.author_id,
            coalesce(a.full_name, o.name) as author_name,
            coalesce(a.avatar_url, o.avatar_url) as author_avatar_url,
            p.title, p.content, p.media_urls, p.audience,
            p.likes_count, p.comments_count, p.pinned,
            case when vpl.account_id is not null then true else false end as viewer_has_liked,
            p.created_at, p.updated_at
     from creator_posts p
     join organizations o on o.id = p.channel_id
     left join accounts a on a.id = p.author_id
     ${viewerLikeJoin}
     where p.channel_id = $1
     order by p.pinned desc, p.created_at desc`,
    params,
  );

  // Audience gating happens here, not in SQL — the check itself spans two other real
  // tables (subscriptions, creator_tips) with different shapes per audience level, and
  // post volume per channel is small enough that this is simpler than folding both into
  // one query. Previously missing entirely: any "Patrons Only"/"Subscribers Only" post
  // was served in full to every viewer, including signed-out requests.
  const filtered: PostRow[] = [];
  for (const row of rows) {
    if (await canViewAudience(row.audience, channelId, viewerAccountId ?? null)) {
      filtered.push(row);
    }
  }

  return filtered.map((r) => ({
    id: r.id,
    channelId: r.channel_id,
    authorId: r.author_id,
    authorName: r.author_name ?? "Creator",
    authorAvatarUrl: r.author_avatar_url,
    title: r.title,
    content: r.content,
    mediaUrls: r.media_urls ?? [],
    audience: r.audience,
    likesCount: r.likes_count,
    commentsCount: r.comments_count,
    pinned: r.pinned,
    viewerHasLiked: Boolean(r.viewer_has_liked),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function createChannelPost(input: {
  channelId: string;
  authorId?: string | null;
  title?: string | null;
  content: string;
  mediaUrls?: string[];
  audience?: "public" | "subscribers" | "patrons";
  pinned?: boolean;
}): Promise<CreatorPost> {
  const trimmed = input.content.trim();
  if (!trimmed) throw new Error("Post content cannot be empty");

  const row = await queryOne<PostRow>(
    `insert into creator_posts (
      channel_id, author_id, title, content, media_urls, audience, pinned
    ) values ($1, $2, $3, $4, $5, $6, $7)
    returning id, channel_id, author_id, null as author_name, null as author_avatar_url,
              title, content, media_urls, audience, likes_count, comments_count, pinned,
              false as viewer_has_liked, created_at, updated_at`,
    [
      input.channelId,
      input.authorId ?? null,
      input.title?.trim() || null,
      trimmed,
      input.mediaUrls ?? [],
      input.audience ?? "public",
      input.pinned ?? false,
    ],
  );

  if (!row) throw new Error("Failed to create creator post");

  // Get author name
  const author = input.authorId
    ? await queryOne<{ full_name: string; avatar_url: string | null }>(
        `select full_name, avatar_url from accounts where id = $1`,
        [input.authorId],
      )
    : null;

  return {
    id: row.id,
    channelId: row.channel_id,
    authorId: row.author_id,
    authorName: author?.full_name ?? "Creator",
    authorAvatarUrl: author?.avatar_url ?? null,
    title: row.title,
    content: row.content,
    mediaUrls: row.media_urls ?? [],
    audience: row.audience,
    likesCount: row.likes_count,
    commentsCount: row.comments_count,
    pinned: row.pinned,
    viewerHasLiked: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteChannelPost(
  postId: string,
  channelId: string,
): Promise<boolean> {
  const result = await query(
    `delete from creator_posts where id = $1 and channel_id = $2`,
    [postId, channelId],
  );
  return result.length > 0;
}

export async function togglePostLike(
  postId: string,
  accountId: string,
): Promise<{ liked: boolean; likesCount: number }> {
  const existing = await queryOne<{ post_id: string }>(
    `select post_id from creator_post_likes where post_id = $1 and account_id = $2`,
    [postId, accountId],
  );

  if (existing) {
    await query(
      `delete from creator_post_likes where post_id = $1 and account_id = $2`,
      [postId, accountId],
    );
    const updated = await queryOne<{ likes_count: number }>(
      `update creator_posts
       set likes_count = greatest(0, likes_count - 1)
       where id = $1
       returning likes_count`,
      [postId],
    );
    return { liked: false, likesCount: updated?.likes_count ?? 0 };
  } else {
    await query(
      `insert into creator_post_likes (post_id, account_id) values ($1, $2)`,
      [postId, accountId],
    );
    const updated = await queryOne<{ likes_count: number }>(
      `update creator_posts
       set likes_count = likes_count + 1
       where id = $1
       returning likes_count`,
      [postId],
    );
    return { liked: true, likesCount: updated?.likes_count ?? 1 };
  }
}

export async function addPostComment(input: {
  postId: string;
  accountId?: string | null;
  authorName: string;
  authorAvatarUrl?: string | null;
  content: string;
}): Promise<CreatorComment> {
  const trimmed = input.content.trim();
  if (!trimmed) throw new Error("Comment cannot be empty");

  const row = await queryOne<CommentRow>(
    `insert into creator_post_comments (
      post_id, account_id, author_name, author_avatar_url, content
    ) values ($1, $2, $3, $4, $5)
    returning id, post_id, account_id, author_name, author_avatar_url, content, created_at`,
    [
      input.postId,
      input.accountId ?? null,
      input.authorName.trim() || "Community Member",
      input.authorAvatarUrl ?? null,
      trimmed,
    ],
  );

  if (!row) throw new Error("Failed to add comment");

  await query(
    `update creator_posts set comments_count = comments_count + 1 where id = $1`,
    [input.postId],
  );

  return {
    id: row.id,
    postId: row.post_id,
    accountId: row.account_id,
    authorName: row.author_name,
    authorAvatarUrl: row.author_avatar_url,
    content: row.content,
    createdAt: row.created_at,
  };
}

export async function listPostComments(postId: string): Promise<CreatorComment[]> {
  const rows = await query<CommentRow>(
    `select id, post_id, account_id, author_name, author_avatar_url, content, created_at
     from creator_post_comments
     where post_id = $1
     order by created_at asc`,
    [postId],
  );

  return rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    accountId: r.account_id,
    authorName: r.author_name,
    authorAvatarUrl: r.author_avatar_url,
    content: r.content,
    createdAt: r.created_at,
  }));
}
