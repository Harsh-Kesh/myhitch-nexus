// POST /api/studio/thumbnails — real custom-thumbnail upload (multipart form data).
// Thumbnails are small (a few MB) so this goes through our own server rather than a
// signed direct-to-storage URL, unlike the video master file.
import { NextResponse, type NextRequest } from "next/server";
import { uploadCustomThumbnail } from "@/lib/server/videoPublishing";
import { getRequestAccount } from "@/lib/server/rbac";

const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const channelId = form.get("channelId");
  const file = form.get("file");
  if (typeof channelId !== "string" || !channelId) {
    return NextResponse.json({ error: "channelId is required." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Thumbnail must be an image." }, { status: 400 });
  }
  if (file.size > MAX_THUMBNAIL_BYTES) {
    return NextResponse.json({ error: "Thumbnail must be under 5MB." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadCustomThumbnail(account.id, channelId, file.name, buffer, file.type);
    switch (result.outcome) {
      case "not_channel_member":
        return NextResponse.json({ error: "You aren't a member of that channel." }, { status: 403 });
      case "success":
        return NextResponse.json({ url: result.url });
    }
  } catch (err) {
    console.error("POST /api/studio/thumbnails failed", err);
    return NextResponse.json({ error: "Failed to upload the thumbnail." }, { status: 500 });
  }
}
