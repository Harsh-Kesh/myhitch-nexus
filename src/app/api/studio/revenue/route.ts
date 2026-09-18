// GET /api/studio/revenue?channelId=... — real counterpart of the mock's
// getRevenueSummary(), for Studio's Revenue page. See commerce.ts's
// getRealRevenueSummary() for what this deliberately does and doesn't cover.
import { NextResponse, type NextRequest } from "next/server";
import { getRealRevenueSummary } from "@/lib/server/commerce";
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
    const summary = await getRealRevenueSummary(channelId);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("GET /api/studio/revenue failed", err);
    return NextResponse.json({ error: "Failed to load revenue." }, { status: 500 });
  }
}
