// POST /api/campaigns/[id]/creatives — same signed-upload-URL shape as
// /api/studio/uploads: creates the creative row, returns a real Supabase Storage
// signed URL the browser PUTs the ad video/image directly to.
import { NextResponse, type NextRequest } from "next/server";
import { createCreativeUploadUrl } from "@/lib/server/campaigns";
import { getRequestAccount } from "@/lib/server/rbac";

interface CreateCreativeBody {
  name?: string;
  format?: string;
  durationSeconds?: number;
  clickThroughUrl?: string | null;
  fileName?: string;
  fileSizeBytes?: number;
}

const VALID_FORMATS = ["pre-roll", "mid-roll", "post-roll", "overlay", "sponsored-card"];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  let body: CreateCreativeBody;
  try {
    body = (await request.json()) as CreateCreativeBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.name || !body.format || !VALID_FORMATS.includes(body.format) || !body.fileName || !body.fileSizeBytes) {
    return NextResponse.json({ error: "name, a valid format, fileName and fileSizeBytes are required." }, { status: 400 });
  }

  try {
    const result = await createCreativeUploadUrl(account.id, id, {
      name: body.name,
      format: body.format,
      durationSeconds: body.durationSeconds ?? 0,
      clickThroughUrl: body.clickThroughUrl ?? null,
      fileName: body.fileName,
      fileSizeBytes: body.fileSizeBytes,
    });
    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      case "not_org_member":
        return NextResponse.json({ error: "You aren't a member of that advertiser account." }, { status: 403 });
      case "success":
        return NextResponse.json(
          { creativeId: result.creativeId, path: result.path, signedUrl: result.signedUrl, token: result.token, maxBytes: result.maxBytes },
          { status: 201 },
        );
    }
  } catch (err) {
    console.error(`POST /api/campaigns/${id}/creatives failed`, err);
    return NextResponse.json({ error: "Failed to create an upload URL." }, { status: 500 });
  }
}
