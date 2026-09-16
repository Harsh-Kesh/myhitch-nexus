// GET /api/magazine — public list of published magazine articles. No auth required.
import { NextResponse, type NextRequest } from "next/server";
import { getPublishedArticles } from "@/lib/server/magazine";

export async function GET(request: NextRequest) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 24);
  try {
    const items = await getPublishedArticles(Number.isFinite(limit) ? limit : 24);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("GET /api/magazine failed", err);
    return NextResponse.json({ error: "Failed to load the magazine." }, { status: 500 });
  }
}
