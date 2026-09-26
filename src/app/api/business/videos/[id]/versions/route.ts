// GET/POST /api/business/videos/[id]/versions — real version history for a video's
// master asset. POST registers a version whose file was already uploaded via the
// upload-url sub-route (createMasterUploadUrl's real signed-URL flow) — it never accepts
// a raw file itself.
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";
import { queryOne } from "@/lib/server/db";
import { createMasterDownloadUrl, masterAssetExists } from "@/lib/server/storage";
import { createVideoVersion, listVideoVersions, hasActiveEnterpriseSubscription } from "@/lib/server/enterprise";

// Version history is the "Version control" line item on the Nexus Enterprise plan, not
// Business — previously gated only on video ownership, so any business channel's own
// videos got real version history for free.
async function requireOwnedVideo(
  request: NextRequest,
  videoId: string,
): Promise<{ channelId: string; kind: "video" | "audio"; accountId: string } | { error: NextResponse }> {
  const account = await getRequestAccount(request);
  if (!account) {
    return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  }
  if (!hasAnyRole(account, ["producer"])) {
    return { error: NextResponse.json({ error: "This feature is included with Nexus Enterprise." }, { status: 403 }) };
  }
  const video = await queryOne<{ channel_id: string; kind: "video" | "audio" }>(
    `select channel_id, kind from videos where id = $1`,
    [videoId],
  );
  if (!video) {
    return { error: NextResponse.json({ error: "Video not found." }, { status: 404 }) };
  }
  const membership = await queryOne<{ id: string }>(
    `select id from memberships where account_id = $1 and organization_id = $2`,
    [account.id, video.channel_id],
  );
  if (!membership) {
    return { error: NextResponse.json({ error: "You don't own this video." }, { status: 403 }) };
  }
  if (!(await hasActiveEnterpriseSubscription(account.id))) {
    return { error: NextResponse.json({ error: "Your Enterprise application is still pending approval." }, { status: 403 }) };
  }
  return { channelId: video.channel_id, kind: video.kind, accountId: account.id };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await requireOwnedVideo(request, id);
  if ("error" in resolved) return resolved.error;

  const versions = await listVideoVersions(id);
  const withUrls = await Promise.all(
    versions.map(async (version) => ({
      ...version,
      // asset_url is stored as a private storage path (never a raw public URL) — mint a
      // fresh 1-hour signed link on every read, same pattern the real download feature
      // already uses, rather than a link that could go stale or leak indefinitely.
      downloadUrl: await createMasterDownloadUrl(version.assetUrl, resolved.kind, 3600).catch(() => null),
    })),
  );
  return NextResponse.json({ versions: withUrls });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await requireOwnedVideo(request, id);
  if ("error" in resolved) return resolved.error;

  let body: { title?: string; path?: string; changesNotes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.title?.trim() || !body.path) {
    return NextResponse.json({ error: "title and path are required." }, { status: 400 });
  }

  const exists = await masterAssetExists(body.path, resolved.kind);
  if (!exists.exists) {
    return NextResponse.json({ error: "That upload hasn't completed yet." }, { status: 409 });
  }

  const version = await createVideoVersion({
    videoId: id,
    title: body.title,
    assetUrl: body.path,
    changesNotes: body.changesNotes,
    createdBy: resolved.accountId,
  });
  return NextResponse.json({ version }, { status: 201 });
}
