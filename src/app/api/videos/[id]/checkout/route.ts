// POST /api/videos/[id]/checkout — creates a real Stripe Checkout session for buying,
// renting, or unlocking PPV access to a video. Real accounts only.
import { NextResponse, type NextRequest } from "next/server";
import { createCheckoutSession, StripeNotConfiguredError, type CheckoutKind } from "@/lib/server/commerce";
import { getRequestAccount } from "@/lib/server/rbac";

const VALID_KINDS: CheckoutKind[] = ["buy", "rent", "ppv"];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await getRequestAccount(request);
  if (!account) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;

  let body: { kind?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const kind = body.kind === "ticket" ? "ppv" : body.kind;
  if (!kind || !VALID_KINDS.includes(kind as CheckoutKind)) {
    return NextResponse.json({ error: "kind must be buy, rent or ppv." }, { status: 400 });
  }

  try {
    const result = await createCheckoutSession(account.id, id, kind as CheckoutKind);
    switch (result.outcome) {
      case "video_not_found":
        return NextResponse.json({ error: "Video not found." }, { status: 404 });
      case "own_video":
        return NextResponse.json({ error: "You already have full access to your own video." }, { status: 400 });
      case "not_for_sale":
        return NextResponse.json({ error: "This video isn't available for that access type." }, { status: 400 });
      case "already_entitled":
        return NextResponse.json({ error: "You already have access to this video." }, { status: 409 });
      case "unsupported_currency":
        return NextResponse.json(
          { error: `Checkout doesn't support ${result.currency} yet.` },
          { status: 400 },
        );
      case "success":
        return NextResponse.json({ url: result.url });
    }
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "Payments aren't set up yet. Try again later." }, { status: 503 });
    }
    console.error(`POST /api/videos/${id}/checkout failed`, err);
    return NextResponse.json({ error: "Failed to start checkout." }, { status: 500 });
  }
}
