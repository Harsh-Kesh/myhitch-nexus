// POST /api/campaigns/[id]/submit — the advertiser's own real, automated approval trigger
// (campaigns.ts's autoActivateCampaign()). No moderator/admin action required — see that
// function's header for the client's "no platform staff in ordinary product flows" policy
// and what's automated vs. disclosed as not.
import { NextResponse, type NextRequest } from "next/server";
import { autoActivateCampaign } from "@/lib/server/campaigns";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  const result = await autoActivateCampaign(account.id, id);
  if (result.outcome === "not_found") {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (result.outcome === "not_org_member") {
    return NextResponse.json({ error: "You don't have access to this campaign." }, { status: 403 });
  }
  if (result.outcome === "invalid_state") {
    return NextResponse.json({ error: "This campaign has already been decided." }, { status: 409 });
  }
  return NextResponse.json({ status: result.status, reason: result.reason });
}
