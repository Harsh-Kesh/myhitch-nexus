import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { getCreatorTippingSummary } from "@/lib/server/tipping";
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

  // If channelId is a UUID, verify membership; for demo/mock channels, allow creator
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelId);
  if (isUuid) {
    const membership = await query(
      `select 1 from memberships where account_id = $1 and organization_id = $2`,
      [account.id, channelId],
    );
    if (membership.length === 0) {
      return NextResponse.json({ error: "You aren't a member of that channel." }, { status: 403 });
    }
  }

  try {
    const summary = await getCreatorTippingSummary(channelId);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("GET /api/studio/tips failed", err);
    return NextResponse.json({ error: "Failed to load tips." }, { status: 500 });
  }
}
