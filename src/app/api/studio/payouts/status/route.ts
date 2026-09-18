// GET /api/studio/payouts/status?channelId=... — real onboarding status + available
// balance + payout history for a channel. Membership-gated.
import { NextResponse, type NextRequest } from "next/server";
import { getPayoutAccountStatus, getAvailableBalance, listPayouts } from "@/lib/server/payouts";
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
    const [status, balance, history] = await Promise.all([
      getPayoutAccountStatus(channelId),
      getAvailableBalance(channelId),
      listPayouts(channelId),
    ]);
    return NextResponse.json({ ...status, available: balance, history });
  } catch (err) {
    console.error("GET /api/studio/payouts/status failed", err);
    return NextResponse.json({ error: "Failed to load payout status." }, { status: 500 });
  }
}
