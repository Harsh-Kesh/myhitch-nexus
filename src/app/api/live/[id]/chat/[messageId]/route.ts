// DELETE /api/live/[id]/chat/[messageId] — Delete chat message (FR-6.5.3)
import { NextResponse, type NextRequest } from "next/server";
import { deleteLiveChatMessage } from "@/lib/server/liveChat";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { id: streamId, messageId } = await params;

  if (!messageId) {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  const deleted = await deleteLiveChatMessage(messageId, streamId);
  return NextResponse.json({ success: deleted });
}
