// GET /api/campaigns/estimate — real addressable-audience count for the campaign wizard's
// live "Estimated delivery" panel, replacing the fabricated 12M-viewer formula with an
// actual count of real recent viewers matching the campaign's own targeting.
import { NextResponse, type NextRequest } from "next/server";
import { getRequestAccount } from "@/lib/server/rbac";
import { estimateCampaignAudience } from "@/lib/server/campaigns";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const countries = (request.nextUrl.searchParams.get("countries") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const devices = (request.nextUrl.searchParams.get("devices") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const estimate = await estimateCampaignAudience({ countries, devices });
  return NextResponse.json(estimate);
}
