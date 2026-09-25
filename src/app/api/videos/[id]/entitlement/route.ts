// GET /api/videos/[id]/entitlement — the real, server-side authorization gate for
// watching a video: owner bypass, geo-restriction, age-gating, and free/ad-supported/paid
// access, all in one place. Called unconditionally from mock-api/index.ts's
// getEntitlement() for every real video, signed in or not — see
// playbackAuthorization.ts's header for why this used to only cover paid content.
import { NextResponse, type NextRequest } from "next/server";
import { authorizeVideoAccess } from "@/lib/server/playbackAuthorization";
import { getRequestAccount } from "@/lib/server/rbac";
import { countryCodeFromHeaders } from "@/lib/server/requestMeta";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getRequestAccount(request);
  const profileId = request.nextUrl.searchParams.get("profileId");
  const country = countryCodeFromHeaders(request.headers);

  try {
    const result = await authorizeVideoAccess({
      accountId: account?.id ?? null,
      videoId: id,
      profileId,
      country,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error(`GET /api/videos/${id}/entitlement failed`, err);
    return NextResponse.json({ granted: false, blockReason: "unavailable" as const });
  }
}
