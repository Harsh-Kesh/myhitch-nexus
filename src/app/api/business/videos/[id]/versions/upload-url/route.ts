// POST /api/business/videos/[id]/versions/upload-url — a real signed upload URL for a
// new version's asset file, same signed-URL-direct-to-storage pattern the main upload
// wizard already uses (createMasterUploadUrl). The client PUTs the file directly to
// Supabase Storage, then calls POST /api/business/videos/[id]/versions with the
// returned `path` to actually register the version row.
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { queryOne } from "@/lib/server/db";
import { createMasterUploadUrl } from "@/lib/server/storage";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  const video = await queryOne<{ channel_id: string; kind: "video" | "audio" }>(
    `select channel_id, kind from videos where id = $1`,
    [id],
  );
  if (!video) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }
  const membership = await queryOne<{ id: string }>(
    `select id from memberships where account_id = $1 and organization_id = $2`,
    [account.id, video.channel_id],
  );
  if (!membership) {
    return NextResponse.json({ error: "You don't own this video." }, { status: 403 });
  }

  let body: { fileName?: string; fileSizeBytes?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.fileName || typeof body.fileSizeBytes !== "number") {
    return NextResponse.json({ error: "fileName and fileSizeBytes are required." }, { status: 400 });
  }

  try {
    const { path, signedUrl, token } = await createMasterUploadUrl(
      video.channel_id,
      body.fileName,
      body.fileSizeBytes,
      video.kind,
    );
    return NextResponse.json({ path, signedUrl, token });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create an upload URL." },
      { status: 400 },
    );
  }
}
