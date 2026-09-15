// GET /api/continue-watching — the signed-in account's watch_progress rows, hydrated to
// full video display data, most recently updated first.
import { NextResponse, type NextRequest } from "next/server";
import { getContinueWatchingVideos } from "@/lib/server/catalogue";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ items: [] });
  }
  const items = await getContinueWatchingVideos(account.id);
  return NextResponse.json({ items });
}
