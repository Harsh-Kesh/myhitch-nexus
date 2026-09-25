// GET /api/continue-watching — the signed-in account's watch_progress rows, hydrated to
// full video display data, most recently updated first. Scoped to `profileId` when given
// (Family Tier) so a kids profile doesn't see an adult profile's continue-watching rail.
import { NextResponse, type NextRequest } from "next/server";
import { getContinueWatchingVideos } from "@/lib/server/catalogue";
import { verifyOwnProfileId } from "@/lib/server/familyProfiles";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ items: [] });
  }
  const profileId = await verifyOwnProfileId(account.id, request.nextUrl.searchParams.get("profileId"));
  const items = await getContinueWatchingVideos(account.id, profileId);
  return NextResponse.json({ items });
}
