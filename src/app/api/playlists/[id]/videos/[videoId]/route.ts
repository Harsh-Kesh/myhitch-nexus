// POST/DELETE /api/playlists/[id]/videos/[videoId] — add/remove a video from a real
// playlist you own.
import { NextResponse, type NextRequest } from "next/server";
import { addVideoToPlaylist, removeVideoFromPlaylist } from "@/lib/server/viewerPlaylists";
import { getRequestAccount } from "@/lib/server/rbac";

function mapResult(result: { outcome: string; reason?: string }) {
  if (result.outcome === "not_found") {
    return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
  }
  if (result.outcome === "not_owner") {
    return NextResponse.json({ error: "You don't own this playlist." }, { status: 403 });
  }
  if (result.outcome === "invalid") {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; videoId: string }> },
) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id, videoId } = await params;
  const result = await addVideoToPlaylist(account.id, id, videoId);
  return mapResult(result);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; videoId: string }> },
) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id, videoId } = await params;
  const result = await removeVideoFromPlaylist(account.id, id, videoId);
  return mapResult(result);
}
