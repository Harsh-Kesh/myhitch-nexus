// GET /api/live/events/[id] — real event detail lookup.
import { NextResponse, type NextRequest } from "next/server";
import { getLiveEventById } from "@/lib/server/liveEvents";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getLiveEventById(id);
  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }
  return NextResponse.json(event);
}
