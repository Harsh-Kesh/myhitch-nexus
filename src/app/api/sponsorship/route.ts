// GET /api/sponsorship — public list of published sponsorship listings ("Exchange Hub").
// No auth required.
import { NextResponse, type NextRequest } from "next/server";
import { getPublishedListings } from "@/lib/server/sponsorship";

export async function GET(request: NextRequest) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 24);
  try {
    const items = await getPublishedListings(Number.isFinite(limit) ? limit : 24);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/sponsorship failed", err);
    return NextResponse.json({ error: "Failed to load the Exchange Hub." }, { status: 500 });
  }
}
