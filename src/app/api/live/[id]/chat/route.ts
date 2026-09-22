// GET & POST /api/live/[id]/chat — Live chat messages (FR-6.5.3)
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import {
  getLiveChatMessages,
  postLiveChatMessage,
} from "@/lib/server/liveChat";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: streamId } = await params;
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const since = searchParams.get("since") ?? undefined;

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

  // Determine author role
  let authorRole: "viewer" | "creator" | "moderator" | "subscriber" = "viewer";
  if (account) {
    if (account.roles.includes("moderator") || account.roles.includes("super-admin")) {
      authorRole = "moderator";
    } else if (account.roles.includes("creator") || account.roles.includes("producer")) {
      authorRole = "creator";
    }
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
