// GET /api/videos/[id]/download — mints a real, short-lived signed download URL for
// offline playback (playbackAuthorization.ts's mintVideoDownloadUrl()). Real Premium/
// Family + entitlement gate — see that function's header for why "can watch" and "can
// download" aren't quite the same check.
import { NextResponse, type NextRequest } from "next/server";
import { mintVideoDownloadUrl } from "@/lib/server/playbackAuthorization";
import { getRequestAccount } from "@/lib/server/rbac";
import { countryCodeFromHeaders } from "@/lib/server/requestMeta";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;
  const profileId = request.nextUrl.searchParams.get("profileId");
  const country = countryCodeFromHeaders(request.headers);

  const result = await mintVideoDownloadUrl(account.id, id, profileId, country);
  switch (result.outcome) {
    case "not_found":
      return NextResponse.json({ error: "This title isn't in the real catalogue yet." }, { status: 404 });
    case "not_premium":
      return NextResponse.json(
        { error: "Downloads are available with Nexus Premium and Family plans." },
        { status: 403 },
      );
    case "not_entitled":
      return NextResponse.json({ error: "You don't have access to this title." }, { status: 403 });
    case "not_processed":
      return NextResponse.json(
        { error: "This title isn't ready for download yet — try again shortly." },
        { status: 409 },
      );
    case "success":
      return NextResponse.json({ url: result.url, expiresAt: result.expiresAt });
  }
}
