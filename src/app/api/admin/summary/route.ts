// GET /api/admin/summary — real counterpart of the mock's getAdminSummary(). Admin-only.
import { NextResponse, type NextRequest } from "next/server";
import { getOpenQueueCounts, getModerationTrend } from "@/lib/server/moderation";
import { countOpenCopyrightCases } from "@/lib/server/copyright";
import { getPlatformRevenueSummary } from "@/lib/server/commissions";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";
import { query } from "@/lib/server/db";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["moderator", "finance-admin", "super-admin"])) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const [queueCounts, copyrightClaims, trend, usersRows, revenue] = await Promise.all([
    getOpenQueueCounts(),
    countOpenCopyrightCases(),
    getModerationTrend(30),
    query<{ count: string }>(`select count(*) as count from accounts`),
    getPlatformRevenueSummary(),
  ]);

  return NextResponse.json({
    pendingContent: queueCounts.pendingContent,
    reportedContent: queueCounts.reportedContent,
    copyrightClaims,
    liveIncidents: queueCounts.liveIncidents,
    verificationQueue: queueCounts.verificationQueue,
    // Advertising and live streaming are still mock-only end to end (no real campaigns/
    // live_events table exists yet) — nothing real to count, so these stay 0 rather than
    // borrowing numbers from the in-memory mock store, which wouldn't mean anything for a
    // real admin account anyway.
    campaignsAwaitingApproval: 0,
    activeLiveEvents: 0,
    totalUsers: Number(usersRows[0]?.count ?? 0),
    revenue30d: { amount: revenue.commission30dMinor, currency: revenue.currency },
    payoutsDue: { amount: revenue.payoutsDueMinor, currency: revenue.currency },
    trend,
  });
}
