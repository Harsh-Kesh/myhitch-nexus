// POST /api/studio/uploads/suggested-thumbnails — real frame extraction from an
// uploaded master, replacing the wizard's previously mocked "suggested frames" for real
// channels. See src/lib/server/thumbnailSuggestions.ts for the ffmpeg call.
import { NextResponse, type NextRequest } from "next/server";
import { generateSuggestedThumbnails } from "@/lib/server/videoPublishing";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { channelId?: string; masterAssetPath?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.channelId || !body.masterAssetPath) {
    return NextResponse.json({ error: "channelId and masterAssetPath are required." }, { status: 400 });
  }

  try {
    const result = await generateSuggestedThumbnails(account.id, body.channelId, body.masterAssetPath);
    switch (result.outcome) {
      case "not_channel_member":
        return NextResponse.json({ error: "You aren't a member of that channel." }, { status: 403 });
      case "asset_missing":
        return NextResponse.json(
          { error: "The uploaded file couldn't be found — try uploading it again." },
          { status: 409 },
        );
      case "success":
        return NextResponse.json({ items: result.suggestions });
    }
  } catch (err) {
    console.error("POST /api/studio/uploads/suggested-thumbnails failed", err);
    const message = err instanceof Error ? err.message : "Failed to generate suggested thumbnails.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
