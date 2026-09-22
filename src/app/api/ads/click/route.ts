// POST /api/ads/click — the player calls this if the viewer clicks through on a playing
// ad, before opening clickThroughUrl. No revenue/budget effect (only impressions are
// charged) — a real record for CTR reporting.
import { NextResponse, type NextRequest } from "next/server";
import { recordAdClick } from "@/lib/server/adsServing";

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
    const result = await recordAdClick(body.impressionId);
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "Impression not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("POST /api/ads/click failed", err);
    return NextResponse.json({ error: "Failed to record the click." }, { status: 500 });
  }
}
