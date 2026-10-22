// POST /api/hub/app/movies/[id]/checkout/ — the signed-in MYHitch app customer starts
// renting or buying a movie, body { kind: "rent" | "buy" } (docs/api/nexus.md). Priced
// from the creator's video_pricing, never by the app. Returns Stripe PaymentSheet params
// { clientSecret, publishableKey, customerId, ephemeralKey, paymentIntentId }; nothing
// is recorded until it's paid — the Stripe webhook (payment_intent.succeeded) or the
// app's own read-back of GET /api/hub/app/purchases/ does that (appViewers.ts). A movie
// priced at zero is unlocked at once and the response has no clientSecret.
// The same pricing and refusals back the MYHitch Wallet quote (../../../wallet/quote/).
import { NextResponse, type NextRequest } from "next/server";
import { appSaleRefusal, parseAppKind, requireHubViewer, startAppCheckout } from "@/lib/server/appViewers";
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
  const parsed = parseAppKind(body?.kind);
  if (parsed.response) return parsed.response;
  const { kind } = parsed;

  // Nexus had no publishable key before the app (website payments are hosted Checkout).
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) return billingNotConfigured();

  try {
    const result = await startAppCheckout(viewer, id, kind);
    switch (result.outcome) {
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
      default:
        return appSaleRefusal(result, kind);
    }
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) return billingNotConfigured();
    console.error(`POST /api/hub/app/movies/${id}/checkout failed`, err);
    return NextResponse.json({ error: "Couldn't start the payment. Try again." }, { status: 500 });
  }
}
