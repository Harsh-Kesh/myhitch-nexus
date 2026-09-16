// POST /api/studio/uploads — creates a signed Supabase Storage upload URL for a video
// master file. The browser uploads the file directly to that URL; it never passes
// through our own server. See src/lib/server/storage.ts's header for why Supabase
// Storage (not Mux) and why the size cap.
import { NextResponse, type NextRequest } from "next/server";
import { createUploadUrl } from "@/lib/server/videoPublishing";
import { getRequestAccount } from "@/lib/server/rbac";

interface CreateUploadBody {
  channelId?: string;
  fileName?: string;
  fileSizeBytes?: number;
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: CreateUploadBody;
  try {
    body = (await request.json()) as CreateUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.channelId || !body.fileName || !body.fileSizeBytes) {
    return NextResponse.json({ error: "channelId, fileName and fileSizeBytes are required." }, { status: 400 });
  }

  try {
    const result = await createUploadUrl(account.id, body.channelId, body.fileName, body.fileSizeBytes);
    switch (result.outcome) {
      case "not_channel_member":
        return NextResponse.json({ error: "You aren't a member of that channel." }, { status: 403 });
      case "too_large":
        return NextResponse.json(
          { error: `File is too large for this preview build (max ${Math.round(result.maxBytes / (1024 * 1024))}MB).` },
          { status: 400 },
        );
      case "success":
        return NextResponse.json({
          path: result.path,
          signedUrl: result.signedUrl,
          token: result.token,
          maxBytes: result.maxBytes,
        });
    }
  } catch (err) {
    console.error("POST /api/studio/uploads failed", err);
    return NextResponse.json({ error: "Failed to create an upload URL." }, { status: 500 });
  }
}
