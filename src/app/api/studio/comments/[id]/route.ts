// PATCH /api/studio/comments/[id] — real counterpart of the mock's moderateComment().
// Ownership (comment -> video -> channel -> membership) is checked inside
// moderateComment() itself, not here.
import { NextResponse, type NextRequest } from "next/server";
import { moderateComment, type ModerateCommentAction } from "@/lib/server/engagement";
import { getRequestAccount } from "@/lib/server/rbac";

const VALID_ACTIONS: ModerateCommentAction[] = ["publish", "hold", "remove", "pin", "heart"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.action || !VALID_ACTIONS.includes(body.action as ModerateCommentAction)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  try {
    const result = await moderateComment(
      { id: account.id, name: account.fullName },
      id,
      body.action as ModerateCommentAction,
    );
    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "Comment not found." }, { status: 404 });
      case "not_channel_member":
        return NextResponse.json({ error: "You don't own this video's channel." }, { status: 403 });
      case "success":
        return NextResponse.json(result.comment);
    }
  } catch (err) {
    console.error(`PATCH /api/studio/comments/${id} failed`, err);
    return NextResponse.json({ error: "Failed to update the comment." }, { status: 500 });
  }
}
