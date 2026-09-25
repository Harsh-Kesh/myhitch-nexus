// POST /api/live/events/[id]/end — the real end-of-stream transition, ownership-checked
// against the event's own channel (see liveEvents.ts's header for why this didn't exist).
import { NextResponse, type NextRequest } from "next/server";
import { endLiveEvent } from "@/lib/server/liveEvents";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await params;
  const result = await endLiveEvent(account.id, id);

  if (result.outcome === "not_found") {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }
  if (result.outcome === "not_channel_member") {
    return NextResponse.json({ error: "You don't have access to this event's channel." }, { status: 403 });
  }
  if (result.outcome === "invalid") {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ event: result.event });
}
