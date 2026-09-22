// GET /api/ads/serve?videoId=X&placement=pre-roll — the real ad-decisioning endpoint the
// player calls before content playback. No auth required (an ad can serve to a guest
// viewer — frequency capping just doesn't apply to them, see adFrequency.ts); a signed-in
// viewer's real session, if present, is used for country/language/device signals exactly
// like requestMeta.ts's existing analytics use, plus frequency capping.
import { NextResponse, type NextRequest } from "next/server";
import { findServableAd } from "@/lib/server/adsServing";
import { getRequestAccount } from "@/lib/server/rbac";
import { classifyDevice, languageFromHeaders } from "@/lib/server/requestMeta";
import { checkRealContentAccess } from "@/lib/server/subscriptions";

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId");
  const placement = request.nextUrl.searchParams.get("placement");
  if (!placement) {
    return NextResponse.json({ error: "placement is required." }, { status: 400 });
  }
  if (!videoId && placement !== "sponsored-card") {
    return NextResponse.json({ error: "videoId is required for non-sponsored-card placements." }, { status: 400 });
  }

  const account = await getRequestAccount(request);
  // Premium and Family subscribers receive ad-free content across the platform.
  if (account && (await checkRealContentAccess(account.id))) {
    return NextResponse.json({ ad: null });
  }
  // Raw ISO code, matching how target_countries is stored (see storage.ts's COUNTRIES
  // list in the upload wizard) — deliberately not countryFromHeaders()'s display-name
  // output, which is for the analytics UI, not for matching against stored codes.
  const countryCode = request.headers.get("cf-ipcountry");
  const country = countryCode && countryCode.length === 2 ? countryCode.toUpperCase() : null;

  const match = await findServableAd({
    videoId,
    placement,
    viewerAccountId: account?.id ?? null,
    country,
    language: languageFromHeaders(request.headers),
    device: classifyDevice(request.headers),
  });

  if (!match) {
    return NextResponse.json({ ad: null });
  }

  return NextResponse.json({
    ad: {
      campaignId: match.campaignId,
      creativeId: match.creativeId,
      assetUrl: match.assetUrl,
      clickThroughUrl: match.clickThroughUrl,
      durationSeconds: match.durationSeconds,
    },
  });
}
