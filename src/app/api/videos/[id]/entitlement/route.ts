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
    // The real, server-detected country (cf-ipcountry) — the client used to always show
    // its own mock store's hardcoded "GB" default here regardless of the real decision,
    // so a real geo-block against, say, a real US visitor rendered the nonsensical "not
    // licensed for GB... available in GB, IE, FR" (GB genuinely was one of the permitted
    // countries — the message just never named the visitor's real one). Only meaningful
    // when it resolved to something; null (no cf-ipcountry, e.g. local dev) is handled
    // client-side same as before.
    return NextResponse.json({ ...result, detectedCountry: country });
  } catch (err) {
    console.error(`GET /api/videos/${id}/entitlement failed`, err);
    return NextResponse.json({ granted: false, blockReason: "unavailable" as const });
  }
}
