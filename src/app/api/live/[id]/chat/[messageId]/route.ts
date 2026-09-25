// DELETE /api/live/[id]/chat/[messageId] — Delete chat message (FR-6.5.3)
//
// Real per-stream moderator enforcement for a real event (created via /api/live/events) —
// see liveEvents.ts's header for why this previously could only require sign-in. A
// mock/demo stream id keeps the same sign-in-only bar it always had.
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { isLiveEventModerator } from "@/lib/server/liveEvents";
import { deleteLiveChatMessage } from "@/lib/server/liveChat";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { id: streamId, messageId } = await params;
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  if (!messageId) {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  if (UUID_PATTERN.test(streamId) && !(await isLiveEventModerator(account.id, streamId, account.roles))) {
    return NextResponse.json({ error: "You don't moderate this stream." }, { status: 403 });
  }

  const deleted = await deleteLiveChatMessage(messageId, streamId);
  return NextResponse.json({ success: deleted });
}
