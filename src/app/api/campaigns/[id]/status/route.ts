// PATCH /api/campaigns/[id]/status — real counterpart of the mock's
// updateCampaignStatus(id, status, reason), used unchanged by both /admin/ads (approve:
// status='active', reject/suspend: status='rejected') and business/campaigns (pause:
// status='paused', resume: status='active'). Dispatches on the actor's real tier plus the
// requested status rather than a separate action field, so neither existing UI needs to
// change: an admin tier requesting 'active'/'rejected' is the approval gate
// (decideCampaign); anyone else requesting 'active'/'paused' is the owning advertiser's
// own pause/resume (setCampaignPauseState).
import { NextResponse, type NextRequest } from "next/server";
import { decideCampaign, setCampaignPauseState } from "@/lib/server/campaigns";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

interface StatusBody {
  status?: string;
  reason?: string;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  let body: StatusBody;
  try {
    body = (await request.json()) as StatusBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const isAdmin = hasAnyRole(account, ["moderator", "super-admin"]);
  const reason = body.reason?.trim() ?? "";

  if (isAdmin && (body.status === "active" || body.status === "rejected")) {
    if (body.status === "rejected" && !reason) {
      return NextResponse.json({ error: "A reason is required to reject or suspend a campaign." }, { status: 400 });
    }
    try {
      const result = await decideCampaign(
        { id: account.id, name: account.fullName, roles: account.roles },
        id,
        body.status,
        reason,
      );
      switch (result.outcome) {
        case "not_found":
          return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
        case "no_approved_creatives":
          return NextResponse.json(
            { error: "This campaign has no creative with a real uploaded asset — upload one before approving it." },
            { status: 409 },
          );
        case "success":
          return NextResponse.json({ ok: true });
      }
    } catch (err) {
      console.error(`PATCH /api/campaigns/${id}/status (admin) failed`, err);
      return NextResponse.json({ error: "Failed to record the decision." }, { status: 500 });
    }
  }

  if (body.status === "active" || body.status === "paused") {
    try {
      const result = await setCampaignPauseState({ id: account.id, name: account.fullName }, id, body.status, reason);
      switch (result.outcome) {
        case "not_found":
          return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
        case "not_org_member":
          return NextResponse.json({ error: "You aren't a member of that advertiser account." }, { status: 403 });
        case "invalid":
          return NextResponse.json({ error: "This campaign isn't in a state that can be paused or resumed." }, { status: 409 });
        case "success":
          return NextResponse.json({ ok: true });
      }
    } catch (err) {
      console.error(`PATCH /api/campaigns/${id}/status failed`, err);
      return NextResponse.json({ error: "Failed to update the campaign." }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid status." }, { status: 400 });
}
