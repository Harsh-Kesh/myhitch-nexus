// POST /api/ads/complete — the player calls this when an ad finishes playing to completion.
// Updates ad_impressions.completed_at for completed-views tracking (FR-6.8.5).
import { NextResponse, type NextRequest } from "next/server";
import { recordAdCompletion } from "@/lib/server/adsServing";

export async function POST(request: NextRequest) {
  let body: { impressionId?: string };
  try {
    body = (await request.json()) as { impressionId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.impressionId) {
    return NextResponse.json({ error: "impressionId is required." }, { status: 400 });
  }

  try {
    const result = await recordAdCompletion(body.impressionId);
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "Impression not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("POST /api/ads/complete failed", err);
    return NextResponse.json({ error: "Failed to record the completion." }, { status: 500 });
  }
}
