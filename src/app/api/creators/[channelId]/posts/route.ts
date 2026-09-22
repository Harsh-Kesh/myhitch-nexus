// GET & POST /api/creators/[channelId]/posts — Community posts & updates (Creator Tier)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { isChannelMember } from "@/lib/server/channelSettings";
import {
  createChannelPost,
  listChannelPosts,
} from "@/lib/server/creatorCommunity";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await params;
  const account = await getRequestAccount(request);

  const posts = await listChannelPosts(channelId, account?.id ?? null);
  return NextResponse.json({ posts });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await params;
  const account = await getRequestAccount(request);

  if (!account) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  // Verify that account is a member/owner of this channel or is super-admin
  const isMember = await isChannelMember(account.id, channelId);
  const isSuperAdmin = account.roles.includes("super-admin");
  if (!isMember && !isSuperAdmin) {
    return NextResponse.json(
      { error: "Forbidden. Only channel members can publish community posts." },
      { status: 403 },
    );
  }

  let body: {
    title?: string;
    content?: string;
    mediaUrls?: string[];
    audience?: "public" | "subscribers" | "patrons";
    pinned?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.content || !body.content.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  try {
    const post = await createChannelPost({
      channelId,
      authorId: account.id,
      title: body.title,
      content: body.content,
      mediaUrls: body.mediaUrls,
      audience: body.audience,
      pinned: body.pinned,
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
