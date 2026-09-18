// GET /api/studio/comments — real counterpart of the mock's getModerationComments():
// every comment (any status) across a channel's videos, for Studio's Comments page.
// Membership-gated — never serves another channel's comments.
import { NextResponse, type NextRequest } from "next/server";
import { listChannelComments } from "@/lib/server/engagement";
import { getRequestAccount } from "@/lib/server/rbac";
import { query } from "@/lib/server/db";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const channelId = request.nextUrl.searchParams.get("channelId");
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required." }, { status: 400 });
  }
  const membership = await query(
    `select 1 from memberships where account_id = $1 and organization_id = $2`,
    [account.id, channelId],
  );
  if (membership.length === 0) {
    return NextResponse.json({ error: "You aren't a member of that channel." }, { status: 403 });
  }

  try {
    const items = await listChannelComments(channelId);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/studio/comments failed", err);
    return NextResponse.json({ error: "Failed to load comments." }, { status: 500 });
  }
}
