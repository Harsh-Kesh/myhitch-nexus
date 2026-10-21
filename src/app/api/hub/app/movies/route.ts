// GET /api/hub/app/movies/ — every movie a viewer can rent or buy, for the MYHitch app
// (the hub's /v1/nexus/app/movies; contract: docs/api/nexus.md in the app repo). Only
// videos whose creator offers rent and/or buy, at the creator's own prices (appViewers.ts).
// Hub-only (X-Api-Key); no viewer needed.
import { NextResponse, type NextRequest } from "next/server";
import { listAppMovies, requireHub } from "@/lib/server/appViewers";

export async function GET(request: NextRequest) {
  const denied = requireHub(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ movies: await listAppMovies() });
  } catch (err) {
    console.error("GET /api/hub/app/movies failed", err);
    return NextResponse.json({ error: "Couldn't load movies. Try again." }, { status: 500 });
  }
}
