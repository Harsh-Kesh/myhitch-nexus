// GET & POST /api/creators/[channelId]/posts/[postId]/comments — Post comments
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { clientIpFromHeaders } from "@/lib/server/requestMeta";
import {
  addPostComment,
  listPostComments,
} from "@/lib/server/creatorCommunity";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ channelId: string; postId: string }> },
) {
  const { postId } = await params;
  const comments = await listPostComments(postId);
  return NextResponse.json({ comments });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string; postId: string }> },
) {
  const { postId } = await params;
  const account = await getRequestAccount(request);

  let body: {
    content?: string;
    authorName?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.content || !body.content.trim()) {
    return NextResponse.json({ error: "Comment content is required" }, { status: 400 });
  }

  // Comments are reachable anonymously, so this keys on the account when signed in and
  // falls back to IP — the same shape as the tip route's rate limit.
  const rateLimitKey = `comment:${account?.id ?? clientIpFromHeaders(request.headers)}`;
  const rateLimit = await checkRateLimit(rateLimitKey, 20, 60 * 60);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many comments. Try again later." }, { status: 429 });
  }

  try {
    const comment = await addPostComment({
      postId,
      accountId: account?.id ?? null,
      authorName: account?.fullName ?? body.authorName ?? "Community Member",
      authorAvatarUrl: account?.avatarUrl ?? null,
      content: body.content,
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to add comment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
