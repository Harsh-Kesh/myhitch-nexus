// GET /api/admin/finance — real counterpart of the mock's buildPayouts()/usePlatformConfig()
// combo the /admin/finance page used before this. finance-admin/super-admin only.
import { NextResponse, type NextRequest } from "next/server";
import { getPlatformRevenueByStream, getPlatformRevenueSummary, getPlatformRevenueTrend } from "@/lib/server/commissions";
import { listPlatformPayouts } from "@/lib/server/payouts";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";
import { query } from "@/lib/server/db";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!hasAnyRole(account, ["finance-admin", "super-admin"])) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  // Commission rates already have a real branch via usePlatformConfig()
  // (mock-api/index.ts's getPlatformConfig()) — no need to duplicate that here.
  const [platform, trend, revenueByStream, organizations, failedRows] = await Promise.all([
    getPlatformRevenueSummary(),
    getPlatformRevenueTrend(30),
    getPlatformRevenueByStream(30),
    listPlatformPayouts(),
    query<{ count: string }>(`select count(*) as count from payouts where status = 'failed'`),
  ]);

  return NextResponse.json({
    platform,
    trend,
    revenueByStream,
    organizations,
    failedPayoutCount: Number(failedRows[0]?.count ?? 0),
  });
}
