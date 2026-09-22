// POST /api/creators/[channelId]/posts/[postId]/like — Toggle like on community post
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { togglePostLike } from "@/lib/server/creatorCommunity";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string; postId: string }> },
) {
  const { postId } = await params;
  const account = await getRequestAccount(request);

  if (!account) {
    return NextResponse.json({ error: "Sign in required to like posts" }, { status: 401 });
  }

  const result = await togglePostLike(postId, account.id);
  return NextResponse.json(result);
}
