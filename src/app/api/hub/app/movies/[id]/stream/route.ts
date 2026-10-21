// GET /api/hub/app/movies/[id]/stream/ — a short-lived playback link for a movie the
// signed-in MYHitch app customer bought or has a live rental of (docs/api/nexus.md).
// Same gate as the website's player (playbackAuthorization.ts): a rental that ran out,
// or someone else's purchase, is a 403.
import { NextResponse, type NextRequest } from "next/server";
import { requireHubViewer } from "@/lib/server/appViewers";
import { mintVideoStreamUrl } from "@/lib/server/playbackAuthorization";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { viewer, response } = await requireHubViewer(request);
  if (response) return response;
  const { id } = await params;

  try {
    // No country: the request comes from the hub's server, not the customer's phone, so
    // its location says nothing about where they are (geo-restriction fails open, as it
    // does on the website when the country is unknown).
    const result = await mintVideoStreamUrl(viewer.accountId, id, null);
    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "This movie isn't available." }, { status: 404 });
      case "not_entitled":
        return NextResponse.json(
          {
            error:
              result.blockReason === "age-gate"
                ? "This movie isn't available for this profile."
                : result.blockReason === "geo-restricted"
                  ? "This movie isn't available in your country."
                  : "Rent or buy this movie to watch it.",
          },
          { status: 403 },
        );
      case "not_processed":
        return NextResponse.json({ error: "This movie isn't ready to play yet. Try again soon." }, { status: 409 });
      case "success":
        return NextResponse.json({ url: result.url, expiresAt: result.expiresAt });
    }
  } catch (err) {
    console.error(`GET /api/hub/app/movies/${id}/stream failed`, err);
    return NextResponse.json({ error: "Couldn't start this movie. Try again." }, { status: 500 });
  }
}
