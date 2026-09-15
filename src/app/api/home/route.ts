// GET /api/home — the real Postgres-backed homepage feed (hero + rails), replacing the
// mock getFeaturedContent(). Public: a signed-out request gets the same rails minus the
// two personalized ones ("Continue watching", "From channels you follow").
import { NextResponse, type NextRequest } from "next/server";
import { getFeaturedRails } from "@/lib/server/catalogue";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  try {
    const account = await getRequestAccount(request);
    const featured = await getFeaturedRails(account?.id ?? null);
    return NextResponse.json(featured);
  } catch (err) {
    console.error("GET /api/home failed", err);
    return NextResponse.json({ error: "Failed to load the home feed." }, { status: 500 });
  }
}
