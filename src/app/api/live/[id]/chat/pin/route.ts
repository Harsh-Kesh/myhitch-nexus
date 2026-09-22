// POST /api/live/[id]/chat/pin — Pin chat message (FR-6.5.3)
import { NextResponse, type NextRequest } from "next/server";
import { pinLiveChatMessage } from "@/lib/server/liveChat";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: streamId } = await params;

  let body: { messageId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.messageId) {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  const pinned = await pinLiveChatMessage(body.messageId, streamId);
  return NextResponse.json({ success: pinned });
}
