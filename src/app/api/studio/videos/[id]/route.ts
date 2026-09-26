// PATCH /api/studio/videos/[id] — real post-creation changes from Studio's content list:
// `{ status }` for a status change (the update-status gap docs/DEVELOPMENT-PLAN.md's
// admin-screens entry flagged: the mock updateVideoStatus() had no real branch, so it
// silently no-opped against a real video's row), or `{ details }` for metadata edits
// (title/description/categories/tags/rights/pricing/etc — see updateVideoDetails()'s own
// header comment for why this didn't exist at all until now).
import { NextResponse, type NextRequest } from "next/server";
import { updateVideoDetails, updateVideoStatus, type UpdateVideoDetailsInput } from "@/lib/server/videoPublishing";
import { getRequestAccount } from "@/lib/server/rbac";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  let body: { status?: string; details?: UpdateVideoDetailsInput };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.status && !body.details) {
    return NextResponse.json({ error: "status or details is required." }, { status: 400 });
  }

  try {
    if (body.details) {
      const result = await updateVideoDetails(account.id, id, body.details);
      switch (result.outcome) {
        case "not_found":
          return NextResponse.json({ error: "Video not found." }, { status: 404 });
        case "not_channel_member":
          return NextResponse.json({ error: "You don't own this video." }, { status: 403 });
        case "invalid":
          return NextResponse.json({ error: result.reason }, { status: 400 });
        case "success":
          return NextResponse.json({ id });
      }
    }

    const result = await updateVideoStatus(account.id, id, body.status!);
    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "Video not found." }, { status: 404 });
      case "not_channel_member":
        return NextResponse.json({ error: "You don't own this video." }, { status: 403 });
      case "invalid":
        return NextResponse.json({ error: result.reason }, { status: 400 });
      case "success":
        return NextResponse.json({ id, status: result.status });
    }
  } catch (err) {
    console.error(`PATCH /api/studio/videos/${id} failed`, err);
    return NextResponse.json({ error: "Failed to update the video." }, { status: 500 });
  }
}
