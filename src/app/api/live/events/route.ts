// GET/POST /api/live/events — real event creation/listing, the server-side counterpart of
// Studio's "Go Live Now" (previously 100% client-side/mock — see liveEvents.ts's header).
import { NextResponse, type NextRequest } from "next/server";
import { createLiveEvent, listChannelLiveEvents, type LiveEventAccessType } from "@/lib/server/liveEvents";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get("channelId");
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  }
  const events = await listChannelLiveEvents(channelId);
  return NextResponse.json({ events });
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!account.channelId) {
    return NextResponse.json({ error: "You need a creator or business channel to go live." }, { status: 403 });
  }

  let body: { title?: string; description?: string; accessType?: LiveEventAccessType; scheduledStart?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.title || !body.title.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const result = await createLiveEvent(account.id, account.channelId, {
    title: body.title,
    description: body.description,
    accessType: body.accessType,
    scheduledStart: body.scheduledStart,
  });

  if (result.outcome === "not_channel_member") {
    return NextResponse.json({ error: "You don't have access to this channel." }, { status: 403 });
  }
  if (result.outcome === "invalid") {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ event: result.event }, { status: 201 });
}
