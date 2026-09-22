// GET/POST /api/campaigns — real counterpart of the mock's getCampaigns()/createCampaign().
// An advertiser sees only their own org's campaigns; moderator/finance-admin/super-admin
// see every campaign (optionally filtered by status) for the /admin/ads approval queue —
// same "one list endpoint, two audiences" shape /api/admin/moderation already uses.
import { NextResponse, type NextRequest } from "next/server";
import { createCampaign, listCampaigns, type CreateCampaignInput } from "@/lib/server/campaigns";
import { getRequestAccount, hasAnyRole } from "@/lib/server/rbac";

const ADMIN_TIERS = ["moderator", "finance-admin", "super-admin"];

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const isAdmin = hasAnyRole(account, ADMIN_TIERS);
  const statusFilter = request.nextUrl.searchParams.get("status");

  if (!isAdmin) {
    if (!account.channelId) {
      return NextResponse.json({ campaigns: [] });
    }
    const campaigns = await listCampaigns({ advertiserOrgId: account.channelId });
    return NextResponse.json({ campaigns: statusFilter ? campaigns.filter((c) => c.status === statusFilter) : campaigns });
  }

  const campaigns = await listCampaigns();
  return NextResponse.json({ campaigns: statusFilter ? campaigns.filter((c) => c.status === statusFilter) : campaigns });
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!account.channelId) {
    return NextResponse.json({ error: "You need an advertiser account to create a campaign." }, { status: 403 });
  }

  let body: Partial<CreateCampaignInput>;
  try {
    body = (await request.json()) as Partial<CreateCampaignInput>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (
    !body.name ||
    !body.objective ||
    !body.budgetMinor ||
    !body.dailyCapMinor ||
    !body.cpmMinor ||
    !body.startDate ||
    !body.endDate
  ) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const input: CreateCampaignInput = {
    name: body.name,
    objective: body.objective,
    budgetMinor: body.budgetMinor,
    dailyCapMinor: body.dailyCapMinor,
    cpmMinor: body.cpmMinor,
    startDate: body.startDate,
    endDate: body.endDate,
    targeting: {
      countries: body.targeting?.countries ?? [],
      languages: body.targeting?.languages ?? [],
      ageBands: body.targeting?.ageBands ?? [],
      interests: body.targeting?.interests ?? [],
      categoryIds: body.targeting?.categoryIds ?? [],
      devices: body.targeting?.devices ?? [],
    },
    placements: body.placements ?? [],
    frequencyCap: body.frequencyCap ?? { impressions: 3, perHours: 24 },
    brandSafety: body.brandSafety ?? { excludedLabels: [], minAgeRating: "U", blockUserGenerated: false },
  };

  try {
    const result = await createCampaign(account.id, account.channelId, input);
    if (result.outcome === "not_org_member") {
      return NextResponse.json({ error: "You aren't a member of that advertiser account." }, { status: 403 });
    }
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/campaigns failed", err);
    return NextResponse.json({ error: "Failed to create the campaign." }, { status: 500 });
  }
}
