// GET /api/campaigns/[id]/series — real daily delivery series backing the campaign
// detail modal's charts. Same ownership-or-admin-tier gate as GET /api/campaigns/[id].
import { NextResponse, type NextRequest } from "next/server";
import { getCampaignById, getCampaignSeries } from "@/lib/server/campaigns";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

const ADMIN_TIERS = ["moderator", "finance-admin", "super-admin"];

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  const campaign = await getCampaignById(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  const isAdmin = hasAnyRole(account, ADMIN_TIERS);
  if (!isAdmin && campaign.advertiserOrgId !== account.channelId) {
    return NextResponse.json({ error: "You aren't a member of that advertiser account." }, { status: 403 });
  }

  const days = Number(request.nextUrl.searchParams.get("days") ?? "28") || 28;
  const series = await getCampaignSeries(id, days);
  return NextResponse.json({ series });
}
