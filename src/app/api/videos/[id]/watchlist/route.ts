// POST /api/videos/[id]/watchlist — toggles the signed-in account's watchlist entry for
// this video. Real videos only: watchlist_items.video_id has a foreign key into videos,
// so a still-mock-shaped id (from a page that hasn't migrated off the mock store yet —
// see looksLikeRealId's comment in src/lib/mock-api/index.ts) can't be saved here at all.
import { NextResponse, type NextRequest } from "next/server";
import { videoExists } from "@/lib/server/catalogue";
import { toggleWatchlist } from "@/lib/server/engagement";
import { getRequestAccount } from "@/lib/server/rbac";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in to save titles to your watchlist." }, { status: 401 });
  }

  const { id } = await params;
  if (!(await videoExists(id))) {
    return NextResponse.json(
      { error: "This title isn't in the real catalogue yet." },
      { status: 404 },
    );
  }

  const inWatchlist = await toggleWatchlist(account.id, id);
  return NextResponse.json({ inWatchlist });
}
