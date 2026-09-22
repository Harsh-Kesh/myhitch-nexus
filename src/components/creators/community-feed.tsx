"use client";

import {
  IconHeart,
  IconHeartFilled,
  IconLock,
  IconMessageCircle,
  IconPin,
  IconSend,
  IconShare,
} from "@tabler/icons-react";
import * as React from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useCurrentUser } from "@/lib/mock-api/hooks";
import { formatDate } from "@/lib/utils";

interface CreatorPostItem {
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
}

interface PostCommentItem {
  id: string;
  postId: string;
  accountId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  content: string;
  createdAt: string;
}

export function CommunityFeed({
  channelId,
  isOwner,
}: {
  channelId: string;
  isOwner?: boolean;
}) {
  const { data: user } = useCurrentUser();
  const { toast } = useToast();

  const [posts, setPosts] = React.useState<CreatorPostItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Composer state
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [postTitle, setPostTitle] = React.useState("");
  const [postContent, setPostContent] = React.useState("");
  const [postAudience, setPostAudience] = React.useState<"public" | "subscribers" | "patrons">("public");
  const [submitting, setSubmitting] = React.useState(false);

  // Comments state
  const [openCommentsPostId, setOpenCommentsPostId] = React.useState<string | null>(null);
  const [comments, setComments] = React.useState<Record<string, PostCommentItem[]>>({});
  const [commentDrafts, setCommentDrafts] = React.useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = React.useState(false);

  const fetchPosts = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/creators/${channelId}/posts`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  React.useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postContent.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/creators/${channelId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: postTitle.trim() || undefined,
          content: postContent.trim(),
          audience: postAudience,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to publish post");

      setPosts((prev) => [data.post, ...prev]);
      setPostTitle("");
      setPostContent("");
      setComposerOpen(false);
      toast({ title: "Post published", description: "Your update is now live on your community feed.", tone: "success" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "An error occurred", tone: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleLike = async (postId: string) => {
    if (!user) {
      toast({ title: "Sign in required", description: "Sign in to like community posts.", tone: "warning" });
      return;
    }

    try {
      const res = await fetch(`/api/creators/${channelId}/posts/${postId}/like`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, viewerHasLiked: data.liked, likesCount: data.likesCount }
              : p,
          ),
        );
      }
    } catch {
      // ignore
    }
  };

  const handleLoadComments = async (postId: string) => {
    if (openCommentsPostId === postId) {
      setOpenCommentsPostId(null);
      return;
    }

    setOpenCommentsPostId(postId);
    if (!comments[postId]) {
      try {
        const res = await fetch(`/api/creators/${channelId}/posts/${postId}/comments`);
        if (res.ok) {
          const data = await res.json();
          setComments((prev) => ({ ...prev, [postId]: data.comments ?? [] }));
        }
      } catch {
        // ignore
      }
    }
  };

  const handleAddComment = async (postId: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = commentDrafts[postId]?.trim();
    if (!text) return;

    if (!user) {
      toast({ title: "Sign in required", description: "Sign in to join the conversation.", tone: "warning" });
      return;
    }

    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/creators/${channelId}/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add comment");

      setComments((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] ?? []), data.comment],
      }));
      setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p)),
      );
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "An error occurred", tone: "error" });
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 py-6">
        <div className="nx-skeleton h-24 w-full rounded-lg" />
        <div className="nx-skeleton h-32 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Creator Composer */}
      {isOwner && (
        <Card className="border border-border/60 bg-surface">
          <CardBody className="p-4 sm:p-5">
            {!composerOpen ? (
              <div
                onClick={() => setComposerOpen(true)}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface-2 p-3 text-sm text-fg-muted hover:border-border-strong hover:text-fg"
              >
                <Avatar name={user?.name ?? "Creator"} src={user?.avatarUrl} size="md" />
                <span>Post an update, announcement, or behind-the-scenes note...</span>
              </div>
            ) : (
              <form onSubmit={handleCreatePost} className="space-y-3">
                <input
                  type="text"
                  placeholder="Title (optional)"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-fg"
                />
                <textarea
                  rows={4}
                  placeholder="Share news, thoughts, or upcoming releases..."
                  required
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 p-3 text-sm text-fg focus:border-accent focus:outline-none"
                />
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-fg-muted">Audience:</span>
                    <select
                      value={postAudience}
                      onChange={(e) => setPostAudience(e.target.value as "public" | "subscribers" | "patrons")}
                      className="rounded border border-border bg-surface-2 px-2 py-1 text-xs text-fg"
                    >
                      <option value="public">Public (Everyone)</option>
                      <option value="subscribers">Subscribers Only</option>
                      <option value="patrons">Patrons Only</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" type="button" onClick={() => setComposerOpen(false)}>
                      Cancel
                    </Button>
                    <Button variant="primary" size="sm" type="submit" loading={submitting}>
                      Publish Update
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </CardBody>
        </Card>
      )}

      {/* Posts List */}
      {posts.length === 0 ? (
        <EmptyState
          title="No community updates yet"
          description="The creator hasn't published any announcements yet. Check back soon!"
        />
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <Card key={post.id} className="border border-border/60 bg-surface">
              <CardBody className="space-y-3 p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={post.authorName} src={post.authorAvatarUrl ?? undefined} size="md" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-fg">{post.authorName}</span>
                        {post.pinned && (
                          <Badge tone="accent" size="sm">
                            <IconPin className="size-3" />
                            Pinned
                          </Badge>
                        )}
                        {post.audience !== "public" && (
                          <Badge tone={post.audience === "patrons" ? "warning" : "info"} size="sm">
                            <IconLock className="size-3" />
                            {post.audience === "patrons" ? "Patrons Only" : "Subscribers Only"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-fg-muted">{formatDate(post.createdAt)}</p>
                    </div>
                  </div>
                </div>

                {/* Content */}
                {post.title && <h3 className="font-display font-semibold text-fg">{post.title}</h3>}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg/90">{post.content}</p>

                {/* Actions */}
                <div className="flex items-center gap-4 pt-2 border-t border-border/40 text-xs text-fg-muted">
                  <button
                    onClick={() => handleToggleLike(post.id)}
                    className={`flex items-center gap-1.5 transition ${
                      post.viewerHasLiked ? "text-red-500 font-semibold" : "hover:text-fg"
                    }`}
                  >
                    {post.viewerHasLiked ? (
                      <IconHeartFilled className="size-4 text-red-500" />
                    ) : (
                      <IconHeart className="size-4" />
                    )}
                    <span>{post.likesCount}</span>
                  </button>

                  <button
                    onClick={() => handleLoadComments(post.id)}
                    className="flex items-center gap-1.5 hover:text-fg transition"
                  >
                    <IconMessageCircle className="size-4" />
                    <span>{post.commentsCount} Comments</span>
                  </button>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      toast({ title: "Link copied", description: "Post URL copied to clipboard", tone: "success" });
                    }}
                    className="flex items-center gap-1.5 hover:text-fg transition ml-auto"
                  >
                    <IconShare className="size-4" />
                    <span>Share</span>
                  </button>
                </div>

                {/* Comments Expandable Section */}
                {openCommentsPostId === post.id && (
                  <div className="mt-4 pt-4 border-t border-border/40 space-y-3">
                    {/* Add Comment */}
                    <form
                      onSubmit={(e) => handleAddComment(post.id, e)}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        placeholder="Write a reply..."
                        value={commentDrafts[post.id] ?? ""}
                        onChange={(e) =>
                          setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))
                        }
                        className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-fg"
                      />
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={!commentDrafts[post.id]?.trim()}
                        loading={submittingComment}
                      >
                        <IconSend className="size-3.5" />
                        Reply
                      </Button>
                    </form>

                    {/* Comments List */}
                    <div className="space-y-2 pt-2">
                      {(comments[post.id] ?? []).length === 0 ? (
                        <p className="text-xs text-fg-muted italic">No comments yet. Be the first to reply!</p>
                      ) : (
                        (comments[post.id] ?? []).map((c) => (
                          <div key={c.id} className="flex items-start gap-2.5 rounded-lg bg-surface-2/60 p-2.5 text-xs">
                            <Avatar name={c.authorName} src={c.authorAvatarUrl ?? undefined} size="sm" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-fg">{c.authorName}</span>
                                <span className="text-2xs text-fg-subtle">{formatDate(c.createdAt)}</span>
                              </div>
                              <p className="mt-0.5 text-fg/80">{c.content}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
