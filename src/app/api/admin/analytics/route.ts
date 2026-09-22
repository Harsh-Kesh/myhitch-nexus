// GET /api/admin/analytics — real platform-wide engagement analytics, backing the
// /admin/analytics page. moderator/finance-admin/super-admin (every tier has a
// legitimate reason to see engagement data — unlike finance/users, this isn't scoped to
// one function's concern).
import { NextResponse, type NextRequest } from "next/server";
import { getPlatformAnalytics, type AnalyticsRange } from "@/lib/server/analytics";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

const VALID_RANGES: AnalyticsRange[] = ["7d", "28d", "90d", "365d"];

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["moderator", "finance-admin", "super-admin"])) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const rangeParam = request.nextUrl.searchParams.get("range") ?? "28d";
  const range = VALID_RANGES.includes(rangeParam as AnalyticsRange) ? (rangeParam as AnalyticsRange) : "28d";

  try {
    const analytics = await getPlatformAnalytics(range);
    return NextResponse.json(analytics);
  } catch (err) {
    console.error("GET /api/admin/analytics failed", err);
    return NextResponse.json({ error: "Failed to load analytics." }, { status: 500 });
  }
}
