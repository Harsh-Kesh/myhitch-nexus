// GET /api/watchlist — the signed-in account's saved titles, newest first.
import { NextResponse, type NextRequest } from "next/server";
import { getWatchlistVideos } from "@/lib/server/catalogue";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ items: [] });
  }
  const items = await getWatchlistVideos(account.id);
  return NextResponse.json({ items });
}
