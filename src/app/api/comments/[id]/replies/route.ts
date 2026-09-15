// POST /api/comments/[id]/replies — reply to a top-level comment. No videoExists guard
// needed here: replying targets an existing comment row directly, and a comment can only
// exist on a real (already-guarded-at-creation) video.
import { NextResponse, type NextRequest } from "next/server";
import { replyToComment } from "@/lib/server/engagement";
import { getRequestAccount } from "@/lib/server/rbac";

interface ReplyBody {
  body?: string;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in to reply." }, { status: 401 });
  }

  const { id } = await params;
  let payload: ReplyBody;
  try {
    payload = (await request.json()) as ReplyBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const body = payload.body?.trim();
  if (!body) {
    return NextResponse.json({ error: "Reply can't be empty." }, { status: 400 });
  }

  const comment = await replyToComment(
    { id: account.id, fullName: account.fullName, handle: account.handle },
    id,
    body,
  );
  if (!comment) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }
  return NextResponse.json(comment);
}
