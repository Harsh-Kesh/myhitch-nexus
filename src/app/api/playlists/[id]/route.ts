// GET/PATCH/DELETE /api/playlists/[id] — a single real playlist's detail/update/delete.
import { NextResponse, type NextRequest } from "next/server";
import {
  deletePlaylist,
  getPlaylistById,
  updatePlaylist,
  type PlaylistVisibility,
} from "@/lib/server/viewerPlaylists";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  const { id } = await params;
  const result = await getPlaylistById(id, account?.id ?? null);
  if (!result) {
    return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
  }
  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  let body: { title?: string; description?: string; visibility?: PlaylistVisibility };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = await updatePlaylist(account.id, id, body);
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

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  const result = await deletePlaylist(account.id, id);
  if (result.outcome === "not_found") {
    return NextResponse.json({ error: "Playlist not found." }, { status: 404 });
  }
  if (result.outcome === "not_owner") {
    return NextResponse.json({ error: "You don't own this playlist." }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
