// GET /api/hub/app/movies/[id]/ — one movie for the MYHitch app (docs/api/nexus.md).
// 404 when it doesn't exist or isn't for rent or sale. Hub-only (X-Api-Key).
import { NextResponse, type NextRequest } from "next/server";
import { getAppMovie, requireHub } from "@/lib/server/appViewers";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireHub(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const movie = await getAppMovie(id);
    if (!movie) return NextResponse.json({ error: "This movie isn't available." }, { status: 404 });
    return NextResponse.json({ movie });
  } catch (err) {
    console.error(`GET /api/hub/app/movies/${id} failed`, err);
    return NextResponse.json({ error: "Couldn't load this movie. Try again." }, { status: 500 });
  }
}
