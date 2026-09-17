// POST /api/studio/videos — the real, server-enforced publish gate (AC-3). See
// publishVideo()'s own header for exactly what it checks; this route is a thin
// auth/validation wrapper around it, same shape as every other Studio write route.
import { NextResponse, type NextRequest } from "next/server";
import { publishVideo, type PublishVideoInput } from "@/lib/server/videoPublishing";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: Partial<PublishVideoInput>;
  try {
    body = (await request.json()) as Partial<PublishVideoInput>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.channelId || !body.masterAssetPath || !body.title || !body.rights || !body.pricing || !body.status) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  try {
    const result = await publishVideo(account.id, body as PublishVideoInput);
    switch (result.outcome) {
      case "not_channel_member":
        return NextResponse.json({ error: "You aren't a member of that channel." }, { status: 403 });
      case "invalid":
        return NextResponse.json({ error: result.reason }, { status: 400 });
      case "asset_missing":
        return NextResponse.json(
          { error: "The uploaded file couldn't be found — try uploading it again." },
          { status: 409 },
        );
      case "invalid_file":
        return NextResponse.json({ error: result.reason }, { status: 422 });
      case "success":
        return NextResponse.json({ id: result.id, slug: result.slug, status: result.status }, { status: 201 });
    }
  } catch (err) {
    console.error("POST /api/studio/videos failed", err);
    return NextResponse.json({ error: "Failed to publish the video." }, { status: 500 });
  }
}
