// GET/POST /api/studio/series — a channel's own series (real, 2026-09-17). GET lists
// them for the Studio "Playlists & series" page and the upload wizard's series picker;
// POST creates one. See src/lib/server/series.ts for the actual queries.
import { NextResponse, type NextRequest } from "next/server";
import { createSeries, listSeriesForChannel } from "@/lib/server/series";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const channelId = request.nextUrl.searchParams.get("channelId");
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required." }, { status: 400 });
  }

  try {
    const items = await listSeriesForChannel(channelId);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/studio/series failed", err);
    return NextResponse.json({ error: "Failed to load series." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { channelId?: string; title?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.channelId || !body.title) {
    return NextResponse.json({ error: "channelId and title are required." }, { status: 400 });
  }

  try {
    const result = await createSeries(account.id, body.channelId, body.title, body.description ?? null);
    switch (result.outcome) {
      case "not_channel_member":
        return NextResponse.json({ error: "You aren't a member of that channel." }, { status: 403 });
      case "invalid":
        return NextResponse.json({ error: result.reason }, { status: 400 });
      case "success":
        return NextResponse.json(result.series, { status: 201 });
    }
  } catch (err) {
    console.error("POST /api/studio/series failed", err);
    return NextResponse.json({ error: "Failed to create the series." }, { status: 500 });
  }
}
