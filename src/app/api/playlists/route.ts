// GET/POST /api/playlists — the signed-in account's real personal playlists.
import { NextResponse, type NextRequest } from "next/server";
import { createPlaylist, listPlaylists, type PlaylistVisibility } from "@/lib/server/viewerPlaylists";
import { verifyOwnProfileId } from "@/lib/server/familyProfiles";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ items: [] });
  }
  const videoId = request.nextUrl.searchParams.get("videoId") ?? undefined;
  const profileId = await verifyOwnProfileId(account.id, request.nextUrl.searchParams.get("profileId"));
  const items = await listPlaylists(account.id, profileId, videoId);
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { title?: string; description?: string; visibility?: PlaylistVisibility; profileId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.title || !body.title.trim()) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }

  const profileId = await verifyOwnProfileId(account.id, body.profileId);
  const result = await createPlaylist(account.id, profileId, {
    title: body.title,
    description: body.description,
    visibility: body.visibility,
  });
  if (result.outcome === "invalid") {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ playlist: result.playlist }, { status: 201 });
}
