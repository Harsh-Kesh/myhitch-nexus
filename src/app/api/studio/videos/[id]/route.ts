// PATCH /api/studio/videos/[id] — real post-creation status changes from Studio's
// content list (the update-status gap docs/DEVELOPMENT-PLAN.md's admin-screens entry
// flagged: the mock updateVideoStatus() had no real branch, so it silently no-opped
// against a real video's row). Re-applies the same needsReview gate publishVideo()
// enforces at creation — see updateVideoStatus()'s own header comment.
import { NextResponse, type NextRequest } from "next/server";
import { updateVideoStatus } from "@/lib/server/videoPublishing";
import { getRequestAccount } from "@/lib/server/rbac";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.status) {
    return NextResponse.json({ error: "status is required." }, { status: 400 });
  }

  try {
    const result = await updateVideoStatus(account.id, id, body.status);
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
    return NextResponse.json({ error: "Failed to update the video's status." }, { status: 500 });
  }
}
