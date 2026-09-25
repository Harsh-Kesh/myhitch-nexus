// GET & POST /api/live/[id]/chat — Live chat messages (FR-6.5.3)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { canAccessLiveEvent, getLiveEventById, isLiveEventModerator } from "@/lib/server/liveEvents";
import {
  getLiveChatMessages,
  postLiveChatMessage,
} from "@/lib/server/liveChat";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: streamId } = await params;
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const since = searchParams.get("since") ?? undefined;

  // Real events (created via /api/live/events) enforce the event's own access rule — a
  // mock/demo stream id (not a real uuid) keeps its previous, unrestricted behavior.
  if (UUID_PATTERN.test(streamId)) {
    const event = await getLiveEventById(streamId);
    if (!event) {
      return NextResponse.json({ error: "Stream not found." }, { status: 404 });
    }
    const account = await getRequestAccount(request);
    if (!(await canAccessLiveEvent(event, account?.id ?? null))) {
      return NextResponse.json({ error: "You don't have access to this stream's chat." }, { status: 403 });
    }
  }

  const messages = await getLiveChatMessages(streamId, limit, since);
  return NextResponse.json({ messages });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: streamId } = await params;
  const account = await getRequestAccount(request);

  let body: {
    message?: string;
    authorName?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.message || !body.message.trim()) {
    return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  }

  // Real events (created via /api/live/events) enforce the event's own access rule and
  // resolve "creator" from actual channel ownership of *this* stream — a mock/demo stream
  // id (not a real uuid) keeps its previous, unrestricted, role-based behavior below.
  let authorRole: "viewer" | "creator" | "moderator" | "subscriber" = "viewer";
  if (account?.roles.includes("moderator") || account?.roles.includes("super-admin")) {
    authorRole = "moderator";
  } else if (UUID_PATTERN.test(streamId)) {
    const event = await getLiveEventById(streamId);
    if (!event) {
      return NextResponse.json({ error: "Stream not found." }, { status: 404 });
    }
    if (!(await canAccessLiveEvent(event, account?.id ?? null))) {
      return NextResponse.json({ error: "You don't have access to this stream's chat." }, { status: 403 });
    }
    if (account && (await isLiveEventModerator(account.id, streamId, account.roles))) {
      authorRole = "creator";
    }
  } else if (account?.roles.includes("creator") || account?.roles.includes("producer")) {
    authorRole = "creator";
  }

  try {
    const chatMessage = await postLiveChatMessage({
      streamId,
      accountId: account?.id ?? null,
      authorName: account?.fullName ?? body.authorName ?? "Guest Viewer",
      authorAvatarUrl: account?.avatarUrl ?? null,
      authorRole,
      message: body.message,
    });

    return NextResponse.json({ message: chatMessage }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send chat message";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
