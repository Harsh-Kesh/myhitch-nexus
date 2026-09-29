// POST /api/ads/impression — the player calls this once a served ad actually starts
// playing. Writes the real revenue-ledger row (ad_impressions) and charges the
// campaign's budget; see adsServing.ts's recordAdImpression() for the split computation.
import { NextResponse, type NextRequest } from "next/server";
import { recordAdImpression } from "@/lib/server/adsServing";
import { getRequestAccount } from "@/lib/server/rbac";

interface ImpressionBody {
  campaignId?: string;
  creativeId?: string;
  videoId?: string;
  placement?: string;
}

export async function POST(request: NextRequest) {
  const account = await getRequestAccount(request);

  let body: ImpressionBody;
  try {
    body = (await request.json()) as ImpressionBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.campaignId || !body.creativeId || !body.placement) {
    return NextResponse.json({ error: "campaignId, creativeId and placement are required." }, { status: 400 });
  }
  if (!body.videoId && body.placement !== "sponsored-card") {
    return NextResponse.json({ error: "videoId is required for non-sponsored-card placements." }, { status: 400 });
  }

  try {
    const result = await recordAdImpression({
      campaignId: body.campaignId,
      creativeId: body.creativeId,
      videoId: body.videoId ?? null,
      placement: body.placement,
      viewerAccountId: account?.id ?? null,
    });
    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "Campaign or video not found." }, { status: 404 });
      case "budget_exhausted":
        return NextResponse.json({ error: "This campaign has no budget remaining." }, { status: 409 });
      case "success": {
        const response = NextResponse.json({ impressionId: result.impressionId }, { status: 201 });
        if (!account) {
          const current = parseInt(request.cookies.get("_nx_anon_ad_freq")?.value || "0", 10);
          response.cookies.set("_nx_anon_ad_freq", String(current + 1), { httpOnly: true, sameSite: "lax" });
        }
        return response;
      }
    }
  } catch (err) {
    console.error("POST /api/ads/impression failed", err);
    return NextResponse.json({ error: "Failed to record the impression." }, { status: 500 });
  }
}
