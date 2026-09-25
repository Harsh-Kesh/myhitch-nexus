// POST /api/videos/[id]/comments/[commentId]/like — toggle the signed-in account's like
// on a comment. Was previously a static display count with no button/handler at all.
import { NextResponse, type NextRequest } from "next/server";
import { toggleCommentLike } from "@/lib/server/engagement";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in to like a comment." }, { status: 401 });
  }
  const { commentId } = await params;
  const result = await toggleCommentLike(account.id, commentId);
  if (!result) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }
  return NextResponse.json(result);
}
