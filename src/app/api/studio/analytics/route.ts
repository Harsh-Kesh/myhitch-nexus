// GET /api/studio/analytics?channelId=&range= — real counterpart of the mock's
// getCreatorAnalytics(), first slice. See analytics.ts's module header for exactly what
// is and isn't real yet.
import { NextResponse, type NextRequest } from "next/server";
import { getRealCreatorAnalytics, type AnalyticsRange } from "@/lib/server/analytics";
import { getRequestAccount } from "@/lib/server/rbac";
import { query } from "@/lib/server/db";

const VALID_RANGES: AnalyticsRange[] = ["7d", "28d", "90d", "365d"];

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const channelId = request.nextUrl.searchParams.get("channelId");
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required." }, { status: 400 });
  }
  const membership = await query(`select 1 from memberships where account_id = $1 and organization_id = $2`, [
    account.id,
    channelId,
  ]);
  if (membership.length === 0) {
    return NextResponse.json({ error: "You aren't a member of that channel." }, { status: 403 });
  }

  const rangeParam = request.nextUrl.searchParams.get("range") ?? "28d";
  const range = VALID_RANGES.includes(rangeParam as AnalyticsRange) ? (rangeParam as AnalyticsRange) : "28d";

  try {
    const analytics = await getRealCreatorAnalytics(channelId, range);
    return NextResponse.json(analytics);
  } catch (err) {
    console.error("GET /api/studio/analytics failed", err);
    return NextResponse.json({ error: "Failed to load analytics." }, { status: 500 });
  }
}
