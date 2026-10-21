// POST /api/hub/app/movies/[id]/checkout/ — the signed-in MYHitch app customer starts
// renting or buying a movie, body { kind: "rent" | "buy" } (docs/api/nexus.md). Priced
// from the creator's video_pricing, never by the app. Returns Stripe PaymentSheet params
// { clientSecret, publishableKey, customerId, ephemeralKey, paymentIntentId }; nothing
// is recorded until it's paid — the Stripe webhook (payment_intent.succeeded) or the
// app's own read-back of GET /api/hub/app/purchases/ does that (appViewers.ts). A movie
// priced at zero is unlocked at once and the response has no clientSecret.
import { NextResponse, type NextRequest } from "next/server";
import { requireHubViewer, startAppCheckout } from "@/lib/server/appViewers";
import { StripeNotConfiguredError } from "@/lib/server/commerce";

function billingNotConfigured() {
  return NextResponse.json(
    { code: "billing_not_configured", error: "Paying in the app isn't switched on yet." },
    { status: 503 },
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { viewer, response } = await requireHubViewer(request);
  if (response) return response;
  const { id } = await params;

  let body: { kind?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const kind = body?.kind;
  if (kind !== "rent" && kind !== "buy") {
    return NextResponse.json({ error: "Choose to rent or buy this movie." }, { status: 400 });
  }

  // Nexus had no publishable key before the app (website payments are hosted Checkout).
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) return billingNotConfigured();

  try {
    const result = await startAppCheckout(viewer, id, kind);
    switch (result.outcome) {
      case "not_found":
        return NextResponse.json({ error: "This movie isn't available." }, { status: 404 });
      case "not_for_sale":
        return NextResponse.json(
          { error: kind === "rent" ? "This movie can't be rented." : "This movie can't be bought." },
          { status: 400 },
        );
      case "own_video":
        return NextResponse.json({ error: "This is your own movie - you can already watch it." }, { status: 400 });
      case "already_entitled":
        return NextResponse.json({ error: "You already own this movie." }, { status: 409 });
      case "payment_in_progress":
        return NextResponse.json({ error: "Your payment for this movie is still going through." }, { status: 409 });
      case "free":
        return NextResponse.json({ publishableKey });
      case "payment":
        return NextResponse.json({
          clientSecret: result.clientSecret,
          publishableKey,
          customerId: result.customerId,
          ephemeralKey: result.ephemeralKey,
          paymentIntentId: result.paymentIntentId,
        });
    }
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) return billingNotConfigured();
    console.error(`POST /api/hub/app/movies/${id}/checkout failed`, err);
    return NextResponse.json({ error: "Couldn't start the payment. Try again." }, { status: 500 });
  }
}
