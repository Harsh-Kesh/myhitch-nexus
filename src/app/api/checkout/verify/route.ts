// GET /api/checkout/verify?session_id=... — called by the video page right after a
// Stripe Checkout redirect back (see commerce.ts's fulfillCheckoutSession() header
// comment). Real accounts only; only ever confirms/fulfills the caller's own session.
import { NextResponse, type NextRequest } from "next/server";
import { verifyCheckoutSession, StripeNotConfiguredError } from "@/lib/server/commerce";
import { getRequestAccount } from "@/lib/server/rbac";

export async function GET(request: NextRequest) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required." }, { status: 400 });
  }

  try {
    const result = await verifyCheckoutSession(sessionId, account.id);
    if ("outcome" in result && result.outcome === "not_your_session") {
      return NextResponse.json({ error: "That checkout session doesn't belong to you." }, { status: 403 });
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
    }
    console.error("GET /api/checkout/verify failed", err);
    return NextResponse.json({ error: "Failed to verify checkout." }, { status: 500 });
  }
}
