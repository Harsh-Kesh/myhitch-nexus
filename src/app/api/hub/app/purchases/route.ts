// GET /api/hub/app/purchases/ — the signed-in MYHitch app customer's rentals and
// purchases (docs/api/nexus.md): status pending / paid / failed / refunded, expiresAt
// for a rental. The app reads this right after the payment sheet until the movie shows
// as paid, so it also records any of their app payments Stripe has taken that the
// webhook hasn't delivered yet (appViewers.ts's reconcileAppPayments()).
import { NextResponse, type NextRequest } from "next/server";
import { listAppPurchases, requireHubViewer } from "@/lib/server/appViewers";

export async function GET(request: NextRequest) {
  const { viewer, response } = await requireHubViewer(request);
  if (response) return response;
  try {
    return NextResponse.json({ purchases: await listAppPurchases(viewer) });
  } catch (err) {
    console.error("GET /api/hub/app/purchases failed", err);
    return NextResponse.json({ error: "Couldn't load your movies. Try again." }, { status: 500 });
  }
}
